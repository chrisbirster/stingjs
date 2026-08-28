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
  padding('4'),
  background('surface')
]}

                ↓

        STING STYLE IR
──────────────────────────────────────

padding(16)
gap(12)
background(#ffffff)
cornerRadius(12)
font(title)

                ↓

     PLATFORM IMPLEMENTATION
──────────────────────────────────────

       Web          Native
        │              │
   StyleX/CSS      layout/native
                        │
                  UIKit / Android
```

The current Sting renderer remains native; this styling foundation does not add a DOM renderer. The web side is a verified compile-time StyleX bridge: the official StyleX compiler recognizes `@stingjs/stylex` as an import source and can lower the same static definitions and `sx` JSX syntax to web CSS/class output.

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
    padding('4'),
    background('surface'),
    cornerRadius('lg'),
    font('title'),
  )}
/>
```

Portable modifier helpers accept the same shared Sting tokens used by semantic style props, while still accepting raw numeric/color values where appropriate. Both forms resolve to the same concrete Style IR before crossing the native bridge.

Portable modifiers lower into the shared style IR. Native-only capabilities use the same ordered modifier channel without being added to the portable style vocabulary:

```tsx
<Box modifiers={[nativeBlur(20)]} />
```

`nativeBlur()` is implemented with `UIVisualEffectView` on iOS and `RenderEffect` on Android 12+; removal of the modifier removes the native effect.

Modifier arrays may contain arrays, `false`, `null`, `undefined`, or Solid accessors. Reactive values therefore stay inside Solid's fine-grained graph.

State/environment operations such as `pressed(...)` and `responsive(...)` belong at this IR layer, but this foundation deliberately does not ship placeholder/no-op versions. They are separate capabilities that require real state and viewport lowering on every supported platform.

## 2. StyleX integration

`@stingjs/stylex` is the shared StyleX authoring seam:

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

On native builds, those static definitions stay as typed style values, feed `sx`, and lower into Sting's Style IR. CSS class names are never interpreted by UIKit or Android.

On web compiler builds, configure the official StyleX Babel plugin with `@stingjs/stylex` as an import source:

```js
[
  '@stylexjs/babel-plugin',
  {
    importSources: ['@stingjs/stylex'],
  },
]
```

Sting tests this integration against the official StyleX compiler. The conformance suite verifies both `stylex.create(...)` extraction and `sx={styles.foo}` JSX lowering, so the web bridge is executable compiler behavior rather than only an architectural intention.

The native adapter intentionally exposes only the StyleX surface Sting currently needs: `create()` and `props()`. `props(...)` composes native definitions back into Sting's `sx` channel; direct `sx={styles.foo}` is the canonical cross-platform example.

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

The semantic primitives include:

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
        background('accent'),
        foreground('onAccent'),
        cornerRadius('md'),
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

The normalized style IR carries explicit reset values after a previously applied style disappears, so UIKit and Android restore native defaults instead of leaving stale visual state. Android also preserves the prior native layout width/height when a reactive dimension style is removed.

## Verification contract

A styling change is considered healthy only when the required Sting lanes pass:

- TypeScript typecheck, tests, and workspace build
- official QuickJS runtime smoke
- Android production host build, official QuickJS packaging, and real emulator instrumentation
- iOS runtime and native host/application builds

Hermes, QuickJS-NG, and the React Native/Hermes benchmark remain comparison lanes and are non-blocking; they are not Sting's production runtime contract.
