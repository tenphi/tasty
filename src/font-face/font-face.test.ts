/**
 * @vitest-environment jsdom
 */
import type { FontFaceDescriptors, FontFaceInput } from '../injector/types';
import type { Styles } from '../styles/types';

import {
  extractLocalFontFace,
  fontFaceContentHash,
  formatFontFaceRule,
  formatFontFaceRules,
  hasLocalFontFace,
} from './index';

describe('Font Face Utilities', () => {
  describe('hasLocalFontFace', () => {
    it('should return false when no @fontFace defined', () => {
      const styles: Styles = {
        padding: '2x',
        fill: '#purple',
      };
      expect(hasLocalFontFace(styles)).toBe(false);
    });

    it('should return true when @fontFace is defined', () => {
      const styles: Styles = {
        padding: '2x',
        '@fontFace': {
          'Brand Sans': {
            src: 'url("/fonts/brand.woff2") format("woff2")',
          },
        },
      };
      expect(hasLocalFontFace(styles)).toBe(true);
    });
  });

  describe('extractLocalFontFace', () => {
    it('should return null when no @fontFace defined', () => {
      const styles: Styles = { padding: '2x' };
      expect(extractLocalFontFace(styles)).toBeNull();
    });

    it('should extract @fontFace from styles', () => {
      const fontFace: Record<string, FontFaceInput> = {
        'Brand Sans': {
          src: 'url("/fonts/brand.woff2") format("woff2")',
          fontWeight: 400,
          fontDisplay: 'swap',
        },
      };
      const styles: Styles = {
        padding: '2x',
        '@fontFace': fontFace,
      };
      expect(extractLocalFontFace(styles)).toEqual(fontFace);
    });

    it('should extract array form @fontFace', () => {
      const fontFace: Record<string, FontFaceInput> = {
        'Brand Sans': [
          {
            src: 'url("/fonts/regular.woff2") format("woff2")',
            fontWeight: 400,
          },
          { src: 'url("/fonts/bold.woff2") format("woff2")', fontWeight: 700 },
        ],
      };
      const styles: Styles = {
        '@fontFace': fontFace,
      };
      const result = extractLocalFontFace(styles);
      expect(result).toEqual(fontFace);
      expect(Array.isArray(result!['Brand Sans'])).toBe(true);
    });
  });

  describe('formatFontFaceRule', () => {
    it('should format a basic @font-face rule', () => {
      const desc: FontFaceDescriptors = {
        src: 'url("/fonts/brand.woff2") format("woff2")',
      };
      const css = formatFontFaceRule('Brand Sans', desc);
      expect(css).toContain('@font-face');
      expect(css).toContain('font-family: "Brand Sans"');
      expect(css).toContain('src: url("/fonts/brand.woff2") format("woff2")');
    });

    it('should include all specified descriptors', () => {
      const desc: FontFaceDescriptors = {
        src: 'url("/fonts/brand.woff2") format("woff2")',
        fontWeight: '400 700',
        fontStyle: 'normal',
        fontDisplay: 'swap',
        unicodeRange: 'U+0000-00FF',
      };
      const css = formatFontFaceRule('Brand Sans', desc);
      expect(css).toContain('font-weight: 400 700');
      expect(css).toContain('font-style: normal');
      expect(css).toContain('font-display: swap');
      expect(css).toContain('unicode-range: U+0000-00FF');
    });

    it('should omit undefined descriptors', () => {
      const desc: FontFaceDescriptors = {
        src: 'url("/fonts/brand.woff2") format("woff2")',
        fontWeight: 400,
      };
      const css = formatFontFaceRule('Brand Sans', desc);
      expect(css).not.toContain('font-style');
      expect(css).not.toContain('font-display');
      expect(css).not.toContain('unicode-range');
    });
  });

  describe('formatFontFaceRules', () => {
    it('should handle single descriptor', () => {
      const desc: FontFaceDescriptors = {
        src: 'url("/fonts/brand.woff2") format("woff2")',
      };
      const rules = formatFontFaceRules('Test', desc);
      expect(rules).toHaveLength(1);
      expect(rules[0]).toContain('@font-face');
    });

    it('should handle array of descriptors', () => {
      const input: FontFaceInput = [
        { src: 'url("/fonts/regular.woff2") format("woff2")', fontWeight: 400 },
        { src: 'url("/fonts/bold.woff2") format("woff2")', fontWeight: 700 },
      ];
      const rules = formatFontFaceRules('Test', input);
      expect(rules).toHaveLength(2);
      expect(rules[0]).toContain('font-weight: 400');
      expect(rules[1]).toContain('font-weight: 700');
    });
  });

  describe('fontFaceContentHash', () => {
    it('should produce same hash for same content', () => {
      const desc: FontFaceDescriptors = {
        src: 'url("/fonts/brand.woff2") format("woff2")',
        fontWeight: 400,
      };
      const hash1 = fontFaceContentHash('Brand Sans', desc);
      const hash2 = fontFaceContentHash('Brand Sans', desc);
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different content', () => {
      const desc1: FontFaceDescriptors = {
        src: 'url("/fonts/regular.woff2") format("woff2")',
        fontWeight: 400,
      };
      const desc2: FontFaceDescriptors = {
        src: 'url("/fonts/bold.woff2") format("woff2")',
        fontWeight: 700,
      };
      const hash1 = fontFaceContentHash('Brand Sans', desc1);
      const hash2 = fontFaceContentHash('Brand Sans', desc2);
      expect(hash1).not.toBe(hash2);
    });

    it('should produce different hashes for different families', () => {
      const desc: FontFaceDescriptors = {
        src: 'url("/fonts/font.woff2") format("woff2")',
      };
      const hash1 = fontFaceContentHash('Font A', desc);
      const hash2 = fontFaceContentHash('Font B', desc);
      expect(hash1).not.toBe(hash2);
    });
  });
});
