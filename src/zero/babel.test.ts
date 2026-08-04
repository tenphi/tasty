import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { transformSync } from '@babel/core';

import { resetConfig } from '../config';

import babelPlugin from './babel';
import { clearWriterCache } from './writer-cache';

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tasty-babel-test-'));
}

function transformCode(
  code: string,
  pluginOptions: Record<string, unknown> = {},
): string | null | undefined {
  const result = transformSync(code, {
    filename: 'test.tsx',
    plugins: [[babelPlugin, pluginOptions]],
    parserOpts: {
      plugins: ['typescript', 'jsx'],
    },
    babelrc: false,
    configFile: false,
  });

  return result?.code;
}

describe('babel plugin', () => {
  describe('inject mode', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = createTempDir();
    });

    afterEach(() => {
      clearWriterCache();
      resetConfig();
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('should rewrite import to @tenphi/tasty/static/inject', () => {
      const outputPath = path.join(tempDir, 'output.css');

      const code = `
import { tastyStatic } from '@tenphi/tasty/static';

const button = tastyStatic({
  display: 'block',
});
`;

      const result = transformCode(code, {
        output: outputPath,
        mode: 'inject',
      });

      expect(result).toContain('@tenphi/tasty/static/inject');
      expect(result).toContain('injectCSS as _$i');
      expect(result).not.toContain("'@tenphi/tasty/static'");
    });

    it('should embed CSS inline for styles mode', () => {
      const outputPath = path.join(tempDir, 'output.css');

      const code = `
import { tastyStatic } from '@tenphi/tasty/static';

const button = tastyStatic({
  display: 'block',
});
`;

      const result = transformCode(code, {
        output: outputPath,
        mode: 'inject',
      });

      expect(result).toContain('_$i(');
      expect(result).toContain('display');
      expect(result).toContain('block');
      expect(result).toContain('className');
      // Should not write CSS file
      expect(fs.existsSync(outputPath)).toBe(false);
    });

    it('should handle selector mode with inject call', () => {
      const outputPath = path.join(tempDir, 'output.css');

      const code = `
import { tastyStatic } from '@tenphi/tasty/static';

tastyStatic('body', {
  margin: 0,
  padding: 0,
});
`;

      const result = transformCode(code, {
        output: outputPath,
        mode: 'inject',
      });

      expect(result).toContain('_$i(');
      expect(result).toContain('"body"');
      expect(result).toContain('margin');
      expect(result).toContain('padding');
      expect(result).not.toContain('tastyStatic');
    });

    it('should handle extension mode with inject call', () => {
      const outputPath = path.join(tempDir, 'output.css');

      const code = `
import { tastyStatic } from '@tenphi/tasty/static';

const base = tastyStatic({
  display: 'flex',
});

const extended = tastyStatic(base, {
  gap: '8px',
});
`;

      const result = transformCode(code, {
        output: outputPath,
        mode: 'inject',
      });

      expect(result).toContain('_$i(');
      expect(result).toContain('className');
      expect(result).toContain('display');
      expect(result).toContain('flex');
      expect(result).toContain('gap');
      expect(result).not.toContain('tastyStatic');
    });

    it('should inject token CSS when tokens are configured', () => {
      const outputPath = path.join(tempDir, 'output.css');

      const code = `
import { tastyStatic } from '@tenphi/tasty/static';

const button = tastyStatic({
  display: 'block',
});
`;

      const result = transformCode(code, {
        output: outputPath,
        mode: 'inject',
        config: {
          tokens: {
            $gap: '16px',
          },
        },
      });

      expect(result).toContain('_$i(":root"');
      expect(result).toContain('--gap');
    });

    it('should not inject token CSS when no tokens configured', () => {
      const outputPath = path.join(tempDir, 'output.css');

      const code = `
import { tastyStatic } from '@tenphi/tasty/static';

const button = tastyStatic({
  display: 'block',
});
`;

      const result = transformCode(code, {
        output: outputPath,
        mode: 'inject',
      });

      expect(result).not.toContain('":root"');
    });

    it('should not write CSS file in inject mode', () => {
      const outputPath = path.join(tempDir, 'output.css');

      const code = `
import { tastyStatic } from '@tenphi/tasty/static';

const button = tastyStatic({
  display: 'block',
});
`;

      transformCode(code, {
        output: outputPath,
        mode: 'inject',
      });

      expect(fs.existsSync(outputPath)).toBe(false);
    });
  });

  describe('configFile option', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = createTempDir();
    });

    afterEach(() => {
      clearWriterCache();
      resetConfig();
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('should load config from configFile path', () => {
      const configPath = path.join(tempDir, 'tasty-zero.config.ts');
      const outputPath = path.join(tempDir, 'output.css');

      fs.writeFileSync(
        configPath,
        `export default {
  states: {
    '@mobile': '@media (max-width: 767px)',
  },
};
`,
      );

      const code = `
import { tastyStatic } from '@tenphi/tasty/static';

const button = tastyStatic({
  display: 'block',
});
`;

      const result = transformCode(code, {
        output: outputPath,
        configFile: configPath,
      });

      expect(result).toBeDefined();
      expect(result).not.toContain('tastyStatic');
      expect(result).not.toContain('@tenphi/tasty/static');
      expect(result).toContain('className');

      expect(fs.existsSync(outputPath)).toBe(true);
      const css = fs.readFileSync(outputPath, 'utf-8');
      expect(css).toContain('display');
      expect(css).toContain('block');
    });

    it('should prefer config over configFile when both are set', () => {
      const configPath = path.join(tempDir, 'tasty-zero.config.ts');
      const outputPath = path.join(tempDir, 'output.css');

      fs.writeFileSync(configPath, `export default { devMode: true };`);

      const code = `
import { tastyStatic } from '@tenphi/tasty/static';

const button = tastyStatic({
  display: 'flex',
});
`;

      const result = transformCode(code, {
        output: outputPath,
        config: { devMode: false },
        configFile: configPath,
      });

      expect(result).toBeDefined();
      expect(result).toContain('className');

      const css = fs.readFileSync(outputPath, 'utf-8');
      expect(css).not.toContain('/* from:');
    });

    it('should include configFile in cache invalidation deps', () => {
      const configPath = path.join(tempDir, 'tasty-zero.config.ts');
      const outputPath1 = path.join(tempDir, 'output1.css');
      const outputPath2 = path.join(tempDir, 'output2.css');

      fs.writeFileSync(configPath, `export default {};`);

      const code = `
import { tastyStatic } from '@tenphi/tasty/static';

const button = tastyStatic({
  display: 'block',
});
`;

      const result1 = transformCode(code, {
        output: outputPath1,
        configFile: configPath,
      });

      expect(result1).toContain('className');

      fs.writeFileSync(configPath, `export default { devMode: true };`);

      const result2 = transformCode(code, {
        output: outputPath2,
        configFile: configPath,
      });

      expect(result2).toContain('className');
    });

    it('should work without configFile (fallback to empty config)', () => {
      const outputPath = path.join(tempDir, 'output.css');

      const code = `
import { tastyStatic } from '@tenphi/tasty/static';

const button = tastyStatic({
  display: 'block',
});
`;

      const result = transformCode(code, {
        output: outputPath,
      });

      expect(result).toBeDefined();
      expect(result).not.toContain('tastyStatic');
      expect(result).toContain('className');
    });

    it('should use devMode from configFile for source comments', () => {
      const configPath = path.join(tempDir, 'tasty-zero.config.ts');
      const outputPath = path.join(tempDir, 'output.css');

      fs.writeFileSync(configPath, `export default { devMode: true };`);

      const code = `
import { tastyStatic } from '@tenphi/tasty/static';

const button = tastyStatic({
  display: 'block',
});
`;

      const result = transformCode(code, {
        output: outputPath,
        configFile: configPath,
      });

      expect(result).toContain('className');

      const css = fs.readFileSync(outputPath, 'utf-8');
      expect(css).toContain('/* from:');
    });

    it('should accumulate CSS from multiple files compiled to the same output', () => {
      const outputPath = path.join(tempDir, 'output.css');

      const fileA = `
import { tastyStatic } from '@tenphi/tasty/static';

tastyStatic('body', {
  margin: 0,
  padding: 0,
});
`;

      const fileB = `
import { tastyStatic } from '@tenphi/tasty/static';

const card = tastyStatic({
  display: 'flex',
  gap: '8px',
});
`;

      const fileC = `
// A file with no tastyStatic calls
export const x = 1;
`;

      transformCode(fileA, { output: outputPath });
      transformCode(fileB, { output: outputPath });
      transformCode(fileC, { output: outputPath });

      expect(fs.existsSync(outputPath)).toBe(true);
      const css = fs.readFileSync(outputPath, 'utf-8');

      // CSS from file A (selector mode)
      expect(css).toContain('body');
      expect(css).toContain('margin');
      expect(css).toContain('padding');

      // CSS from file B (styles mode)
      expect(css).toContain('display');
      expect(css).toContain('flex');
      expect(css).toContain('gap');
    });

    it('should reset writer when config changes', () => {
      const configPath = path.join(tempDir, 'tasty-zero.config.ts');
      const outputPath = path.join(tempDir, 'output.css');

      fs.writeFileSync(configPath, `export default {};`);

      const codeA = `
import { tastyStatic } from '@tenphi/tasty/static';

tastyStatic('body', { display: 'block' });
`;

      transformCode(codeA, {
        output: outputPath,
        configFile: configPath,
      });

      const css1 = fs.readFileSync(outputPath, 'utf-8');
      expect(css1).toContain('display');

      // Simulate config change by touching the file
      const now = new Date();
      fs.utimesSync(configPath, now, now);

      fs.writeFileSync(
        configPath,
        `export default { tokens: { '$gap': '16px' } };`,
      );

      const codeB = `
import { tastyStatic } from '@tenphi/tasty/static';

tastyStatic('html', { margin: 0 });
`;

      transformCode(codeB, {
        output: outputPath,
        configFile: configPath,
      });

      const css2 = fs.readFileSync(outputPath, 'utf-8');
      // After config change, old CSS from file A is gone (writer was reset)
      expect(css2).not.toContain('display');
      // New file B CSS is present
      expect(css2).toContain('margin');
      // New token from updated config is present
      expect(css2).toContain('--gap');
    });
  });
});
