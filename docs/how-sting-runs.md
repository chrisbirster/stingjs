# How a StingJS app becomes a native iOS app

This document explains the part of StingJS that is easiest to lose track of:

> What happens after we write a SolidJS app and run Vite, but before UIKit appears on screen?

It is written in two layers:

1. an ELI5 mental model, and
2. the exact technical pipeline used by the current iOS proof.

The goal is that a contributor should be able to open this repository, read this document, and understand which part of the system owns each step.

---

## The most important idea

The StingJS example **looks like a web project**, because it uses:

- TypeScript,
- TSX,
- SolidJS,
- Vite.

But the built application is **not a web app at runtime**.

There is no HTML document, no DOM, no browser renderer, and no WebView involved in the iOS application.

Vite is being used as a JavaScript compiler and bundler.

It takes this:

```tsx
<View>
  <Text>Count: {count()}</Text>
  <Button onPress={increment}>Add</Button>
</View>
```

and produces one JavaScript bundle:

```text
sting-app.js
```

That JavaScript bundle is then loaded by a native iOS application. The JavaScript tells Sting what native objects should exist. Sting creates real `UIView`, `UIStackView`, `UILabel`, and `UIButton` objects.

A good first mental model is:

```text
SolidJS source code
        ↓
Vite turns it into portable JavaScript
        ↓
Xcode puts that JavaScript inside the .app
        ↓
Sting starts a JavaScript engine inside the native app
        ↓
JavaScript asks Sting for native views
        ↓
Swift creates UIKit objects
        ↓
You see a normal native iOS interface
```

Vite does **not** create the iOS user interface.

UIKit does.

---

# ELI5: imagine a restaurant

Think of the app as a restaurant.

## SolidJS is the customer writing the order

Your Solid app says:

```text
I want:
- one container
- one text label
- one button
```

Solid also remembers relationships such as:

```text
this label depends on the count signal
```

Solid does not know how to create a `UILabel`.

It only knows that the value changed and that its renderer needs to update something.

## `@stingjs/solid` is the waiter

The waiter understands Solid's language and Sting's language.

Solid might effectively say:

```text
create an element called text
```

The Sting adapter turns that into a call to the Sting host.

The adapter is intentionally small. We want application code to depend on Solid and Sting APIs, not on the details of Solid's custom-renderer implementation.

## `@stingjs/core` is the ticket system

The ticket system gives every object a number:

```text
1 = View
2 = Text
3 = text node inside Text
4 = Button
5 = text node inside Button
```

Those IDs are important because JavaScript and native code cannot simply share normal JavaScript objects.

Instead they can both agree that:

```text
node 3
```

means the same thing.

The core also keeps a lightweight tree in JavaScript so Solid can ask questions such as:

```text
Who is my parent?
What is my next sibling?
```

without repeatedly asking native code.

## `__stingNativeBridge` is the order window

JavaScript sends very small commands through the window:

```text
createElement(1, "view")
createElement(2, "text")
createTextNode(3, "Count: 0")
insertNode(2, 3)
insertNode(1, 2)
```

JavaScript does not send a React-style virtual DOM tree to Swift and ask Swift to diff it.

It sends concrete mutations.

## Swift is the kitchen

Swift receives:

```text
createElement(2, "text")
```

and creates a real:

```swift
UILabel()
```

For:

```text
createElement(4, "button")
```

it creates a real UIKit button.

The native side keeps its own map:

```text
1 → UIStackView
2 → UILabel
4 → UIButton
```

## UIKit is the plate that reaches the table

UIKit does the actual native drawing, layout, touch handling, accessibility, and OS integration.

That is why StingJS is not a WebView wrapper.

The final screen is made from native UIKit objects.

---

# The complete pipeline

Here is the current path from source file to native pixels:

