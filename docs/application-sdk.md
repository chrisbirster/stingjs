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

## Architecture boundary

Modules that need runtime authorization (Location, Camera, Notifications, Contacts, and related APIs) must use the shared Train A permission contract rather than implementing package-specific permission bridges. Audio/background work must use the shared lifecycle/background hooks. Camera must use the shared native-module-view contract. This keeps first-party and third-party modules on the same runtime architecture.
