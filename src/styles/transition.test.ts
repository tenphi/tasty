import { transitionStyle } from './transition';

describe('transitionStyle', () => {
  describe('basic functionality', () => {
    it('returns undefined when no transition is provided', () => {
      expect(transitionStyle({ transition: undefined })).toBeUndefined();
      expect(transitionStyle({ transition: '' })).toBeUndefined();
      expect(transitionStyle({ transition: false })).toBeUndefined();
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
        transition:
          '--angle var(--angle-transition, var(--transition))',
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
  });
});
