import { transitionStyle } from './transition';

describe('transitionStyle', () => {
  describe('basic functionality', () => {
    it('returns null when no transition is provided', () => {
      expect(transitionStyle({ transition: undefined })).toBeNull();
      expect(transitionStyle({ transition: '' })).toBeNull();
      expect(transitionStyle({ transition: false })).toBeNull();
    });

    it('handles semantic name with duration', () => {
      const result = transitionStyle({ transition: 'fill 0.2s' });
      expect(result).toEqual({
        transition: [
          'background-color 0.2s',
          'background-image 0.2s',
          '--tasty-second-fill-color 0.2s',
        ].join(', '),
      });
    });

    it('handles semantic name with duration and easing', () => {
      const result = transitionStyle({ transition: 'fade 0.15s ease-in' });
      expect(result).toEqual({
        transition: ['mask 0.15s ease-in', 'mask-composite 0.15s ease-in'].join(
          ', ',
        ),
      });
    });

    it('handles semantic name with duration, easing and delay', () => {
      const result = transitionStyle({
        transition: 'fill 0.2s ease-out 0.1s',
      });
      expect(result).toEqual({
        transition: [
          'background-color 0.2s ease-out 0.1s',
          'background-image 0.2s ease-out 0.1s',
          '--tasty-second-fill-color 0.2s ease-out 0.1s',
        ].join(', '),
      });
    });
  });

  describe('CSS-wide keywords', () => {
    it('passes through transition: inherit', () => {
      expect(transitionStyle({ transition: 'inherit' })).toEqual({
        transition: 'inherit',
      });
    });
  });

  describe('easing without duration', () => {
    it('handles easing keyword without duration (uses default timing)', () => {
      const result = transitionStyle({ transition: 'fill ease-in' });
      expect(result).toEqual({
        transition: [
          'background-color var(--fill-transition, var(--transition)) ease-in',
          'background-image var(--fill-transition, var(--transition)) ease-in',
          '--tasty-second-fill-color var(--fill-transition, var(--transition)) ease-in',
        ].join(', '),
      });
    });

    it('handles ease-in-out without duration', () => {
      const result = transitionStyle({ transition: 'radius ease-in-out' });
      expect(result).toEqual({
        transition:
          'border-radius var(--radius-transition, var(--transition)) ease-in-out',
      });
    });

    it('handles ease without duration', () => {
      const result = transitionStyle({ transition: 'color ease' });
      expect(result).toEqual({
        transition: 'color var(--color-transition, var(--transition)) ease',
      });
    });

    it('handles linear without duration', () => {
      const result = transitionStyle({ transition: 'opacity linear' });
      expect(result).toEqual({
        transition:
          'opacity var(--opacity-transition, var(--transition)) linear',
      });
    });

    it('handles easing without duration with delay', () => {
      const result = transitionStyle({
        transition: 'fill ease-in 0.1s',
      });
      expect(result).toEqual({
        transition: [
          'background-color var(--fill-transition, var(--transition)) ease-in 0.1s',
          'background-image var(--fill-transition, var(--transition)) ease-in 0.1s',
          '--tasty-second-fill-color var(--fill-transition, var(--transition)) ease-in 0.1s',
        ].join(', '),
      });
    });

    it('handles step-start without duration', () => {
      const result = transitionStyle({ transition: 'opacity step-start' });
      expect(result).toEqual({
        transition:
          'opacity var(--opacity-transition, var(--transition)) step-start',
      });
    });

    it('handles step-end without duration', () => {
      const result = transitionStyle({ transition: 'opacity step-end' });
      expect(result).toEqual({
        transition:
          'opacity var(--opacity-transition, var(--transition)) step-end',
      });
    });
  });

  describe('multiple transitions', () => {
    it('handles comma-separated transitions', () => {
      const result = transitionStyle({
        transition: 'fill 0.2s, radius 0.3s',
      });
      expect(result).toEqual({
        transition: [
          'background-color 0.2s',
          'background-image 0.2s',
          '--tasty-second-fill-color 0.2s',
          'border-radius 0.3s',
        ].join(', '),
      });
    });

    it('handles comma-separated transitions with mixed easing syntax', () => {
      const result = transitionStyle({
        transition: 'fill ease-in, radius 0.3s ease-out',
      });
      expect(result).toEqual({
        transition: [
          'background-color var(--fill-transition, var(--transition)) ease-in',
          'background-image var(--fill-transition, var(--transition)) ease-in',
          '--tasty-second-fill-color var(--fill-transition, var(--transition)) ease-in',
          'border-radius 0.3s ease-out',
        ].join(', '),
      });
    });

    it('keeps commas inside easing functions within their transition', () => {
      expect(
        transitionStyle({
          transition:
            'opacity 0.2s cubic-bezier(0.1, 0.2, 0.3, 1), transform 0.3s',
        }),
      ).toEqual({
        transition: [
          'opacity 0.2s cubic-bezier(0.1, 0.2, 0.3, 1)',
          'transform 0.3s',
        ].join(', '),
      });
    });

    it('recognizes steps() and linear() easing functions', () => {
      expect(
        transitionStyle({
          transition:
            'opacity 0.2s steps(4, jump-end), color 0.3s linear(0, 1)',
        }),
      ).toEqual({
        transition: [
          'opacity 0.2s steps(4, jump-end)',
          'color 0.3s linear(0, 1)',
        ].join(', '),
      });
    });

    it('does not treat prefixed easing keywords as easing', () => {
      expect(
        transitionStyle({ transition: 'opacity ease-in-invalid' }),
      ).toEqual({ transition: 'opacity ease-in-invalid' });
    });
  });

  describe('semantic name only (no timing, no easing)', () => {
    it('handles semantic name without any timing or easing', () => {
      const result = transitionStyle({ transition: 'theme' });
      expect(result).toBeDefined();
      expect(result!.transition).toContain(
        'var(--theme-transition, var(--transition))',
      );
    });
  });

  describe('non-semantic property names', () => {
    it('passes through unknown names as literal CSS properties', () => {
      const result = transitionStyle({ transition: 'transform 0.3s' });
      expect(result).toEqual({
        transition: 'transform 0.3s',
      });
    });
  });

  describe('CSS custom property names ($$token / ##token)', () => {
    it('handles custom property with explicit timing', () => {
      const result = transitionStyle({ transition: '--angle 0.3s' });
      expect(result).toEqual({
        transition: '--angle 0.3s',
      });
    });

    it('handles custom property without timing (no double -- prefix)', () => {
      const result = transitionStyle({ transition: '--angle' });
      expect(result).toEqual({
        transition: '--angle var(--angle-transition, var(--transition))',
      });
    });

    it('handles custom property with easing only', () => {
      const result = transitionStyle({
        transition: '--accent-color ease-in',
      });
      expect(result).toEqual({
        transition:
          '--accent-color var(--accent-color-transition, var(--transition)) ease-in',
      });
    });

    it('handles custom property with easing and delay', () => {
      const result = transitionStyle({
        transition: '--angle ease-out 0.1s',
      });
      expect(result).toEqual({
        transition:
          '--angle var(--angle-transition, var(--transition)) ease-out 0.1s',
      });
    });

    it('handles multiple custom properties', () => {
      const result = transitionStyle({
        transition: '--angle 0.3s, --accent-color ease-in',
      });
      expect(result).toEqual({
        transition: [
          '--angle 0.3s',
          '--accent-color var(--accent-color-transition, var(--transition)) ease-in',
        ].join(', '),
      });
    });
  });

  describe('deduplication via map', () => {
    it('later transitions override earlier ones for same CSS properties', () => {
      const result = transitionStyle({
        transition: 'fill 0.2s, fill 0.5s ease-out',
      });
      expect(result).toEqual({
        transition: [
          'background-color 0.5s ease-out',
          'background-image 0.5s ease-out',
          '--tasty-second-fill-color 0.5s ease-out',
        ].join(', '),
      });
    });

    it('keeps an explicitly named property when a later group covers it', () => {
      expect(
        transitionStyle({ transition: 'opacity 120ms ease-in-out, theme' }),
      ).toEqual({
        transition: [
          'opacity 120ms ease-in-out',
          'color var(--theme-transition, var(--transition))',
          'background-color var(--theme-transition, var(--transition))',
          'background-image var(--theme-transition, var(--transition))',
          'box-shadow var(--theme-transition, var(--transition))',
          'border var(--theme-transition, var(--transition))',
          'border-radius var(--theme-transition, var(--transition))',
          'outline var(--theme-transition, var(--transition))',
          '--tasty-second-fill-color var(--theme-transition, var(--transition))',
        ].join(', '),
      });
    });

    it('lets a named property override an earlier group that covers it', () => {
      const result = transitionStyle({
        transition: 'theme 0.5s, opacity 120ms ease-in-out',
      });

      expect(result?.transition).toContain('opacity 120ms ease-in-out');
      expect(result?.transition).toContain('color 0.5s');
      expect(result?.transition).not.toContain('opacity 0.5s');
    });

    it('treats a semantic name that maps to one property as named', () => {
      const result = transitionStyle({ transition: 'shadow 1s, theme 0.5s' });

      expect(result?.transition).toContain('box-shadow 1s');
      expect(result?.transition).not.toContain('box-shadow 0.5s');
    });

    it('still resolves two named entries for one property last-wins', () => {
      expect(
        transitionStyle({ transition: 'opacity 1s, opacity 2s linear' }),
      ).toEqual({ transition: 'opacity 2s linear' });
    });

    it('preserves first insertion order when a later semantic overlaps', () => {
      expect(transitionStyle({ transition: 'fill 0.2s, theme 0.5s' })).toEqual({
        transition: [
          'background-color 0.5s',
          'background-image 0.5s',
          '--tasty-second-fill-color 0.5s',
          'color 0.5s',
          'box-shadow 0.5s',
          'border 0.5s',
          'border-radius 0.5s',
          'outline 0.5s',
          'opacity 0.5s',
        ].join(', '),
      });
    });
  });
});
