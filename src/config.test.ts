/**
 * @vitest-environment jsdom
 */
import {
  configure,
  resetConfig,
  getGlobalConfigTokens,
  getConfigGlobalStyles,
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

describe('configure() globalStyles', () => {
  beforeEach(() => {
    resetConfig();
  });

  afterEach(() => {
    resetConfig();
  });

  it('should store global styles for a single selector', () => {
    configure({
      globalStyles: {
        body: {
          color: 'red',
          padding: '2x',
        },
      },
    });

    const styles = getConfigGlobalStyles();
    expect(styles).toBeDefined();
    expect(styles!.body.color).toBe('red');
    expect(styles!.body.padding).toBe('2x');
  });

  it('should merge plugin globalStyles with config globalStyles per selector', () => {
    configure({
      plugins: [
        {
          name: 'test-plugin',
          globalStyles: {
            body: {
              color: 'blue',
              margin: 0,
            },
          },
        },
      ],
      globalStyles: {
        body: {
          color: 'red',
          padding: '2x',
        },
      },
    });

    const styles = getConfigGlobalStyles();
    expect(styles).toBeDefined();
    expect(styles!.body.color).toBe('red');
    expect(styles!.body.padding).toBe('2x');
    expect(styles!.body.margin).toBe(0);
  });

  it('should support multiple selectors in one call', () => {
    configure({
      globalStyles: {
        body: { color: 'red' },
        html: { overflow: 'hidden' },
      },
    });

    const styles = getConfigGlobalStyles();
    expect(styles).toBeDefined();
    expect(styles!.body.color).toBe('red');
    expect(styles!.html.overflow).toBe('hidden');
  });

  it('should return null when no globalStyles configured', () => {
    configure({});

    const styles = getConfigGlobalStyles();
    expect(styles).toBeNull();
  });

  it('should ignore empty globalStyles object', () => {
    configure({ globalStyles: {} });

    expect(getConfigGlobalStyles()).toBeNull();
  });

  it('should work with preset reference when presets defined in same configure call', () => {
    configure({
      presets: {
        t2: { fontSize: '16px', lineHeight: '1.5', fontWeight: '400' },
      },
      globalStyles: {
        body: {
          preset: 't2',
          margin: 0,
        },
      },
    });

    const tokens = getGlobalConfigTokens();
    expect(tokens).toBeDefined();
    expect(tokens!['$t2-font-size']).toBe('16px');
    expect(tokens!['$t2-line-height']).toBe('1.5');
    expect(tokens!['$t2-font-weight']).toBe('400');

    const styles = getConfigGlobalStyles();
    expect(styles).toBeDefined();
    expect(styles!.body.preset).toBe('t2');
    expect(styles!.body.margin).toBe(0);
  });
});
