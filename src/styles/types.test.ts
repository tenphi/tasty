import { resolve } from 'node:path';

import ts from 'typescript';

describe('overscroll behavior style types', () => {
  it('accepts chain in longhands and state maps without widening other values', () => {
    const root = resolve(__dirname, '../..');
    const configFile = ts.readConfigFile(
      resolve(root, 'tsconfig.json'),
      ts.sys.readFile,
    );
    const config = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      root,
    );
    const fixture = resolve(root, 'src/overscroll-type-fixture.ts');
    const source = `
      import { tasty } from './index';
      import type { Styles } from './index';

      const direct = {
        overscrollBehavior: 'chain contain',
        overscrollBehaviorBlock: 'chain',
        overscrollBehaviorInline: 'chain',
        overscrollBehaviorX: 'chain',
        overscrollBehaviorY: 'chain',
      } satisfies Styles;

      const states = {
        overscrollBehaviorBlock: { '': 'auto', active: 'chain' },
        overscrollBehaviorInline: { '': 'contain', active: 'chain' },
        overscrollBehaviorX: { '': 'none', active: 'chain' },
        overscrollBehaviorY: { _: 'auto', '@supports(overscroll-behavior-y: chain)': 'chain' },
      } satisfies Styles;

      tasty({ styles: direct });
      tasty({ styles: states });

      // @ts-expect-error Longhands accept one keyword, not shorthand pairs.
      const invalidBlock: Styles['overscrollBehaviorBlock'] = 'chain contain';
      // @ts-expect-error Longhands retain their existing keyword restrictions.
      const invalidInline: Styles['overscrollBehaviorInline'] = 'invalid';
      // @ts-expect-error State maps retain their existing keyword restrictions.
      const invalidX: Styles['overscrollBehaviorX'] = { active: 'invalid' };
      // @ts-expect-error Longhands accept one keyword, not shorthand pairs.
      const invalidY: Styles['overscrollBehaviorY'] = 'chain contain';
    `;
    const host = ts.createCompilerHost(config.options);
    const getSourceFile = host.getSourceFile.bind(host);
    host.getSourceFile = (fileName, languageVersion, ...rest) =>
      fileName === fixture
        ? ts.createSourceFile(fileName, source, languageVersion, true)
        : getSourceFile(fileName, languageVersion, ...rest);

    const program = ts.createProgram([fixture], config.options, host);
    const diagnostics = program.getSemanticDiagnostics(
      program.getSourceFile(fixture),
    );

    expect(
      diagnostics.map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
      ),
    ).toEqual([]);
  });
});
