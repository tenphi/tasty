/**
 * State aliases that reference other state aliases.
 *
 * Each case compares the alias against the same condition written out inline:
 * an alias is shorthand, so the CSS must be identical.
 */

import { resetConfig } from '../config';
import { clearPipelineCache, renderStyles } from '../pipeline';
import { clearParseCache } from '../pipeline/parseStateKey';
import { setWarningHandler } from '../pipeline/warnings';
import type { Styles } from '../styles/types';

import { clearGlobalPredefinedStates, setGlobalPredefinedStates } from '.';

const GLOBAL_STATES = {
  '@mobile': '@media(w < 768px)',
  '@collapsed': '@mobile & !expanded',
  '@compact': '@collapsed | @media:print',
  '@loop-a': '@loop-b',
  '@loop-b': '@loop-a',
};

function reset(): void {
  resetConfig();
  clearGlobalPredefinedStates();
  clearParseCache();
  clearPipelineCache();
}

function render(styles: Styles) {
  return renderStyles(styles, '.t');
}

/** `fill` with a default and one state, so only the state key varies. */
function fillFor(state: string, extra: Styles = {}): Styles {
  return { ...extra, fill: { '': '#a', [state]: '#b' } };
}

describe('State aliases referencing other aliases', () => {
  let warnings: { code: string; message: string }[];
  let restoreWarnings: () => void;

  beforeEach(() => {
    reset();
    setGlobalPredefinedStates(GLOBAL_STATES);
    warnings = [];
    restoreWarnings = setWarningHandler((warning) => {
      warnings.push(warning);
    });
  });

  afterEach(() => {
    restoreWarnings();
    reset();
  });

  describe('resolution', () => {
    it('resolves a global alias through another global alias', () => {
      expect(render(fillFor('@collapsed'))).toEqual(
        render(fillFor('@media(w < 768px) & !expanded')),
      );
    });

    it('resolves a chain of global aliases', () => {
      expect(render(fillFor('@compact'))).toEqual(
        render(fillFor('(@media(w < 768px) & !expanded) | @media:print')),
      );
    });

    it('resolves a local alias through a global alias', () => {
      expect(
        render(fillFor('@narrow', { '@narrow': '@mobile | @media:print' })),
      ).toEqual(render(fillFor('@media(w < 768px) | @media:print')));
    });

    it('resolves a local alias through another local alias', () => {
      expect(
        render(
          fillFor('@narrow', {
            '@narrow': '@tiny & hovered',
            '@tiny': '@media(w < 300px)',
          }),
        ),
      ).toEqual(render(fillFor('@media(w < 300px) & hovered')));
    });

    it('resolves a sub-element alias through a root-level alias', () => {
      const viaAlias = render({
        '@tiny': '@media(w < 300px)',
        Label: {
          '@label-tiny': '@tiny & hovered',
          fill: { '': '#a', '@label-tiny': '#b' },
        },
      });
      const inline = render({
        Label: {
          fill: { '': '#a', '@media(w < 300px) & hovered': '#b' },
        },
      });

      expect(viaAlias).toEqual(inline);
    });

    it('treats a shared dependency (diamond) as a plain reference', () => {
      const viaAlias = render(
        fillFor('@either', {
          '@either': '@left | @right',
          '@left': '@tiny & hovered',
          '@right': '@tiny & focused',
          '@tiny': '@media(w < 300px)',
        }),
      );

      expect(viaAlias).toEqual(
        render(
          fillFor(
            '(@media(w < 300px) & hovered) | (@media(w < 300px) & focused)',
          ),
        ),
      );
      expect(warnings).toEqual([]);
    });
  });

  describe('scoping', () => {
    it('resolves a global alias against global aliases only', () => {
      // A local `@mobile` must not change what the global `@collapsed` means.
      expect(
        render(fillFor('@collapsed', { '@mobile': '@media(w < 400px)' })),
      ).toEqual(render(fillFor('@media(w < 768px) & !expanded')));
    });

    it('lets a local alias reuse a name a global alias depends on', () => {
      // local @mobile → global @collapsed → global @mobile: not a cycle.
      expect(
        render(fillFor('@mobile', { '@mobile': '@collapsed & hovered' })),
      ).toEqual(render(fillFor('(@media(w < 768px) & !expanded) & hovered')));
      expect(warnings).toEqual([]);
    });
  });

  describe('cycles', () => {
    it('stops a global cycle, warns, and never matches', () => {
      expect(() => render(fillFor('@loop-a'))).not.toThrow();
      expect(render(fillFor('@loop-a'))).toEqual(render({ fill: '#a' }));

      const circular = warnings.filter(
        (warning) => warning.code === 'CIRCULAR_STATE_ALIAS',
      );
      expect(circular).toHaveLength(1);
      expect(circular[0].message).toContain('@loop-a → @loop-b → @loop-a');
    });

    it('stops a local cycle', () => {
      const styles = fillFor('@ping', { '@ping': '@pong', '@pong': '@ping' });

      expect(render(styles)).toEqual(render({ fill: '#a' }));
      expect(warnings.map((warning) => warning.code)).toContain(
        'CIRCULAR_STATE_ALIAS',
      );
    });

    it('stops a local alias that references itself', () => {
      const styles = fillFor('@self', { '@self': '@self & hovered' });

      expect(render(styles)).toEqual(render({ fill: '#a' }));
      expect(warnings[0]?.message).toContain('@self → @self');
    });

    it('keeps the rest of a compound key when one alias is circular', () => {
      expect(render(fillFor('@loop-a | hovered'))).toEqual(
        render(fillFor('hovered')),
      );
    });
  });
});