```text
examples/hello-world/src/App.tsx
                │
                ▼
        SolidJS JSX compiler
        through Vite plugin
                │
                │ universal renderer target
                │ moduleName = @stingjs/solid
                ▼
         @stingjs/native
      View / Text / Button
                │
                ▼
          @stingjs/solid
      Solid universal renderer
                │
                ▼
           @stingjs/core
      StingHost + shadow tree
                │
                ▼
        __stingNativeBridge
                │
      JavaScript/native boundary
                ▼
      StingJavaScriptBridge.swift
                │
                ▼
        StingNodeRegistry.swift
                │
                ▼
  UIStackView / UILabel / UIButton
                │
                ▼
              UIKit
```

There are two separate phases to understand:

```text
BUILD TIME
TSX → JavaScript bundle → copied into iOS app

RUN TIME
iOS launches → JavaScript engine evaluates bundle → bundle creates native views
```

Mixing those two phases together is the easiest way to get confused.

---

# Phase 1: write the Solid application

The example application is in:

```text
examples/hello-world/src/App.tsx
```

It is ordinary Solid-style application code:

```tsx
const [count, setCount] = createSignal(0);

return (
  <View>
    <Text>Count: {count()}</Text>
    <Button
      onPress={() => {
        setCount(count() + 1);
        Haptics.impact('medium');
      }}
    >
      Add
    </Button>
  </View>
);
```

The important difference from a browser Solid app is the components being imported:

```ts
import { Button, Text, View } from '@stingjs/native';
```

These are not HTML elements.

`View`, `Text`, and `Button` return Sting host nodes.

Conceptually:

```text
<View>   != <div>
<Text>   != <span>
<Button> != HTMLButtonElement
```

On iOS they ultimately become native UIKit objects.

---

# Phase 2: `index.tsx` starts Sting rendering

The entry point is:

```text
examples/hello-world/src/index.tsx
```

It does roughly this:

```tsx
import { renderApp } from '@stingjs/solid';
import App from './App.js';

renderApp(() => <App />);
```

`renderApp` is the moment the application asks Solid to render into the Sting host.

There is no call such as:

```ts
document.getElementById(...)
```

because there is no DOM.

Instead the renderer gets a special Sting root node whose ID is `0`.

---

# Phase 3: Vite compiles the TSX for a custom Solid renderer

The important Vite configuration is:

```text
examples/hello-world/vite.config.ts
```

The Solid Vite plugin is configured with:

```ts
solidPlugin({
  solid: {
    moduleName: '@stingjs/solid',
    generate: 'universal',
  },
})
```

That configuration is crucial.

A normal Solid browser build targets DOM operations.

Sting instead says:

```text
Generate code for a universal/custom renderer,
and get the renderer functions from @stingjs/solid.
```

So when Solid-compiled code needs to create an element, insert something, update text, or set a property, it uses Sting's renderer implementation rather than the browser DOM implementation.

The Vite build is configured as a library-style IIFE bundle:

```ts
build: {
  target: 'es2022',
  lib: {
    entry: 'src/index.tsx',
    formats: ['iife'],
    fileName: () => 'sting-app.js',
  },
}
```

The result is:

```text
examples/hello-world/dist/sting-app.js
```

This bundle contains the JavaScript necessary to run the application, including the relevant Solid/Sting runtime code pulled in by the module graph.

It is just JavaScript.

It does not contain an iOS binary and it does not draw anything by itself.

---

# Phase 4: Xcode builds the native shell and embeds `sting-app.js`

The iOS application lives under:

```text
examples/hello-world/ios/
```

The Xcode project contains a build phase named:

```text
Build Sting JavaScript bundle
```

That phase effectively does:

```sh
cd <repo root>
npm run build --workspace @stingjs/example-hello-world
cp examples/hello-world/dist/sting-app.js \
   <built iOS app resources>/sting-app.js
```

So Xcode produces a normal native iOS `.app`, but one of its resource files is our JavaScript application bundle.

Conceptually the finished application bundle contains something like:

```text
StingHelloWorld.app/
├── StingHelloWorld       ← compiled native iOS executable
├── Frameworks / Swift packages
├── Info.plist
└── sting-app.js          ← compiled Solid/Sting application
```

