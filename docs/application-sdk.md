# Sting application SDK

Sting first-party modules use the same `@stingjs/modules-core` contract available to third-party modules. Public application values stay portable; Swift and Kotlin own platform-specific behavior.

## SecureStore

`@stingjs/secure-store` stores short string secrets in app-private secure storage.

```ts
import { SecureStore } from '@stingjs/secure-store';

await SecureStore.setItem('session', token);
const token = await SecureStore.getItem('session');
await SecureStore.deleteItem('session');
```

An optional `namespace` separates logical stores. iOS uses Keychain generic-password items with `AfterFirstUnlockThisDeviceOnly` accessibility. Android keeps an AES-GCM master key in Android Keystore and persists only encrypted payloads in app-private preferences. APIs are asynchronous so storage/crypto work does not become a JS-runtime hot path.

SecureStore is intended for credentials, tokens, and similarly small values. It is not a replacement for Filesystem or a database.

## Network

`@stingjs/network` exposes normalized connectivity state:

```ts
import { Network } from '@stingjs/network';

const state = await Network.getState();
const subscription = Network.addNetworkStateListener(next => {
  console.log(next.type, next.connected);
});

subscription.remove();
```

A state contains `connected`, `internetReachable`, `type` (`none`, `wifi`, `cellular`, `ethernet`, or `other`), and `expensive`. iOS is backed by `NWPathMonitor`; Android is backed by `ConnectivityManager` and requires only the normal `ACCESS_NETWORK_STATE` manifest permission. Network observations use the shared native-module event bridge and are removed when the JS subscription is removed.

`internetReachable` represents the platform connectivity validation/path result; it is not an active HTTP probe.

## Sharing

`@stingjs/sharing` hands text and/or an absolute URL to the platform share UI:

```ts
import { Sharing } from '@stingjs/sharing';

await Sharing.share({
  text: 'Built with StingJS',
  url: 'https://stingjs.com',
  subject: 'Native SolidJS',
});
```

iOS uses `UIActivityViewController` and resolves after the native share controller finishes. Android launches the system chooser and resolves once the request has been handed to the chooser. Cancellation is not an application error.

## Sensors

`@stingjs/sensors` exposes accelerometer and gyroscope observations without platform sensor objects:

```ts
import { Sensors } from '@stingjs/sensors';

Sensors.setUpdateInterval('accelerometer', 16.67);
const acceleration = Sensors.addAccelerometerListener(reading => {
  console.log(reading.x, reading.y, reading.z);
});

const rotation = Sensors.addGyroscopeListener(reading => {
  console.log(reading.x, reading.y, reading.z);
});

acceleration.remove();
rotation.remove();
```

Accelerometer axes are normalized to multiples of Earth gravity (`g`) on both platforms. Gyroscope axes are radians per second. `timestamp` is a monotonic platform sensor timestamp expressed in seconds and is suitable for ordering/deltas, not wall-clock display. `hasSensor()` can be used before subscribing. iOS uses CoreMotion; Android uses `SensorManager`. These initial sensor types do not require runtime authorization.

## ImagePicker

`@stingjs/image-picker` uses the platform's user-mediated image picker and does not request broad photo-library/storage access:

```ts
import { ImagePicker } from '@stingjs/image-picker';

const result = await ImagePicker.pickImage();
if (!result.canceled) {
  console.log(result.asset.uri, result.asset.width, result.asset.height);
}
```

iOS uses `PHPickerViewController`. Android uses Photo Picker on API 33+ and `ACTION_OPEN_DOCUMENT` on older supported Android versions. The selected item is copied into Sting's app cache and returned as a portable `file://` asset with best-effort file name, MIME type, width, and height. Cancellation is a normal `{ canceled: true, asset: null }` result. Applications that need the file long-term should copy it to durable application storage because cache entries may be reclaimed by the OS.

## Architecture boundary

Modules that need runtime authorization (Location, Camera, Notifications, Contacts, and related APIs) must use the shared Train A permission contract rather than implementing package-specific permission bridges. Audio/background work must use the shared lifecycle/background hooks. Camera must use the shared native-module-view contract. This keeps first-party and third-party modules on the same runtime architecture.
