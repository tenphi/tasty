/**
 * @vitest-environment jsdom
 */
import {
  configure,
  resetConfig,
  getGlobalConfigTokens,
  getGlobalBodyStyles,
} from './config';

describe('configure() presets', () => {
  beforeEach(() => {
    resetConfig();
  });

  afterEach(() => {
    resetConfig();
  });

  it('should generate typography tokens from presets', () => {
    configure({
      presets: {
        h1: { fontSize: '32px', lineHeight: '1.2', fontWeight: '700' },
      },
    });

    const tokens = getGlobalConfigTokens();
    expect(tokens).toBeDefined();
    expect(tokens!['$h1-font-size']).toBe('32px');
    expect(tokens!['$h1-line-height']).toBe('1.2');
    expect(tokens!['$h1-font-weight']).toBe('700');
    expect(tokens!['$h1-letter-spacing']).toBe('normal');
  });

  it('should let explicit tokens override preset-generated tokens', () => {
    configure({
      presets: {
        t2: { fontSize: '16px', lineHeight: '1.5', fontWeight: '400' },
      },
      tokens: {
        '$t2-font-weight': '500',
      },
    });

    const tokens = getGlobalConfigTokens();
    expect(tokens!['$t2-font-weight']).toBe('500');
    expect(tokens!['$t2-font-size']).toBe('16px');
  });

  it('should merge plugin presets with config presets', () => {
    configure({
      plugins: [
        {
          name: 'test-plugin',
          presets: {
            t1: { fontSize: '20px', lineHeight: '1.5', fontWeight: '400' },
          },
        },
      ],
      presets: {
        t2: { fontSize: '16px', lineHeight: '1.5', fontWeight: '400' },
      },
    });

    const tokens = getGlobalConfigTokens();
    expect(tokens!['$t1-font-size']).toBe('20px');
    expect(tokens!['$t2-font-size']).toBe('16px');
  });

  it('should support state maps in preset values', () => {
    configure({
      presets: {
        t2: {
          fontSize: '16px',
          lineHeight: '1.5',
          fontWeight: { '': '400', '@dark': '300' },
        },
      },
    });

    const tokens = getGlobalConfigTokens();
    expect(tokens!['$t2-font-weight']).toEqual({
      '': '400',
      '@dark': '300',
    });
  });

  it('should let plugin tokens override plugin preset-generated tokens', () => {
    configure({
      plugins: [
        {
          name: 'test-plugin',
          presets: {
            t1: { fontSize: '20px', lineHeight: '1.5', fontWeight: '400' },
          },
          tokens: {
            '$t1-font-weight': '500',
          },
        },
      ],
    });

    const tokens = getGlobalConfigTokens();
    expect(tokens!['$t1-font-size']).toBe('20px');
    expect(tokens!['$t1-font-weight']).toBe('500');
  });

  it('should ignore empty presets object', () => {
    configure({ presets: {} });

    expect(getGlobalConfigTokens()).toBeNull();
  });
});

describe('configure() bodyStyles', () => {
  beforeEach(() => {
    resetConfig();
  });

  afterEach(() => {
    resetConfig();
  });

  it('should store body styles', () => {
    configure({
      bodyStyles: {
        color: 'red',
        padding: '2x',
      },
    });

    const styles = getGlobalBodyStyles();
    expect(styles).toBeDefined();
    expect(styles!.color).toBe('red');
    expect(styles!.padding).toBe('2x');
  });

  it('should merge plugin bodyStyles with config bodyStyles', () => {
    configure({
      plugins: [
        {
          name: 'test-plugin',
          bodyStyles: {
            color: 'blue',
            margin: 0,
          },
        },
      ],
      bodyStyles: {
        color: 'red',
        padding: '2x',
      },
    });

    const styles = getGlobalBodyStyles();
    expect(styles).toBeDefined();
    expect(styles!.color).toBe('red');
    expect(styles!.padding).toBe('2x');
    expect(styles!.margin).toBe(0);
  });

  it('should return null when no bodyStyles configured', () => {
    configure({});

    const styles = getGlobalBodyStyles();
    expect(styles).toBeNull();
  });

  it('should ignore empty bodyStyles object', () => {
    configure({ bodyStyles: {} });

    expect(getGlobalBodyStyles()).toBeNull();
  });

  it('should work with preset reference when presets defined in same configure call', () => {
    configure({
      presets: {
        t2: { fontSize: '16px', lineHeight: '1.5', fontWeight: '400' },
      },
      bodyStyles: {
        preset: 't2',
        margin: 0,
      },
    });

    const tokens = getGlobalConfigTokens();
    expect(tokens).toBeDefined();
    expect(tokens!['$t2-font-size']).toBe('16px');
    expect(tokens!['$t2-line-height']).toBe('1.5');
    expect(tokens!['$t2-font-weight']).toBe('400');

    const styles = getGlobalBodyStyles();
    expect(styles).toBeDefined();
    expect(styles!.preset).toBe('t2');
    expect(styles!.margin).toBe(0);
  });
});
