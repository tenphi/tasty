import { normalizeConfig } from './config-normalize';
import type { PropHandler } from './prop-handlers';
import type { ConfigTokens } from './styles/types';
import type { RawStyleHandler } from './utils/styles';

const pluginFunction = () => 'plugin';
const directFunction = () => 'direct';
const pluginHandler: RawStyleHandler = () => ({ color: 'red' });
const directHandler: RawStyleHandler = () => ({ color: 'blue' });
const pluginPropHandler: PropHandler = (props) => props;
const directPropHandler: PropHandler = (props) => props;

describe('normalizeConfig', () => {
  it('merges every resource with direct config taking precedence', () => {
    const normalized = normalizeConfig({
      plugins: [
        {
          name: 'base',
          states: { '@shared': 'hovered' },
          units: { shared: '1px' },
          functions: { shared: pluginFunction },
          handlers: {
            shared: pluginHandler,
            pluginOnly: pluginHandler,
          },
          propHandlers: {
            shared: pluginPropHandler,
            pluginOnly: pluginPropHandler,
          },
          baseStyleProps: ['pluginProp'],
          properties: { $shared: { syntax: '<number>' } },
          keyframes: { shared: { from: { opacity: 0 } } },
          fontFaces: { Shared: { src: 'url(plugin.woff2)' } },
          counterStyles: {
            shared: { system: 'cyclic', symbols: '"p"' },
          },
          replaceTokens: { $shared: 'plugin' },
          tokens: { $shared: 'plugin' },
          recipes: { shared: { padding: '1x' } },
          presets: {
            body: {
              fontSize: '12px',
              lineHeight: '16px',
              fontWeight: 400,
            },
          },
          globalStyles: { body: { color: 'red' } },
        },
      ],
      states: { '@shared': 'focused' },
      units: { shared: '2px' },
      functions: { shared: directFunction },
      handlers: { shared: directHandler },
      propHandlers: { shared: directPropHandler },
      baseStyleProps: ['directProp'],
      properties: { $shared: { syntax: '<length>' } },
      keyframes: { shared: { to: { opacity: 1 } } },
      fontFaces: { Shared: { src: 'url(direct.woff2)' } },
      counterStyles: { shared: { system: 'cyclic', symbols: '"d"' } },
      replaceTokens: { $shared: 'direct' },
      tokens: { $shared: 'direct' },
      recipes: { shared: { padding: '2x' } },
      presets: {
        body: {
          fontSize: '16px',
          lineHeight: '24px',
          fontWeight: 500,
        },
      },
      globalStyles: { body: { fill: '#blue' } },
    });

    expect(normalized.states['@shared']).toBe('focused');
    expect(normalized.units.shared).toBe('2px');
    expect(normalized.functions.shared).toBe(directFunction);
    expect(normalized.handlers.shared).toBe(directHandler);
    expect(normalized.handlerSources.get('shared')).toBe('configure()');
    expect(normalized.handlerSources.get('pluginOnly')).toBe('plugin "base"');
    expect(normalized.propHandlers.shared).toBe(directPropHandler);
    expect(normalized.propHandlerSources.get('shared')).toBe('configure()');
    expect(normalized.propHandlerSources.get('pluginOnly')).toBe(
      'plugin "base"',
    );
    expect(normalized.baseStyleProps).toEqual(['pluginProp', 'directProp']);
    expect(normalized.properties.$shared.syntax).toBe('<length>');
    expect(normalized.keyframes.shared).toEqual({ to: { opacity: 1 } });
    expect(normalized.fontFaces.Shared).toEqual({
      src: 'url(direct.woff2)',
    });
    expect(normalized.counterStyles.shared.symbols).toBe('"d"');
    expect(normalized.replaceTokens.$shared).toBe('direct');
    expect(normalized.tokens.$shared).toBe('direct');
    expect(normalized.tokens['$body-font-size']).toBe('16px');
    expect(normalized.recipes.shared).toEqual({ padding: '2x' });
    expect(normalized.globalStyles.body).toEqual({
      color: 'red',
      fill: '#blue',
    });
  });

  it('keeps __proto__ as an own configuration key', () => {
    const tokens = JSON.parse(
      '{"__proto__":{"polluted":"no"}}',
    ) as ConfigTokens;

    const normalized = normalizeConfig({ tokens });

    expect(Object.getPrototypeOf(normalized.tokens)).toBe(Object.prototype);
    expect(Object.hasOwn(normalized.tokens, '__proto__')).toBe(true);
    expect((normalized.tokens as Record<string, unknown>).__proto__).toEqual({
      polluted: 'no',
    });
  });

  it('retains an empty plugin name in source attribution', () => {
    const normalized = normalizeConfig({
      plugins: [{ name: '', handlers: { test: pluginHandler } }],
    });

    expect(normalized.handlerSources.get('test')).toBe('plugin ""');
  });
});
