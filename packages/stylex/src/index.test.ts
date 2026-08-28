import { describe, expect, it } from 'vitest';
import { create, props } from './index';

describe('@stingjs/stylex', () => {
  it('keeps StyleX create definitions reusable as Sting native sx input', () => {
    const styles = create({
      screen: { backgroundColor: '#09090b', padding: 16 },
      selected: { opacity: 0.8 },
    });

    expect(styles.screen.backgroundColor).toBe('#09090b');
    expect(styles.selected.opacity).toBe(0.8);
  });

  it('maps StyleX composition into Sting sx props', () => {
    const styles = create({
      card: { borderRadius: 12 },
      selected: { opacity: 0.8 },
    });

    expect(props(styles.card, false, styles.selected)).toEqual({
      sx: [styles.card, false, styles.selected],
    });
  });
});
