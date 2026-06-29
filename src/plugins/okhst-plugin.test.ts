import { StyleParser } from '../parser/parser';

import { okhstFunc, okhstPlugin } from './okhst-plugin';

describe('okhstPlugin', () => {
  describe('plugin factory', () => {
    it('returns a valid TastyPlugin', () => {
      const plugin = okhstPlugin();
      expect(plugin.name).toBe('okhst');
      expect(plugin.functions).toBeDefined();
      expect(plugin.functions?.okhst).toBe(okhstFunc);
    });
  });

  describe('okhstFunc', () => {
    const parser = new StyleParser({
      funcs: { okhst: okhstFunc },
    });

    describe('angle parsing', () => {
      it('parses unitless angles as degrees', () => {
        const result = parser.process('okhst(0 50% 50%)');
        expect(result.output).toBe('rgb(66% 34.6% 45%)');
      });

      it('parses deg unit', () => {
        const result = parser.process('okhst(180deg 50% 50%)');
        expect(result.output).toBe('rgb(27.5% 51.2% 46.6%)');
      });

      it('parses turn unit', () => {
        const result = parser.process('okhst(0.5turn 50% 50%)');
        expect(result.output).toBe('rgb(27.5% 51.2% 46.6%)');
      });

      it('parses rad unit', () => {
        const result = parser.process('okhst(3.14159rad 50% 50%)');
        expect(result.output).toBe('rgb(27.5% 51.2% 46.6%)');
      });
    });

    describe('color conversion', () => {
      it('converts black (T=0)', () => {
        const result = parser.process('okhst(0 0% 0%)');
        expect(result.output).toBe('rgb(0% 0% 0%)');
      });

      it('converts white (T=100%)', () => {
        const result = parser.process('okhst(0 0% 100%)');
        expect(result.output).toBe('rgb(100% 100% 100%)');
      });

      it('converts gray (S=0)', () => {
        // With zero saturation, hue is irrelevant
        const result = parser.process('okhst(180 0% 50%)');
        expect(result.output).toBe('rgb(46% 46% 46%)');
      });
    });

    describe('percentage parsing', () => {
      it('handles percentage notation for S and T', () => {
        const result = parser.process('okhst(0 100% 50%)');
        expect(result.output).toBe('rgb(83.2% 0% 43.9%)');
      });

      it('handles decimal values without percent', () => {
        const result = parser.process('okhst(0 1 0.5)');
        expect(result.output).toBe('rgb(83.2% 0% 43.9%)');
      });
    });

    describe('edge cases', () => {
      it('clamps saturation above 100%', () => {
        const result = parser.process('okhst(0 150% 50%)');
        expect(result.output).toBe('rgb(83.2% 0% 43.9%)');
      });

      it('clamps tone above 100%', () => {
        const result = parser.process('okhst(0 50% 150%)');
        // Should clamp to white
        expect(result.output).toBe('rgb(100% 100% 100%)');
      });

      it('handles negative hue (wraps around)', () => {
        // -90deg should equal 270deg
        const resultNeg = parser.process('okhst(-90deg 50% 50%)');
        const resultPos = parser.process('okhst(270deg 50% 50%)');
        expect(resultNeg.output).toBe(resultPos.output);
        expect(resultNeg.output).toBe('rgb(36.9% 44.6% 69.9%)');
      });

      it('handles hue > 360 (wraps around)', () => {
        // 450deg should equal 90deg
        const resultOver = parser.process('okhst(450deg 50% 50%)');
        const resultNorm = parser.process('okhst(90deg 50% 50%)');
        expect(resultOver.output).toBe(resultNorm.output);
        expect(resultOver.output).toBe('rgb(52.6% 45.4% 25.6%)');
      });

      it('returns fallback for missing values', () => {
        // Silence expected warning
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
          /* noop */
        });

        // Directly test okhstFunc with empty groups
        const result = okhstFunc([]);
        expect(result).toBe('rgb(0% 0% 0%)');
        expect(warnSpy).toHaveBeenCalledWith(
          '[okhst] Expected 3 values (H S T), got:',
          [],
        );

        warnSpy.mockRestore();
      });
    });

    describe('output format', () => {
      it('outputs rgb() with percentage syntax', () => {
        const result = parser.process('okhst(200 60% 40%)');
        expect(result.output).toBe('rgb(17.9% 42.3% 43.6%)');
      });
    });

    describe('alpha / opacity', () => {
      it('preserves alpha with slash syntax', () => {
        const result = parser.process('okhst(200 60% 40% / .5)');
        expect(result.output).toBe('rgb(17.9% 42.3% 43.6% / .5)');
      });

      it('preserves alpha value of 0', () => {
        const result = parser.process('okhst(0 0% 0% / 0)');
        expect(result.output).toBe('rgb(0% 0% 0% / 0)');
      });

      it('preserves alpha value of 1', () => {
        const result = parser.process('okhst(0 100% 50% / 1)');
        expect(result.output).toBe('rgb(83.2% 0% 43.9% / 1)');
      });

      it('produces same color channels with and without alpha', () => {
        const withoutAlpha = parser.process('okhst(240 50% 50%)');
        const withAlpha = parser.process('okhst(240 50% 50% / .7)');
        // Extract just the color channels (before the /)
        const channelsOnly = withAlpha.output.replace(/ \/ .+\)$/, ')');
        expect(channelsOnly).toBe(withoutAlpha.output);
      });
    });
  });
});
