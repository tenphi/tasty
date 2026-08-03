/**
 * Pins the runnable examples in README.md so they cannot silently rot.
 */
import { resetConfig } from './config';
import { renderStyles } from './pipeline';

describe('README examples', () => {
  beforeEach(() => resetConfig());
  afterEach(() => resetConfig());

  it('CSS Functions (@function) section', () => {
    const rules = renderStyles(
      {
        '@function': {
          $$negative: { args: ['$value'], result: '(-1 * $value)' },
        },
        marginTop: '$$negative(2x)',
      },
      '.card',
    );

    expect(rules[0].declarations).toContain('--negative(16px)');
  });
});
