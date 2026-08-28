import { describe, expect, it } from 'vitest';
import {
  background,
  cornerRadius,
  font,
  m,
  nativeBlur,
  padding,
  paddingX,
  resolveStyling,
  rounded,
} from './style';

describe('modifier styling', () => {
  it('uses deterministic precedence ending with explicit modifiers', () => {
    const resolved = resolveStyling({
      defaults: background('#111111'),
      variant: background('#222222'),
      style: { backgroundColor: '#333333' },
      sx: { backgroundColor: '#444444' },
      props: { bg: '#555555' },
      modifiers: background('#666666'),
    });

    expect(resolved.style.backgroundColor).toBe('#666666');
  });

  it('normalizes shorthand padding so later axis modifiers win', () => {
    const resolved = resolveStyling({ modifiers: m(padding(16), paddingX(8)) });
    expect(resolved.style.paddingTop).toBe(16);
    expect(resolved.style.paddingRight).toBe(8);
    expect(resolved.style.paddingBottom).toBe(16);
    expect(resolved.style.paddingLeft).toBe(8);
  });

  it('resolves semantic spacing and radius tokens', () => {
    const resolved = resolveStyling({ props: { p: '4', gap: '3', rounded: 'lg' } });
    expect(resolved.style.paddingTop).toBe(16);
    expect(resolved.style.gap).toBe(12);
    expect(resolved.style.borderRadius).toBe(12);
  });

  it('expresses semantic font and corner-radius operations in the same IR', () => {
    const resolved = resolveStyling({ modifiers: [font('title'), cornerRadius(14)] });
    expect(resolved.style.fontSize).toBe(28);
    expect(resolved.style.fontWeight).toBe('bold');
    expect(resolved.style.borderRadius).toBe(14);
  });

  it('deduplicates native modifiers by name using last-wins ordering', () => {
    const resolved = resolveStyling({ modifiers: [nativeBlur(8), nativeBlur(24)] });
    expect(resolved.nativeModifiers).toEqual([{ name: 'blur', value: { radius: 24 } }]);
  });

  it('emits a complete resolved style so removed reactive values can reset natively', () => {
    const resolved = resolveStyling({ modifiers: rounded(8) });
    expect(resolved.style.__stingResolved).toBe(true);
    expect(resolved.style.borderRadius).toBe(8);
    expect(resolved.style.backgroundColor).toBeNull();
  });
});
