import { transformSync } from '@babel/core';
import stylexPlugin from '@stylexjs/babel-plugin';
import { describe, expect, it } from 'vitest';
import { create, props } from './index';

const compilerOptions = {
  dev: false,
  runtimeInjection: false,
  importSources: ['@stingjs/stylex'],
} as const;

describe('@stingjs/stylex', () => {
  it('keeps StyleX create definitions reusable as Sting native sx input', () => {
    const styles = create({
      screen: { backgroundColor: '#09090b', padding: 16 },
      selected: { opacity: 0.8 },
    });

    expect(styles.screen.backgroundColor).toBe('#09090b');
    expect(styles.selected.opacity).toBe(0.8);
  });

  it('maps StyleX composition into Sting sx props on native builds', () => {
    const styles = create({
      card: { borderRadius: 12 },
      selected: { opacity: 0.8 },
    });

    expect(props(styles.card, false, styles.selected)).toEqual({
      sx: [styles.card, false, styles.selected],
    });
  });

  it('compiles the complete portable Style IR through the official StyleX compiler', () => {
    const result = transformSync(
      `
        import * as stylex from '@stingjs/stylex';
        const styles = stylex.create({
          layout: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            padding: 16,
            width: 320,
            height: 48,
            backgroundColor: '#09090b',
            color: '#ffffff',
            fontSize: 16,
            fontWeight: 600,
            borderRadius: 12,
            opacity: 0.9,
          },
          edges: {
            paddingTop: 8,
            paddingRight: 12,
            paddingBottom: 8,
            paddingLeft: 12,
          },
        });
        export const layout = styles.layout;
        export const edges = styles.edges;
      `,
      {
        filename: '/virtual/sting-stylex-web.js',
        babelrc: false,
        configFile: false,
        plugins: [[stylexPlugin, compilerOptions]],
      },
    );

    const metadata = result?.metadata as { stylex?: readonly unknown[] } | undefined;
    expect(result?.code).not.toContain('stylex.create');
    expect(metadata?.stylex?.length).toBeGreaterThan(0);
  });

  it('lets the official compiler lower the sx JSX bridge for web builds', () => {
    const result = transformSync(
      `
        import * as stylex from '@stingjs/stylex';
        const styles = stylex.create({ root: { color: '#18181b' } });
        export const node = <div sx={styles.root}>Hello</div>;
      `,
      {
        filename: '/virtual/sting-stylex-web.jsx',
        babelrc: false,
        configFile: false,
        parserOpts: { plugins: ['jsx'] },
        plugins: [[stylexPlugin, compilerOptions]],
      },
    );

    const metadata = result?.metadata as { stylex?: readonly unknown[] } | undefined;
    expect(result?.code).not.toContain(' sx=');
    expect(result?.code).toContain('className');
    expect(metadata?.stylex?.length).toBeGreaterThan(0);
  });

  it('lets the official compiler lower stylex.props for web component authors', () => {
    const result = transformSync(
      `
        import * as stylex from '@stingjs/stylex';
        const styles = stylex.create({ root: { color: '#18181b', opacity: 0.9 } });
        export const attrs = stylex.props(styles.root);
      `,
      {
        filename: '/virtual/sting-stylex-props-web.js',
        babelrc: false,
        configFile: false,
        plugins: [[stylexPlugin, compilerOptions]],
      },
    );

    const metadata = result?.metadata as { stylex?: readonly unknown[] } | undefined;
    expect(result?.code).not.toContain('stylex.props');
    expect(result?.code).toContain('className');
    expect(metadata?.stylex?.length).toBeGreaterThan(0);
  });
});
