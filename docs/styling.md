# Sting styling architecture

Sting uses one style IR with four authoring layers above it. It does **not** adopt React Native's `StyleSheet.create()` model.

```text
          APPLICATION API
──────────────────────────────────────

<Stack p="4" gap="3">
<Button variant="primary">

         OR

StyleX / sx={styles.foo}

         OR

modifiers={[
  padding(16),
  background(...)
]}

                ↓

        STING STYLE IR
──────────────────────────────────────

padding(16)
gap(12)
background(surface)
cornerRadius(12)
font(title)

                ↓

     PLATFORM IMPLEMENTATION
──────────────────────────────────────

       Web          Native
        │              │
      CSS          layout/native
                        │
                  UIKit / Android
```

The web arrow is an architectural target for the shared IR and StyleX integration. Sting's current renderer is native; this PR does not add a DOM renderer.

## 1. Modifiers

Modifiers are the fundamental low-level Sting styling API.

```tsx
import {
  background,
  cornerRadius,
  font,
  m,
  padding,
} from '@stingjs/native';

<Box
  modifiers={m(
    padding(16),
    background('#09090b'),
    cornerRadius(12),
    font('title'),
  )}
/>
```

Portable modifiers lower into the shared style IR. Native-only capabilities use the same ordered modifier channel without being added to the portable style vocabulary:

```tsx
<Box modifiers={[nativeBlur(20)]} />
```

`nativeBlur()` is implemented with UIKit on iOS and `RenderEffect` on Android 12+.

Modifier arrays may contain arrays, `false`, `null`, `undefined`, or Solid accessors. Reactive values therefore stay inside Solid's fine-grained graph.

State/environment operations such as `pressed(...)` and `responsive(...)` belong at this IR layer, but this PR does not ship placeholder/no-op versions. They should be added only with real state and viewport lowering on every supported platform.

## 2. StyleX integration

`@stingjs/stylex` provides the native half of a StyleX integration using the familiar static `create()` model:

```tsx
import * as stylex from '@stingjs/stylex';

const styles = stylex.create({
  screen: {
    backgroundColor: '#09090b',
  },
  status: {
    color: '#a1a1aa',
  },
});

<Stack sx={styles.screen} />
```

On native, those static definitions feed `sx` and lower into Sting's style IR. CSS class names are not interpreted by UIKit or Android.

For a web build, the intended integration is to configure the official StyleX compiler so `@stingjs/stylex` is recognized as a StyleX import source and the same static definitions compile to atomic CSS. This keeps StyleX a compile-time web concern while preserving the same application-facing styling vocabulary on native.

The native adapter intentionally exposes only the StyleX surface Sting currently needs: `create()` and `props()`. Sting does not invent parallel StyleX-only helpers.

## 3. Semantic components and style props

Most application code should use semantic components and terse token props:

```tsx
<Stack p="4" gap="3">
  <Heading level={2}>Settings</Heading>
  <HStack gap="2">
    <Text>Account</Text>
  </HStack>
</Stack>
```

The semantic primitives currently include:

- `Box` — neutral container
- `Stack` — vertical container
- `HStack` — horizontal container
- `Center` — centered container
- `Heading` — semantic text with heading typography defaults
- existing native primitives such as `View`, `Text`, `Button`, `Image`, `TextInput`, and `ScrollView`

These do not create a second renderer model. Containers resolve to the existing Sting `view` host; `Heading` resolves to the existing native text host.

Style props are token-oriented conveniences over modifiers:

```tsx
<Stack p="4" gap="3" bg="surface" rounded="lg" />
```

Supported spacing aliases include `p`, `px`, `py`, `pt`, `pr`, `pb`, `pl`, and `gap`, plus `bg`, `rounded`, `opacity`, `w`, `h`, `direction`, `align`, and `justify`.

## 4. Recipes and variants

Recipes are the design-system layer. A recipe resolves names into ordinary modifiers; it is not a separate styling runtime.

```ts
const button = recipe({
  variants: {
    variant: {
      primary: [
        background('#4f46e5'),
        foreground('#ffffff'),
        cornerRadius(8),
      ],
    },
  },
});
```

Sting's built-in `Button` demonstrates this with exactly one opt-in styled variant:

```tsx
<Button variant="primary">Continue</Button>
```

The default remains the platform-native button. This styling foundation intentionally does not ship a large framework-owned design-system catalog.

## Interoperability and precedence

All four layers converge before crossing the native bridge:

```tsx
<Stack
  p="4"
  gap="3"
  sx={styles.screen}
  modifiers={[
    nativeBlur(),
  ]}
>
  <Button variant="primary">
    Continue
  </Button>
</Stack>
```

When the same portable property is supplied by multiple layers, precedence is deterministic:

```text
component defaults
  < recipe/variant
  < legacy style
  < sx
  < semantic/style props
  < explicit modifiers
```

`style={{ ... }}` remains supported only for compatibility with existing Sting code. New code should use modifiers, StyleX/`sx`, semantic components/style props, or recipes/variants.

## Fine-grained native updates

Styling resolution runs in Solid memos. A signal used by `sx`, a style prop, or a modifier accessor triggers the existing property-mutation path rather than React-style component reconciliation.

The normalized style IR carries explicit reset values after a previously-applied style disappears, so UIKit and Android restore native defaults instead of leaving stale visual state.
