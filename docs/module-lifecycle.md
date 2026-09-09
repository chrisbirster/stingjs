# Module lifecycle and background delivery

Sting native modules can participate in application/runtime lifecycle without owning JavaScript-engine objects or platform host objects.

The shared lifecycle states are:

- `foreground` — the application is entering the foreground;
- `active` — the application is interactive;
- `inactive` — the application is leaving the active state temporarily;
- `background` — the application entered the background;
- `runtimeDisposing` — the owning Sting runtime is permanently tearing down.

`runtimeDisposing` is a Sting runtime-lifetime event, not a claim that the operating-system process is terminating. It is delivered at most once and is the portable cleanup point for module-owned observations/resources that are not represented by native object handles or module views.

## Swift

Implement the optional lifecycle hook on `StingNativeModule`:

```swift
func applicationLifecycleDidChange(_ event: StingApplicationLifecycleEvent) {
    switch event {
    case .active:
        startObservation()
    case .background, .runtimeDisposing:
        stopObservation()
    default:
        break
    }
}
```

The production `StingNativeRuntimeHost` and the JavaScriptCore reference runtime share the same `StingModuleRegistry` lifecycle semantics. On iOS the registry observes UIKit application notifications and translates them to the portable states above. Custom hosts can also forward a state explicitly through `dispatchLifecycle(_:)`.

## Kotlin

Android hosts forward Activity/application state through `StingNativeBridge.dispatchLifecycle(...)`:

```kotlin
override fun onResume() {
    super.onResume()
    bridge.dispatchLifecycle(StingApplicationLifecycleEvent.ACTIVE)
}

override fun onPause() {
    bridge.dispatchLifecycle(StingApplicationLifecycleEvent.INACTIVE)
    super.onPause()
}
```

Generated Sting applications wire `onStart`, `onResume`, `onPause`, and `onStop` to `FOREGROUND`, `ACTIVE`, `INACTIVE`, and `BACKGROUND`. Runtime teardown emits `RUNTIME_DISPOSING` through module-registry disposal.

A native module implements:

```kotlin
override fun onApplicationLifecycle(event: StingApplicationLifecycleEvent) {
    if (event == StingApplicationLifecycleEvent.RUNTIME_DISPOSING) {
        stopObservation()
    }
}
```

## Background delivery

Background work is targeted explicitly to one module. The platform host retains ownership of iOS background task/session objects, Android Activity/Service/WorkManager objects, and completion deadlines. Only portable payload data crosses the Sting module boundary.

Swift modules may implement:

```swift
func handleBackgroundEvent(
    name: String,
    payload: Any?,
    completion: @escaping StingNativeModuleCompletion
) {
    // Complete asynchronously when native work finishes.
}
```

Kotlin modules implement the equivalent `handleBackgroundEvent(name, payload, completion)` method.

If a module does not implement a requested background event, the default implementation completes with `E_BACKGROUND_EVENT_NOT_FOUND`. Unknown modules return `E_MODULE_NOT_FOUND`, empty event names return `E_INVALID_BACKGROUND_EVENT`, and background delivery after runtime teardown returns `E_RUNTIME_DISPOSED`.

The background hook is a native module capability, not a JavaScript callback transport. Rich modules such as Notifications and Background Task can use it together with existing async calls and module events without introducing private QuickJS/JSC/JNI APIs.

## Manifest capability

A package that relies on these hooks declares the existing schema-v1 capability:

```json
{
  "capabilities": ["lifecycle"]
}
```

No manifest schema bump is required. `sting-module.json` remains the authoritative capability declaration used by validation and, after Train A autolinking lands, generated host integration.
