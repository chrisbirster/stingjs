import { describe, expect, it } from 'vitest';
import { compose, create, props } from './index';

describe('@stingjs/stylex', () => {
  it('keeps StyleX-shaped create definitions reusable on native', () => {
    const styles = create({
      screen: { backgroundColor: '#09090b', padding: 16 },
      selected: { opacity: 0.8 },
    });

    expect(styles.screen.backgroundColor).toBe('#09090b');
    expect(compose(styles.screen, false, styles.selected)).toEqual([
      styles.screen,
      false,
      styles.selected,
    ]);
  });

  it('maps StyleX-style composition into Sting sx props', () => {
    const styles = create({ card: { borderRadius: 12 } });
    expect(props(styles.card)).toEqual({ sx: [styles.card] });
  });
});