This is similar to shipping JSON, images, or another resource with a native application, except this resource contains executable JavaScript that Sting evaluates at startup.

---

# Phase 5: iOS launches the native app first

The first code executing when the app opens is native Swift code, not `App.tsx`.

`AppDelegate.swift` creates:

```swift
let host = StingHostViewController(nativeModules: [HapticsModule()])
```

It makes that controller the root view controller and then locates:

```text
sting-app.js
```

inside `Bundle.main`.

It finally asks the host to load the bundle.

So the startup order is:

```text
iOS
 ↓
AppDelegate.swift
 ↓
StingHostViewController
 ↓
StingJavaScriptRuntime
 ↓
sting-app.js
```

Not the other way around.

---

# Phase 6: `StingHostViewController` creates the native root

`StingHostViewController` creates a real `UIStackView` called the root stack.

That view is attached to the controller's safe area using normal Auto Layout constraints.

Then it creates:

```swift
StingJavaScriptRuntime(rootView: rootStack, modules: nativeModules)
```

The root `UIStackView` corresponds to Sting's special host node:

```text
node 0 = root
```

Everything the Solid application renders gets inserted below that native root.

---

# Phase 7: create a JavaScript engine inside the native process

The first iOS semantic proof currently uses Apple's JavaScriptCore.

`StingJavaScriptRuntime` creates:

```swift
JSContext()
```

That context is an embedded JavaScript runtime living inside the same iOS process as the UIKit application.

This is an important distinction:

```text
JavaScript engine ≠ browser
```

A JavaScript engine can execute ECMAScript without having:

- HTML,
- DOM,
- CSS,
- `window`,
- browser layout,
- a WebView.

JavaScriptCore is simply executing the application logic.

The native runtime also installs any host primitives Sting needs. For example, the current JavaScriptCore host supplies `queueMicrotask` using the engine's Promise job queue because Solid 2 expects that scheduling primitive.

---

# Phase 8: Swift exposes `__stingNativeBridge` to JavaScript

Before `sting-app.js` executes, Swift creates a `StingJavaScriptBridge` object and installs it into the JavaScript global environment as:

```js
globalThis.__stingNativeBridge
```

The bridge exposes a deliberately tiny API:

```text
getRuntimeInfo
createElement
createTextNode
replaceText
setProperty
insertNode
removeNode
setEventEnabled
callModuleSync
```

This is the narrow waist of Sting.

The application does not receive raw `UIView` pointers.

Swift does not receive arbitrary Solid objects.

They communicate using stable node IDs, strings, booleans, numbers, and JSON-compatible values.

This separation is what allows us to evaluate different JavaScript engines without redesigning the renderer contract.

---

# Phase 9: `sting-app.js` executes

Now the native runtime evaluates the bundle.

The bundle eventually reaches:

```ts
renderApp(() => <App />)
```

`renderApp` calls into `@stingjs/core` to obtain the active Sting host.

The first time `getHost()` runs, core sees:

```js
globalThis.__stingNativeBridge
```

and constructs a `StingHost` around it.

Before rendering, the host asks native for runtime information and verifies the bridge protocol version.

This catches a case such as:

```text
JavaScript packages expect protocol 2
but native application only implements protocol 1
```

before strange bridge failures happen later.

---

# Phase 10: Solid calls the Sting renderer

`@stingjs/solid` uses Solid's universal renderer.

It provides Solid with operations such as:

```text
createElement
createTextNode
replaceText
setProperty
insertNode
removeNode
getParentNode
getFirstChild
getNextSibling
```

When Solid says:

```text
create a view
```

Sting performs roughly:

```ts
const node = getHost().createElement('view');
```

The Sting host assigns the next numeric ID and records the node in its lightweight JavaScript tree.

Then it calls:

```text
__stingNativeBridge.createElement(id, "view")
```

This is the first time the request crosses from JavaScript into Swift.

---

# Phase 11: `@stingjs/native` defines what a View/Text/Button means

The public components are implemented in:

```text
packages/native/src/index.tsx
```

For example, `View` ultimately creates the host element type:

