# Sting application SDK

Sting first-party modules use the same `@stingjs/modules-core` contract available to third-party modules. Public application values stay portable; Swift and Kotlin own platform-specific behavior.

## SecureStore

`@stingjs/secure-store` stores short string secrets in app-private secure storage.

```ts
import { SecureStore } from '@stingjs/secure-store';
await SecureStore.setItem('session', token);
const token = await SecureStore.getItem('session');
```

iOS uses Keychain generic-password storage. Android uses an Android Keystore AES-GCM key and encrypted app-private preferences.

## Network

`@stingjs/network` exposes a portable connectivity snapshot and change subscription. iOS uses `NWPathMonitor`; Android uses `ConnectivityManager`.

## Sharing

`@stingjs/sharing` hands portable text/URL content to the native system share UI.

## Sensors

`@stingjs/sensors` exposes accelerometer and gyroscope readings through the shared event bridge.

## ImagePicker

`@stingjs/image-picker` uses the privacy-preserving system image picker and copies the selected image to app cache before returning portable `file://` metadata.

## Location

`@stingjs/location` is the first first-party consumer of the shared runtime authorization contract.

```ts
import { Location } from '@stingjs/location';

if (Location.getPermissionStatus() === 'undetermined') {
  await Location.requestPermission();
}
const current = await Location.getCurrentPosition();
const subscription = Location.watchPosition(position => console.log(position.coords));
subscription.remove();
```

The initial 1.0 surface is foreground location. iOS uses Core Location and Android uses platform `LocationManager`. Coordinates, accuracy, heading, speed, altitude and timestamps are normalized portable values; platform location objects never cross the module boundary.

## Contacts

`@stingjs/contacts` provides shared authorization, bounded contact queries, and a system contact picker.

```ts
import { Contacts } from '@stingjs/contacts';
await Contacts.requestPermission();
const contacts = await Contacts.getContacts({ limit: 100 });
const selected = await Contacts.pickContact();
```

Only normalized identifiers, names, phone numbers and email addresses are returned. Picker cancellation resolves as `null`.

## Camera

`@stingjs/camera` combines shared authorization with the existing native-module-view renderer contract.

```tsx
import { Camera, CameraView } from '@stingjs/camera';

await Camera.requestPermission();
<CameraView facing="back" />;
const photo = await Camera.capturePhoto();
```

`CameraView` remains an ordinary Sting/Solid host node. Native preview resources pause on detach and are released on disposal. Captured JPEG data is copied into app-owned cache storage and returned as portable file metadata.

## Notifications

`@stingjs/notifications` provides notification authorization, local scheduling, cancellation/listing, and portable `received`/`opened` events.

```ts
import { Notifications } from '@stingjs/notifications';
await Notifications.requestPermission();
const id = await Notifications.schedule({ title: 'Ready', body: 'Your task is ready.' });
```

The initial portable 1.0 contract intentionally does not invent a vendor push-provider abstraction. Remote provider registration can build on the same module later without changing local notification semantics.

## Audio

`@stingjs/audio` exposes playback through shared native object handles.

```ts
import { Audio } from '@stingjs/audio';
const player = Audio.createPlayer();
await player.load('file:///path/to/song.mp3');
await player.play();
player.dispose();
```

Players expose load/play/pause/seek/stop/status operations and state events. iOS uses `AVPlayer`; Android uses `MediaPlayer`. Background/runtime-disposal transitions use the shared lifecycle contract and release native player ownership deterministically.

## BackgroundTask

`@stingjs/background-task` registers named work that a Sting host can deliver through the shared Train A background hook.

```ts
import { BackgroundTask } from '@stingjs/background-task';
await BackgroundTask.register('refresh');
const subscription = BackgroundTask.addRunListener(({ name, payload }) => {
  // perform bounded work and update application state
});
```

Registration does **not** promise exact OS execution timing. iOS and Android place different restrictions on background work; a platform host or future scheduler integration routes supported delivery into the same named `handleBackgroundEvent` contract. This keeps the public API stable without creating a second background runtime.

## Architecture boundary

Location, Camera, Notifications and Contacts use the shared runtime authorization operations. Camera uses the existing native-module-view path. Audio uses shared native-object lifetime and lifecycle delivery. BackgroundTask uses the shared background-delivery hook. All first-party packages use `sting-module.json` for autolinking/static permission configuration, the same path available to third-party modules.
