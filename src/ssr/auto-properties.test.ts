import { computeStyles } from '../compute-styles';
import { configure, resetConfig } from '../config';
import type { Styles } from '../styles/types';

import { createServerStyleCollector } from './collector';

/** Every `@property` rule the collector emits for `name`. */
function propertyRules(styles: Styles, name: string): string[] {
  const collector = createServerStyleCollector();
  computeStyles(styles, { ssrCollector: collector });

  return (
    collector
      .getCSS()
      .match(new RegExp(`@property ${name} \\{[^}]*\\}`, 'g')) ?? []
  );
}

/**
 * The collector emits Tasty's default properties and `configure({ properties })`
 * itself. Auto-inference must not register them again: the inferred rule
 * guesses an initial value, and two `@property` rules for one name conflict.
 */
describe('SSR auto-inferred @property', () => {
  afterEach(() => {
    resetConfig();
  });

  it('registers `--current-color` once, with its default definition', () => {
    const rules = propertyRules({ color: '#purple' }, '--current-color');

    expect(rules).toHaveLength(1);
    expect(rules[0]).toContain('initial-value: currentcolor');
  });

  it('registers a configured property once, with its configured definition', () => {
    configure({
      properties: {
        $tilt: { syntax: '<angle>', inherits: false, initialValue: '45deg' },
      },
    });

    const rules = propertyRules({ $tilt: '10deg' }, '--tilt');

    expect(rules).toHaveLength(1);
    expect(rules[0]).toContain('initial-value: 45deg');
    expect(rules[0]).toContain('inherits: false');
  });

  it('still infers a property nothing declares', () => {
    const rules = propertyRules({ $spin: '10deg' }, '--spin');

    expect(rules).toHaveLength(1);
    expect(rules[0]).toContain('syntax: "<angle>"');
  });
});