```text
view
```

`Button` creates:

```text
button
```

`Text` is especially important for Solid's fine-grained behavior.

A Sting `Text` owns one persistent text node. Its dynamic value is bound through a Solid render effect.

So this:

```tsx
<Text>Count: {count()}</Text>
```

is not rebuilt from scratch every time `count` changes.

The existing native text node is updated with:

```text
replaceText(nodeId, "Count: 1")
```

That is a central StingJS performance goal.

---

# Where Solid reactivity actually runs

Solid's reactive system does **not** get translated into native signal, memo, or effect objects.

`createSignal`, `createMemo`, `createEffect`, `createRenderEffect`, ownership, dependency tracking, and cleanup all remain ordinary Solid JavaScript running inside the active JavaScript engine. In the current iOS proof that engine is JavaScriptCore. In the QuickJS and QuickJS-NG runtime prototypes, the same Solid graph runs inside those engines.

The native runtime therefore does not know what a Solid signal or effect is. It only sees the concrete host operations produced after Solid decides that a dependent computation needs to run.

For a dynamic text binding, the conceptual relationship is:

```ts
createRenderEffect(
  () => count(),
  value => {
    getHost().replaceText(textNode, `Count: ${value}`);
  },
);
```

The exact generated/bound code can differ, but the ownership boundary is the important part:

```text
Solid signal / memo / effect
        │
        │ stays inside JavaScript
        ▼
Solid dependency graph decides what changed
        │
        ▼
@solidjs/universal + @stingjs/solid
        │
        ▼
StingHost concrete mutation
        │
        ├── replaceText
        ├── setProperty
        ├── insertNode
        └── removeNode
        │
        ▼
JavaScript/native boundary
```

For the QuickJS prototype, a text update travels conceptually through:

```text
Solid computation inside QuickJS
        ↓
@stingjs/solid
        ↓
StingHost.replaceText(...)
        ↓
__stingNativeBridge.replaceText(...)
        ↓
__stingHostCall("replaceText", ...)
        ↓
QuickJS C API
        ↓
Zig host
        ↓
platform native mutation path
```

The current verified UIKit path has the same Solid-side semantics but a different engine embedding:

```text
Solid computation inside JavaScriptCore
        ↓
@stingjs/solid
        ↓
StingHost.replaceText(...)
        ↓
__stingNativeBridge.replaceText(...)
        ↓
Swift StingJavaScriptBridge
        ↓
StingNodeRegistry
        ↓
UILabel / UIButton / UIView
```

This is why changing JavaScript engines should not change application-level Solid semantics. The engine executes the JavaScript and Solid reactive graph; Sting owns the narrow host contract below it.

Native events make the loop run in the opposite direction first:

```text
native button press
        ↓
__stingDispatchEvent
        ↓
Solid event handler inside JavaScript
        ↓
setSignal(...)
        ↓
Solid marks only dependent computations dirty
        ↓
flush / batch settlement
        ↓
render effect applies the changed value
        ↓
precise native mutation
```

Sting's `renderApp()` establishes the native-event flush boundary because Solid 2 batches writes. A native event can update several signals, Solid settles the affected graph, and only the resulting concrete mutations cross the bridge.

This distinction is central to Sting's architecture:

```text
Solid reactivity stays in the JavaScript engine.
Native receives mutations, not Solid's reactive graph.
```

That is what allows a one-row change in a 10,000-row Solid graph to remain one native `replaceText` instead of becoming a broad component rerender or virtual-tree reconciliation pass.

---

# Phase 12: the JavaScript host keeps a shadow tree

`@stingjs/core` creates host-node records similar to:

```ts
{
  id: 3,
  type: '#text',
  parent: ...,
  children: ...
}
```

This is **not a React virtual DOM**.

It is a lightweight structural bookkeeping tree.

Its job is mainly to answer renderer questions locally:

```text
Who is my parent?
What is my first child?
What is my next sibling?
```

It does not run a general tree diff after each state change.

Solid already knows exactly which reactive computation changed.

