import { resolve } from 'node:path';

import ts from 'typescript';

describe('tasty component prop types', () => {
  it('preserves component props and only claims configured or base style props', () => {
    const root = resolve(__dirname, '..');
    const configFile = ts.readConfigFile(
      resolve(root, 'tsconfig.json'),
      ts.sys.readFile,
    );
    const config = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      root,
    );
    const fixture = resolve(root, 'src/tasty-props-type-fixture.tsx');
    const source = `
      import type { ComponentType, ComponentProps } from 'react';
      import { createElement, createRef, forwardRef, memo } from 'react';
      import { tasty } from './index';
      import { tasty as directTasty } from './tasty';
      import type { BaseStyleProps } from './types';

      declare module './types' {
        interface TastyBaseStylePropNames { margin: true; }
        interface TastyCustomProps { customTone: 'light' | 'dark'; }
      }

      interface PanelProps {
        position: 'top-right' | 'bottom-left';
        color: 'brand' | 'muted';
        width: number;
        className?: string;
        onPick?: (value: 'top-right' | 'bottom-left') => void;
      }
      declare const Panel: ComponentType<PanelProps>;
      declare const DisplayOwner: ComponentType<{ display: 'expanded' | 'collapsed' }>;
      type Assert<T extends true> = T;
      type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends
        (<T>() => T extends B ? 1 : 2) ? true : false;

      for (const factory of [tasty, directTasty]) {
        const Sidebar = factory({ as: Panel, styles: { position: 'relative' } });
        const valid = <Sidebar position="top-right" color="brand" width={12}
          title="Panel" margin="2x" customTone="light"
          onPick={(value) => { const position: PanelProps['position'] = value; }} />;
        type Props = ComponentProps<typeof Sidebar>;
        type Position = Assert<Equal<Props['position'], PanelProps['position']>>;
        type Color = Assert<Equal<Props['color'], PanelProps['color']>>;
        type Width = Assert<Equal<Props['width'], number>>;

        const MemoSidebar = factory({ as: memo(Panel) });
        const memoSidebar = <MemoSidebar position="top-right" color="brand" width={12} />;
        // @ts-expect-error Memo components retain the wrapped prop domain.
        const invalidMemo = <MemoSidebar position="absolute" color="brand" width={12} />;
        const RefPanel = forwardRef<HTMLDivElement, PanelProps>((_props, ref) =>
          createElement('div', { ref }));
        const RefSidebar = factory({ as: RefPanel });
        const refSidebar = <RefSidebar position="top-right" color="brand" width={12}
          ref={createRef<HTMLDivElement>()} />;
        // @ts-expect-error Forward-ref components retain the wrapped prop domain.
        const invalidRef = <RefSidebar position="absolute" color="brand" width={12} />;

        // @ts-expect-error Component position retains its own domain.
        const cssPosition = <Sidebar position="absolute" color="brand" width={12} />;
        // @ts-expect-error Component position remains required.
        const missingPosition = <Sidebar color="brand" width={12} />;
        // @ts-expect-error Component color remains required.
        const missingColor = <Sidebar position="top-right" width={12} />;
        // @ts-expect-error Component color retains its own domain.
        const cssColor = <Sidebar position="top-right" color="#purple" width={12} />;
        // @ts-expect-error Component width retains its own numeric type.
        const cssWidth = <Sidebar position="top-right" color="brand" width="2x" />;
        // @ts-expect-error Undeclared, unconfigured styles are not component props.
        const implicitPadding = <Sidebar position="top-right" color="brand" width={12} padding="2x" />;

        const Padded = factory({
          as: Panel,
          styleProps: ['padding'] as const,
          modProps: ['active'] as const,
          tokenProps: { tone: '#tone' } as const,
          variants: { default: { opacity: 0.5 }, strong: { opacity: 1 } },
        });
        const padded = <Padded position="top-right" color="muted" width={12}
          padding={{ '': '1x', active: '2x' }} active tone="#purple" variant="strong" />;
        // @ts-expect-error Configured variants retain their key restrictions.
        const unknownVariant = <Padded position="top-right" color="brand" width={12} variant="unknown" />;

        // An explicitly claimed style prop is consumed at runtime and stays a style value.
        const Positioned = factory({ as: Panel, styleProps: ['position'] as const });
        const positioned = <Positioned position="absolute" color="brand" width={12} />;
        // @ts-expect-error Explicit styleProps still claim the CSS position domain.
        const componentPosition = <Positioned position="top-right" color="brand" width={12} />;

        const BaseStyled = factory({ as: DisplayOwner });
        type Display = Assert<Equal<ComponentProps<typeof BaseStyled>['display'], BaseStyleProps['display']>>;
        const baseStyled = <BaseStyled display="flex" />;

        const Button = factory({ as: 'button' });
        const button = <Button type="button" display="flex" onClick={(event) => {
          const disabled: boolean = event.currentTarget.disabled;
        }} />;
        // @ts-expect-error Intrinsic attributes keep their element-specific types.
        const invalidButton = <Button type="invalid" />;
        const Image = factory({ as: 'img' });
        const image = <Image src="/image.png" alt="" />;
        const Link = (_props: { href: { pathname: string } }) => null;
        const StyledLink = factory({ as: Link });
        const link = <StyledLink href={{ pathname: '/blog' }} />;
        // @ts-expect-error Custom component attributes retain their declared types.
        const invalidLink = <StyledLink href="/blog" />;
        const Box = factory({ styleProps: ['position', 'width'] as const });
        const box = <Box position="absolute" width="2x" />;

        const Wrapped = factory(Sidebar);
        const wrapped = <Wrapped position="top-right" color="brand" width={12} />;
        // @ts-expect-error The component-extension form retains the wrapped prop domain.
        const invalidWrapped = <Wrapped position="absolute" color="brand" width={12} />;
      }
    `;
    const host = ts.createCompilerHost(config.options);
    const original = host.getSourceFile.bind(host);
    host.getSourceFile = (fileName, languageVersion, ...rest) =>
      fileName === fixture
        ? ts.createSourceFile(fileName, source, languageVersion, true)
        : original(fileName, languageVersion, ...rest);
    const program = ts.createProgram([fixture], config.options, host);
    const file = program.getSourceFile(fixture)!;
    const diagnostics = [
      ...program.getSyntacticDiagnostics(file),
      ...program.getSemanticDiagnostics(file),
    ];

    expect(
      diagnostics.map((diagnostic) => {
        const { line } = file.getLineAndCharacterOfPosition(
          diagnostic.start ?? 0,
        );
        return `Line ${line + 1}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`;
      }),
    ).toEqual([]);
  }, 30_000);
});
