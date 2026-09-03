import { fadeStyle } from './fade';
import { insetStyle } from './inset';
import { marginStyle } from './margin';
import { paddingStyle } from './padding';
import { scrollMarginStyle } from './scrollMargin';
import { resetStyleWarnings } from '../utils/warnings';

/**
 * A group that names direction modifiers takes a single value, applied to every
 * direction it names. Extra values are ignored with a dev-mode warning.
 *
 * `warnOnceDev` calls `isDevEnv()` lazily rather than capturing it at module
 * load, which is what makes `vi.stubEnv('NODE_ENV', 'development')` below work —
 * `isDevEnv()` reports `false` for `NODE_ENV=test`.
 */
describe('ambiguous multi-value directional groups', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Mandatory: `warnOnceDev` registers the dedupe key even when the warning is
    // suppressed, so without this a production-silence test would mute a later
    // dev test that uses the same value. Vitest isolates module state per file,
    // not per test.
    resetStyleWarnings();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
      /* noop */
    });
  });

  afterEach(() => {
    warnSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  describe('in development', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'development');
    });

    it.each([
      ['padding', () => paddingStyle({ padding: '2x 4x top right' })],
      ['margin', () => marginStyle({ margin: '2x 4x top right' })],
      ['inset', () => insetStyle({ inset: '2x 4x top right' })],
      [
        'scroll-margin',
        () => scrollMarginStyle({ scrollMargin: '2x 4x top right' }),
      ],
    ])('warns for %s', (property, run) => {
      run();

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(`${property}="2x 4x top right"`),
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('comma-separated groups'),
      );
    });

    it('warns once no matter how often the handler runs', () => {
      paddingStyle({ padding: '2x 4x top right' });
      paddingStyle({ padding: '2x 4x top right' });
      paddingStyle({ padding: '2x 4x top right' });

      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it('warns for fade', () => {
      fadeStyle({ fade: '3x 1x top bottom' });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('fade="3x 1x top bottom"'),
      );
    });

    it('does not warn for a directionless group (CSS shorthand order)', () => {
      paddingStyle({ padding: '1x 2x 3x 4x' });
      insetStyle({ inset: '1x 2x' });
      fadeStyle({ fade: '3x 1x' });

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('does not warn for a valid one-value directional group', () => {
      paddingStyle({ padding: '2x top, 4x right' });
      paddingStyle({ padding: '1x left right' });
      fadeStyle({ fade: '3x top, 1x bottom' });

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('allows two values with dock and does not warn', () => {
      expect(insetStyle({ inset: '2x 4x bottom dock' })).toEqual({
        inset: 'auto 32px 16px 32px',
      });

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('warns for three values with dock and keeps the first two', () => {
      expect(insetStyle({ inset: '2x 4x 6x bottom dock' })).toEqual({
        inset: 'auto 32px 16px 32px',
      });

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('at most two'),
      );
    });

    it('warns for two values without dock', () => {
      expect(insetStyle({ inset: '2x 4x bottom' })).toEqual({
        inset: 'auto auto 16px auto',
      });

      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it('warns for padding with dock, which has no span modifiers', () => {
      // `dock` is inset-only: `filterMods` drops it from the directions and
      // PADDING_CONFIG declares no `spanModifiers`, so `4x` is just extra.
      expect(paddingStyle({ padding: '2x 4x bottom dock' })).toEqual({
        padding: '0 0 16px 0',
      });

      expect(warnSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('outside development', () => {
    it('stays silent and falls back to the first value', () => {
      // NODE_ENV=test, so isDevEnv() is false.
      expect(paddingStyle({ padding: '2x 4x top right' })).toEqual({
        padding: '16px 16px 0 0',
      });
      expect(fadeStyle({ fade: '3x 1x top bottom' })!.mask).toContain('24px');

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('stays silent with NODE_ENV=production', () => {
      vi.stubEnv('NODE_ENV', 'production');

      paddingStyle({ padding: '2x 4x top right' });

      expect(warnSpy).not.toHaveBeenCalled();
    });
  });
});