That is why Sting wants the hot path to look like:

```text
signal changed
    ↓
exact dependent computation runs
    ↓
exact native mutation is emitted
```

rather than:

```text
state changed
    ↓
build another virtual tree
    ↓
diff old and new trees
    ↓
apply changes
```

---

# Phase 13: Swift converts Sting node types into UIKit objects

`StingJavaScriptBridge.swift` receives calls from JavaScript and forwards them to `StingNodeRegistry.swift`.

The native registry maps Sting types to UIKit types.

Current examples include:

```text
Sting type     iOS object
----------     ----------------
view           UIStackView
text           UILabel
button         StingButton / UIButton
#text          stored text node
root           root UIStackView
```

So a JavaScript call such as:

```text
createElement(7, "button")
```

results in native code creating a real button and storing something conceptually like:

```text
nativeNodes[7] = UIButton(...)
```

Later calls use the same ID:

```text
setProperty(7, ...)
insertNode(..., 7, ...)
setEventEnabled(7, "press", true)
```

That stable identity is what connects the two worlds.

---

# Phase 14: native insertion produces the visible hierarchy

Creating a view is not enough; it also needs to be inserted into its parent.

JavaScript sends:

```text
insertNode(parentId, nodeId, anchorId)
```

The native registry updates its child bookkeeping and inserts the actual UIKit view.

For a `UIStackView`, it uses arranged subviews.

At this point UIKit owns the visual hierarchy and lays it out normally.

The JavaScript engine is not painting pixels.

---

# What an initial mount looks like

The exact IDs may vary, but conceptually mounting the hello-world app can look like this:

```text
JS/Solid                        Swift/UIKit
--------                        -----------

createElement(1, "view")   →    node 1 = UIStackView
setProperty(1, "style", ...)

createElement(2, "text")   →    node 2 = UILabel
createTextNode(3, "")       →    text node 3
insertNode(2, 3)
replaceText(3, "Count: 0") →    UILabel.text = "Count: 0"
insertNode(1, 2)

createElement(4, "button") →    node 4 = UIButton
createTextNode(5, "Add")
insertNode(4, 5)             →    UIButton title = "Add"
setEventEnabled(4, "press", true)
insertNode(1, 4)

insertNode(0, 1)             →    root UIStackView now contains app
```

This is a simplified trace, but it is the right mental model.

---

# The reverse trip: tapping the native button

The most important runtime loop goes in both directions.

Initially JavaScript told native:

```text
node 4 has a press handler
```

The actual JavaScript function remains in JavaScript. Swift does not hold the Solid callback itself.

When the user taps the real `UIButton`:

```text
1. UIKit emits touchUpInside
2. StingButton calls its Swift onPress hook
3. StingNodeRegistry emits (nodeId, "press", "null")
4. StingJavaScriptRuntime calls globalThis.__stingDispatchEvent(...)
5. @stingjs/core finds the JS callback stored for that node/event
6. the Solid onPress function executes
```

For the example app, the callback does:

```ts
setCount(count() + 1);
Haptics.impact('medium');
```

So one native event starts two paths:

```text
                     native UIButton press
                              │
                              ▼
                    __stingDispatchEvent
                              │
                    JavaScript callback
                         ┌────┴────┐
                         │         │
                         ▼         ▼
                     setCount    Haptics
                         │         │
                         ▼         ▼
                    Solid update  native module call
```

---

# Why `Count: 0` becomes `Count: 1` without rerendering everything

The text expression reads the Solid signal:

```tsx
<Text>Count: {count()}</Text>
```

Solid records that dependency.

When `setCount` runs, Solid knows that the text computation is affected.

Sting's `Text` binding updates its already-existing host text node.

The desired hot path is therefore:

```text
setCount(1)
   ↓
Solid reruns only dependent text computation
   ↓
replaceText(textNodeId, "Count: 1")
   ↓
Swift receives one replaceText call
   ↓
UILabel.text = "Count: 1"
```

The button is not recreated.

The container is not recreated.

The event handler is not rebound.

