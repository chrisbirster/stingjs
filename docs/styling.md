# Styling and modifiers

Sting uses a **modifier-first** styling architecture. `style={{...}}` remains supported for compatibility, but new application code should prefer semantic components, token props, `sx`, and explicit modifiers.

```tsx
import * as stylex from '@stingjs/stylex';
import { Button, Stack, nativeBlur } from '@stingjs/native';

const styles = stylex.create({
  screen: {
    backgroundColor: '#09090b',
  },
});

<Stack
  p="4"
  gap="3"
  sx={styles.screen}
  modifiers={[nativeBlur()]}
>
  <Button variant="primary">Continue</Button>
</Stack>;
```

## Layers

All authoring surfaces resolve into one ordered Sting modifier/style representation:

```text
component defaults
  < variant
  < legacy style
  < sx
  < semantic/token props
  < explicit modifiers
```

The later layer wins for the same property. Native modifiers are deduplicated by name with the same last-wins rule.

## Semantic primitives

`@stingjs/native` exports:

- `Box` — neutral container
- `Stack` — vertical container
- `HStack` — horizontal container
- `Center` — centers children on both axes
- the existing `View`, `Text`, `Button`, `Image`, `TextInput`, and `ScrollView`

These are not new renderer node types. `Box`, `Stack`, `HStack`, and `Center` resolve to the same Sting native `view` host and contribute default modifiers.

## Token props

The built-in spacing scale supports `p`, `px`, `py`, `pt`, `pr`, `pb`, `pl`, and `gap`.

```tsx
<Stack p="4" gap="3" bg="surface" rounded="lg" />
```

Numbers remain available when an application needs an exact device-independent value:

```tsx
<Box p={18} w={240} />
```

## Modifiers

Modifiers are the canonical low-level styling API:

```tsx
import {
  background,
  m,
  padding,
  rounded,
} from '@stingjs/native';

<Box
  modifiers={m(
    padding(16),
    background('#09090b'),
    rounded(12),
  )}
/>
```

Modifier arrays may contain arrays, `false`, `null`, `undefined`, or accessors, which makes conditional Solid styling natural without a separate conditional-style API.

## Native escape hatches

`nativeModifier()` carries a platform capability beside the portable style representation. `nativeBlur()` is the first built-in descriptor:

```tsx
<Box modifiers={[nativeBlur(20)]} />
```

Native descriptors intentionally do not grow the universal style contract. A platform host either implements the descriptor or treats it as unsupported.

## `@stingjs/stylex`

`@stingjs/stylex` provides a StyleX-shaped native authoring adapter:

```tsx
import * as stylex from '@stingjs/stylex';

const styles = stylex.create({
  card: {
    backgroundColor: '#18181b',
    borderRadius: 12,
  },
});

<Box sx={styles.card} />;
```

Its core API is deliberately small: `create`, `props`, and `compose`. The result is consumed by Sting's `sx` prop and resolves to the modifier IR on native targets.

This package is **not currently a drop-in runtime for compiled `@stylexjs/stylex` class objects**. Real Meta StyleX web compilation emits atomic CSS classes; Sting native intentionally does not carry CSS class semantics. The package establishes the compatible authoring seam so a future build-time transform can target CSS on web and Sting modifier atoms on native without changing application component APIs.

## Variants

The public `recipe()` helper builds design-system variants from modifiers. `Button` currently demonstrates the model with `native`, `primary`, `secondary`, `ghost`, and `danger` variants plus `sm`, `md`, and `lg` sizes.

```tsx
<Button variant="danger" size="sm">Delete</Button>
```

`variant="native"` remains the default to preserve the current platform-native button appearance for existing Sting applications.

## Fine-grained updates

Styling is resolved inside a Solid memo. Reactive `sx`, token props, or modifier accessors therefore track only the signals they read. The normalized style object includes every supported property with `null` for removed values so native hosts can reset previously-applied values rather than leaving stale visual state.
