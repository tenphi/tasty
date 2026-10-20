/**
 * `false` is the tombstone: a style set to `false`, alone or under a state, writes
 * no declaration. A handler that turns it into the string `'false'` reads no
 * value from it and writes its default instead — `padding: false` wrote the
 * default gap, and only under a state map did anyone notice.
 *
 * Every built-in style name is swept, so a new handler is held to the rule too.
 */
import { renderStyles } from '../pipeline';

import { STYLE_HANDLER_MAP } from './index';

/**
 * Styles whose `false` is documented as a value rather than as "not set".
 * `fontStyle` is a boolean toggle: `true` is `italic`, `false` is `normal`.
 */
const FALSE_IS_A_VALUE = new Set(['fontStyle']);

const STYLE_NAMES = Object.keys(STYLE_HANDLER_MAP).filter(
  (name) => !FALSE_IS_A_VALUE.has(name),
);

describe('false writes nothing', () => {
  it.each(STYLE_NAMES)('%s: false', (name) => {
    expect(renderStyles({ [name]: false }, '.x')).toEqual([]);
  });

  it.each(STYLE_NAMES)('%s: false under the default state', (name) => {
    const rules = renderStyles({ [name]: { '': false, hovered: '2x' } }, '.x');

    expect(rules.map((rule) => rule.selector).join(' ')).not.toContain(
      ':not([data-hovered])',
    );
  });
});
