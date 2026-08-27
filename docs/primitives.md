# Native primitives and style contract (v0.1)

StingJS v0.1 intentionally exposes a small native surface. These components render platform controls directly; they are not DOM elements and the style object is not CSS.

## Primitives

### `View`

Container backed by `UIStackView` on iOS and `LinearLayout` on Android.

Props:

- `children`
- `style`
- `accessibilityLabel`

### `Text`

Backed by `UILabel` / `TextView`. Text owns one persistent Sting host text node so a Solid signal update can become exactly one native `replaceText` mutation.

Props:

- textual/dynamic `children`
- `style`
- `accessibilityLabel`

### `Button`

Backed by `UIButton` / Android `Button`.

Props:

- textual `children`
- `onPress`
- `disabled`
- `style`
- `accessibilityLabel`

### `Image`

Backed by `UIImageView` / `ImageView`.

Props:

- `source: string | { uri: string }`
- `resizeMode: 'contain' | 'cover' | 'stretch'`
- `style`
- `accessibilityLabel`

HTTP(S) URIs are loaded asynchronously by the native host. Applications remain responsible for the normal platform network/security configuration. Platform-local asset/file URIs may also be supplied.

### `TextInput`

Controlled single-line input backed by `UITextField` / `EditText`.

Props:

- `value`
- `placeholder`
- `editable`
- `onChangeText(value)`
- `style`
- `accessibilityLabel`

Programmatic `value` updates do not synthesize `onChangeText`, preventing controlled-input feedback loops.

### `ScrollView`

Native scrolling container backed by `UIScrollView` and Android `ScrollView`/`HorizontalScrollView` plumbing while preserving Sting child identities.

Props:

- `children`
- `horizontal`
- `style`
- `accessibilityLabel`

## Style

The v0.1 `Style` contract is deliberately small:

```ts
interface Style {
  flexDirection?: 'row' | 'column';
  gap?: number;
  padding?: number;
  width?: number;
  height?: number;
  backgroundColor?: string;
  color?: string;
  fontSize?: number;
}
```

Numbers use points on iOS and density-independent pixels on Android, except `fontSize`, which maps to the platform's normal scalable text unit.

Hex colors use `#RRGGBB`.

`flexDirection`, `gap`, and `padding` apply to native container layout. This is not a promise that future Sting styles will mirror CSS or React Native's style API. Layout capabilities should be added only when real application requirements demonstrate the need.

## Accessibility

All v0.1 view-backed primitives accept `accessibilityLabel`. `Button.disabled` and `TextInput.editable` map to the native enabled state.

## Renderer semantics

Native primitives remain ordinary Sting host nodes. Solid owns reactivity; the platform host receives concrete mutations only. Moving a keyed node may be represented as native detach/reinsert of the same identity. Detached nodes cannot dispatch events until reinserted.