The entire native tree is not replayed.

This is exactly what the current semantic benchmark checks.

For the 10,000-row benchmark:

```text
update 1 row
→ exactly 1 replaceText

update 100 rows
→ exactly 100 replaceText calls
```

with no unrelated create/remove/insert/property/event mutations on the hot path.

That test is not just a benchmark. It protects the architecture from gradually turning into broad reconciliation.

---

# Native modules are a parallel path

UI rendering is only one direction through the bridge.

Native capabilities such as Haptics use the module path.

Application code says:

```ts
Haptics.impact('medium');
```

The TypeScript package calls:

```text
getHost().callModuleSync("Haptics", "impact", ["medium"])
```

The route is:

```text
@stingjs/haptics TypeScript
        ↓
@stingjs/core
        ↓
__stingNativeBridge.callModuleSync
        ↓
StingJavaScriptBridge.swift
        ↓
StingModuleRegistry
        ↓
HapticsModule.swift
        ↓
UIImpactFeedbackGenerator
```

Again, application developers should not need to write Swift just to trigger haptics.

The framework package owns both sides of that capability.

---

# What each tool is actually doing

## SolidJS

Owns:

- signals,
- dependency tracking,
- components,
- reactive computations,
- JSX semantics.

Does not own:

- UIKit,
- the native bridge,
- iOS packaging.

## Vite

Owns:

- compiling/bundling the TypeScript/TSX module graph,
- invoking the Solid Vite transform,
- producing `sting-app.js`.

Does not own:

- the iOS app lifecycle,
- UIKit views,
- native touch events,
- the JavaScript engine used on the phone.

## `@stingjs/native`

Owns:

- the public native component vocabulary,
- types/props for `View`, `Text`, `Button`, etc.,
- mapping those components to Sting host element types.

## `@stingjs/solid`

Owns:

- the adapter between Solid's universal renderer and Sting,
- the fine-grained text binding,
- the Solid event flush boundary.

## `@stingjs/core`

Owns:

- node IDs,
- the JavaScript shadow host tree,
- event callback registration,
- native bridge contract,
- protocol negotiation,
- native module calls.

## Xcode

Owns:

- compiling Swift/native code,
- linking native packages,
- signing/packaging the iOS app,
- running the Vite build phase,
- copying `sting-app.js` into the application bundle.

## JavaScriptCore / QuickJS / QuickJS-NG / Hermes

A JavaScript engine owns:

- executing JavaScript,
- objects/functions,
- garbage collection,
- Promises/microtasks according to the embedding configuration.

The engine should not decide how a Sting `Text` maps to UIKit.

That is a separate Sting responsibility.

## Swift Sting runtime

Currently owns the proven iOS native boundary:

- native root view,
- engine setup for the JavaScriptCore proof,
- bridge exposure,
- UIKit node registry,
- native event delivery,
- module registry.

## UIKit

Owns the actual native UI.

---

# Why are we testing several JavaScript engines?

The renderer architecture should not depend on a public promise that one specific JavaScript engine will always be used.

The first iOS proof uses JavaScriptCore because it gives us a small path to prove the native architecture on Apple platforms.

The runtime-engine evaluation also has isolated hosts for:

- official QuickJS,
- QuickJS-NG,
- Hermes.

As of the current runtime evaluation, all three candidate hosts have successfully executed the real Sting semantic workload on macOS:

```text
counter update       → exactly 1 replaceText
Haptics              → medium impact call observed
10k sparse update    → exactly 1 replaceText
10k dense update     → exactly 100 replaceText
```

That proves compatibility with the current Solid/Sting semantics.

It does **not** choose the production engine.

Selection still needs comparable startup, memory, bridge/module latency, frame/list behavior, binary size, lifecycle, and physical-device release-build evidence.

The important architecture point is:

```text
Solid application
      ↓
Sting contracts
      ↓
JavaScript-engine embedding
      ↓
native platform
```

not:

```text
application imports Hermes-specific APIs
```

---

# Where Zig fits

