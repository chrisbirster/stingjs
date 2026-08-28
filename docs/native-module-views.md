# Native module views

Sting native module views let a module provide a real UIKit or Android `View` while remaining inside the normal SolidJS 2 + `@solidjs/universal` renderer.

They are **not** a second renderer, a WebView surface, or an opaque native-object handle. A module view is an ordinary Sting host node, so creation, properties, node events, insertion, removal, and keyed moves use the same renderer contract as built-in `View`, `Text`, `Button`, `Image`, `TextInput`, and `ScrollView` nodes.

## JavaScript authoring

Module packages create a component once with `createNativeModuleView()` from `@stingjs/solid`:

```ts
import { createNativeModuleView } from '@stingjs/solid';

export interface CameraPreviewProps {
  mode?: 'photo' | 'video';
  onReady?: (payload: { width: number; height: number }) => void;
}

export const CameraPreview = createNativeModuleView<CameraPreviewProps>(
  'Camera',
  'Preview',
);
```

Applications then use that export as a normal Solid component:

```tsx
<CameraPreview
  mode="photo"
  onReady={payload => console.log(payload.width, payload.height)}
/>
```

The component factory encodes a Sting-owned host-element identity internally. Application and module code must not construct or depend on that string representation directly.

## Manifest capability

A package that exports module-created native views declares the schema-v1 `native-views` capability:

```json
{
  "capabilities": ["native-views"]
}
```

A rich module may combine capabilities. For example, Camera can eventually use async functions, events, permissions, native objects, and native views without introducing a Camera-specific bridge:

```json
{
  "capabilities": [
    "async-functions",
    "events",
    "permissions",
    "native-objects",
    "native-views"
  ]
}
```

`npm run modules:validate` already validates `native-views` as an allowed schema-v1 capability.

## Swift contract

A Swift module returns a `StingNativeView` from `createView(type:)`:

```swift
final class CameraPreviewView: StingNativeView {
    let view = UIView()

    func setProperty(name: String, value: Any) throws {
        switch name {
        case "mode":
            // Apply the portable module property to UIKit state.
            break
        default:
            throw StingNativeModuleError(
                code: "E_VIEW_PROPERTY_NOT_FOUND",
                message: "Unknown Camera preview property \(name)"
            )
        }
    }

    func setEventEnabled(
        event: String,
        enabled: Bool,
        emit: @escaping StingNativeViewEventEmitter
    ) throws {
        // Start/stop native observation. Call emit(payload) when enabled.
    }

    func didAttach() {
        // Resume attachment-dependent work when appropriate.
    }

    func didDetach() {
        // Pause attachment-dependent work when appropriate.
    }

    func dispose() {
        // Release final native resources. This is called once by the registry.
    }
}

final class CameraModule: StingNativeModule {
    let name = "Camera"
    let version = "0.1.0"

    func createView(type: String) throws -> any StingNativeView {
        guard type == "Preview" else {
            throw StingNativeModuleError(
                code: "E_VIEW_TYPE_NOT_FOUND",
                message: "Unknown Camera view type \(type)"
            )
        }
        return CameraPreviewView()
    }
}
```

## Kotlin contract

Kotlin uses the equivalent `StingNativeView` and receives the Android `Context` when a module view is created:

```kotlin
class CameraPreviewView(context: Context) : StingNativeView {
    override val view = FrameLayout(context)

    override fun setProperty(name: String, value: Any?) {
        // Apply portable module properties.
    }

    override fun setEventEnabled(
        event: String,
        enabled: Boolean,
        emit: StingNativeViewEventEmitter,
    ) {
        // Start/stop native observation.
    }

    override fun didAttach() {}
    override fun didDetach() {}
    override fun dispose() {}
}

class CameraModule : StingNativeModule {
    override val name = "Camera"
    override val version = "0.1.0"

    override fun createView(type: String, context: Context): StingNativeView =
        when (type) {
            "Preview" -> CameraPreviewView(context)
            else -> throw StingNativeModuleError(
                code = "E_VIEW_TYPE_NOT_FOUND",
                message = "Unknown native view type $type",
            )
        }
}
```

## Properties and styles

Module-specific properties travel through the existing Sting `setProperty` renderer path and are delivered to `StingNativeView.setProperty`.

Sting keeps the common renderer-owned `style` and `accessibilityLabel` behavior at the node-registry layer so module views participate in the same basic sizing, background, and accessibility contract as built-in native nodes. A module should not create its own JavaScript-to-native property transport.

Unknown module-specific properties should fail with a structured `E_VIEW_PROPERTY_NOT_FOUND` error.

## Node events

Component props named like `onReady` use the existing Sting node-event path:

```text
platform view callback
    -> StingNativeView emitter
    -> Sting node registry
    -> existing native node event bridge
    -> owning JS runtime thread
    -> Solid/application handler
```

This is deliberately separate from module-wide event streams such as network connectivity or notification delivery. Module-wide streams continue to use `StingNativeModule.setEventEnabled` and `@stingjs/modules-core` subscriptions.

A module view must stop native observation when an event is disabled. Sting additionally guards each emitter with the node's current attachment and enabled-event state, so a callback racing with detach or disposal becomes a no-op instead of a ghost JavaScript event.

## Attachment and disposal

`removeNode` is **not** object destruction.

Solid keyed reconciliation may detach a host node and later insert the same node identity elsewhere. Sting therefore uses three separate lifecycle concepts:

- `didAttach()` — the module view entered the active native tree;
- `didDetach()` — the module view left the active native tree and may later return;
- `dispose()` — final runtime ownership ended and the view will never be used again.

A resource-heavy view should pause attachment-dependent work in `didDetach()` and resume it in `didAttach()`. Final native resources belong in `dispose()`.

Attachment state is a subtree property. When a parent subtree is removed, every nested module view becomes detached and non-dispatchable; reinserting the subtree reattaches those descendants. This prevents nested module views from emitting ghost events while their ancestor is absent from the native tree.

Runtime teardown first lets Solid and the JavaScript host dispose the rendered tree while ordinary `removeNode` operations are still legal. The native node registry then disables remaining view events, detaches any still-attached module views, and calls `dispose()` exactly once for every live module view.

## Child content

Module views are leaf nodes by default.

A module may explicitly opt into children by returning a `childContainer`:

- Swift: `UIView?`
- Kotlin: `ViewGroup?`

Sting inserts Solid-rendered children into that container using the normal host-tree insertion/removal path. If `childContainer` is `nil`, inserting children below the module view is rejected clearly.

This keeps ownership unambiguous: the Sting renderer owns child node identity and ordering; the module only supplies the native container that receives those child views.

## Engine boundaries

Native module views do not add a new JavaScript-engine ABI.

The existing renderer transport remains authoritative:

```text
SolidJS 2 / @solidjs/universal
    -> @stingjs/solid
    -> Sting host create/property/event/insert/remove operations
    -> Zig/engine bridge already used by normal native nodes
    -> Swift/UIKit or Kotlin/Android View
```

Official QuickJS is the production engine and the only engine for which native-module-view feature parity is required. JavaScriptCore/UIKit remains the independent iOS semantic/native reference. QuickJS-NG is frozen experimental/reference code and is not extended merely to match new product capabilities.

Do not expose `UIView`, Android `View`, JNI references, QuickJS `JSValue`, JSI objects, raw pointers, or platform object identities to JavaScript.