The long-term Sting goal includes a portable Zig-centered runtime layer where it gives us useful cross-platform ownership and a stable C boundary.

Do not confuse that target with the state of the first iOS proof.

Today, the verified UIKit proof uses:

```text
TypeScript/Solid
      ↓
Sting bridge contract
      ↓
Swift + JavaScriptCore
      ↓
UIKit
```

The QuickJS and QuickJS-NG prototypes exercise direct Zig/C embedding paths, and Hermes uses a small C++/JSI adapter behind a C ABI so Zig does not need to absorb Hermes C++ types.

Those prototypes are evidence for the next runtime architecture step. They are not yet a reason to hide the current Swift iOS implementation when explaining how the application works today.

A contributor should always distinguish:

```text
CURRENT VERIFIED PATH
```

from:

```text
TARGET PORTABLE ARCHITECTURE
```

---

# Build time versus runtime

This table is worth remembering.

| Step | Build time or runtime? | Who does it? |
| --- | --- | --- |
| Parse TSX | Build time | Vite + Solid plugin |
| Convert JSX to universal-renderer calls | Build time | Solid compiler |
| Bundle modules into `sting-app.js` | Build time | Vite |
| Compile Swift | Build time | Xcode |
| Copy `sting-app.js` into `.app` | Build time | Xcode build phase |
| Start iOS process | Runtime | iOS |
| Create root UIKit view | Runtime | Sting Swift runtime |
| Create JavaScript engine | Runtime | Sting Swift runtime / selected engine host |
| Expose `__stingNativeBridge` | Runtime | Sting native runtime |
| Evaluate `sting-app.js` | Runtime | JavaScript engine |
| Execute `renderApp()` | Runtime | JavaScript/Solid |
| Create host node IDs | Runtime | `@stingjs/core` |
| Create UIKit views | Runtime | Swift `StingNodeRegistry` |
| Handle touch | Runtime | UIKit/Swift |
| Run Solid event callback | Runtime | JavaScript engine |
| Update one dependent text node | Runtime | Solid + Sting bridge + UIKit |

---

# File map for contributors

If you are debugging a specific step, start here.

```text
examples/hello-world/src/App.tsx
    Application UI and signal/event code.

examples/hello-world/src/index.tsx
    Calls renderApp().

examples/hello-world/vite.config.ts
    Tells Solid to compile for @stingjs/solid's universal renderer
    and tells Vite to produce sting-app.js.

packages/native/src/index.tsx
    Public View/Text/Button implementation.

packages/solid/src/index.ts
    Adapter between Solid universal rendering and StingHost.

packages/core/src/host.ts
    Host nodes, node IDs, shadow tree, events, native module calls.

packages/core/src/runtime.ts
    Discovers __stingNativeBridge, validates protocol, installs
    __stingDispatchEvent.

packages/core/src/bridge.ts
    Engine-neutral JS/native bridge interface.

examples/hello-world/ios/StingHelloWorld.xcodeproj/project.pbxproj
    Xcode build phase that creates and copies sting-app.js.

examples/hello-world/ios/StingHelloWorld/AppDelegate.swift
    Native app startup and loading of sting-app.js.

native/ios/Sources/StingRuntime/StingHostViewController.swift
    Native root UI and JavaScript runtime ownership.

native/ios/Sources/StingRuntime/StingJavaScriptRuntime.swift
    Current JavaScriptCore embedding and global bridge/event wiring.

native/ios/Sources/StingRuntime/StingJavaScriptBridge.swift
    JSExport bridge implementation.

native/ios/Sources/StingRuntime/StingNodeRegistry.swift
    Converts Sting node mutations into UIKit objects/changes.

packages/modules/haptics/src/index.ts
    TypeScript Haptics API.

packages/modules/haptics/ios/HapticsModule.swift
    Actual iOS haptics implementation.
```

---

# Debugging by asking “which boundary failed?”

When something breaks, avoid treating Sting as one giant system. Find the boundary.

## The Vite build fails

Look at:

```text
App.tsx
vite.config.ts
@stingjs/solid compiler integration
TypeScript/package dependencies
```

UIKit is not involved yet.

## `sting-app.js` exists but the iOS app cannot find it

Look at:

```text
Xcode Build Sting JavaScript bundle phase
copy destination
Bundle.main lookup
```

Solid rendering is not the first suspect.

## JavaScript says the Sting bridge is missing

Look at:

```text
StingJavaScriptRuntime
__stingNativeBridge installation
engine bootstrap order
```

The bridge must exist **before** `sting-app.js` is evaluated.

## `createElement` happens but nothing appears

Look at:

```text
StingJavaScriptBridge
StingNodeRegistry
insertNode calls
UIKit hierarchy/layout
```

## A native button appears but pressing it does nothing

Trace:

```text
setEventEnabled
→ StingButton
→ eventSink
→ __stingDispatchEvent
→ StingHost.dispatchEvent
→ stored JS callback
```

## A signal changes but native text does not

Trace:

```text
Solid dependency
→ bindHostText
→ replaceText
→ bridge
→ StingNodeRegistry.replaceText
→ UILabel.text
```

This boundary-oriented debugging style will become increasingly important as Android and alternative engines are added.

---

# Common misconceptions

## “Vite is serving the app to iOS.”

No.

For this proof, Vite builds a JavaScript file. The file is packaged into the native app.

## “The iPhone is displaying a webpage.”

No.

UIKit is displaying native views.

## “Solid sends HTML to Swift.”

No.

Solid calls Sting renderer operations. Sting sends typed mutation commands such as `createElement`, `insertNode`, and `replaceText`.

## “Swift rerenders the whole Solid app after a tap.”

No.

The event is delivered back to JavaScript. Solid updates its reactive graph. Only resulting native mutations cross back to Swift.

## “The shadow tree is a virtual DOM.”

Not in the React reconciliation sense.

It is structural bookkeeping needed by the custom renderer. Solid's fine-grained graph determines what recomputes.

## “JavaScriptCore means Sting is Apple-only.”

No.

JavaScriptCore is the first verified iOS engine path. The bridge/renderer contract is intentionally engine-neutral, and QuickJS, QuickJS-NG, and Hermes are being evaluated separately.

## “Hermes means Sting is becoming React Native.”

No.

Hermes is a JavaScript engine. React Native is a much larger framework architecture. Sting can evaluate Hermes as an engine without adopting React Native's renderer or public API.

---

# The one diagram to remember

If everything else in this document is forgotten, remember this:

```text
                 BUILD TIME

 App.tsx / index.tsx
         │
         ▼
  Solid compiler + Vite
         │
         ▼
     sting-app.js
         │
         │ copied into
         ▼
   native iOS .app

────────────────────────────────────
                 RUNTIME

      iOS launches Swift
              │
              ▼
    create UIKit root view
              │
              ▼
    create JavaScript engine
              │
              ▼
  install __stingNativeBridge
              │
              ▼
     evaluate sting-app.js
              │
              ▼
      Solid renderApp()
              │
              ▼
       @stingjs/solid
              │
              ▼
       @stingjs/core
              │
              ▼
       node mutations
              │
              ▼
       Swift bridge
              │
              ▼
     StingNodeRegistry
              │
              ▼
   real UIKit native views

              ▲
              │
      native touch events
              │
              └── __stingDispatchEvent
                    → Solid callback
                    → signal update
                    → precise mutation
```

That loop is StingJS.

Everything else we add—navigation, images, text input, networking modules, filesystem APIs, Android, development tooling, alternate JavaScript engines—has to preserve a clear version of that model.

---

# Related documentation

- [`architecture.md`](architecture.md) — architectural boundaries and long-term rules.
- [`renderer.md`](renderer.md) — detailed renderer/host mutation contract.
- [`native-modules.md`](native-modules.md) — module contract and platform capabilities.
- [`getting-started-ios.md`](getting-started-ios.md) — how to run the current iOS proof.
- [`performance.md`](performance.md) — performance criteria and runtime-engine evaluation.
