import { resolve } from 'node:path';

import ts from 'typescript';

describe('tasty component and filtered prop types', () => {
  it('preserves component props and types only retained filtered props', () => {
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
      import { tasty, filterBaseProps } from './index';
      import { filterBaseProps as coreFilter } from './core';
      import { filterBaseProps as directFilter } from './utils/filter-base-props';
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

      const ColoredBox = tasty({ styleProps: ['color', 'width'] as const });
      const PlainBox = tasty({ as: 'div' });
      declare const boxProps: ComponentProps<typeof ColoredBox>;
      const props = {
        id: 'trigger' as const,
        title: 'Details',
        inert: true,
        'aria-label': 'Open',
        'aria-': 'bare prefix',
        'data-state': 'open',
        'data-': 'bare prefix',
        color: { '': '#purple', active: '#red' },
        width: { '': '2x', active: '4x' },
        unknown: 123,
        onClick: (event: MouseEvent) => event.type,
        onCustom: () => true,
        onA1: () => true,
        onA: () => true,
        onclick: () => true,
        onÄvent: () => true,
        onPress: () => true,
        onHoverStart: () => true,
        onHoverEnd: () => true,
        onPressStart: () => true,
        onPressEnd: () => true,
      };
      type BaseKeys = 'id' | 'title' | 'inert' | 'aria-label' | 'aria-' |
        'data-state' | 'data-';
      type EventKeys = 'onClick' | 'onCustom' | 'onA1';

      for (const filter of [filterBaseProps, coreFilter, directFilter]) {
        const filtered = filter(props);
        type Base = Assert<Equal<typeof filtered, Partial<Pick<typeof props, BaseKeys>>>>;
        // @ts-expect-error Style props are absent after default filtering.
        filtered.color;
        // @ts-expect-error Events require opt-in.
        filtered.onClick;
        const literal: 'trigger' | undefined = filtered.id;
        const plain = <div {...filter(boxProps)} />;
        const styled = <PlainBox {...filter(boxProps)} />;
        const explicitGeneric = <div {...filter<typeof boxProps>(boxProps)} />;

        const empty = filter(props, {});
        type Empty = Assert<Equal<typeof empty, typeof filtered>>;
        const disabled = filter(props, { eventProps: false });
        type Disabled = Assert<Equal<typeof disabled, typeof filtered>>;
        const events = filter(props, { eventProps: true });
        type Events = Assert<Equal<typeof events,
          Partial<Pick<typeof props, BaseKeys | EventKeys>>>>;
        const preservedEvent: typeof props.onClick | undefined = events.onClick;

        const names = new Set<'unknown' | 'onPress'>(['unknown', 'onPress']);
        const custom = filter(props, { propNames: names });
        type Custom = Assert<Equal<typeof custom,
          Partial<Pick<typeof props, BaseKeys | 'unknown' | 'onPress'>>>>;
        const both = filter(props, { propNames: names, eventProps: true });
        type Both = Assert<Equal<typeof both,
          Partial<Pick<typeof props, BaseKeys | EventKeys | 'unknown' | 'onPress'>>>>;
        const readonlyNames: ReadonlySet<'color'> = new Set(['color']);
        const colors = filter(props, { propNames: readonlyNames });
        type Color = Assert<Equal<typeof colors.color, typeof props.color | undefined>>;
        // @ts-expect-error Explicitly retained state-map colors still conflict with native color.
        const invalidColor = <div {...colors} />;

        const dynamicEvents: boolean = Math.random() > 0.5;
        const dynamic = filter(props, { eventProps: dynamicEvents });
        type Dynamic = Assert<Equal<typeof dynamic, typeof events>>;
        const options: { eventProps?: boolean; propNames?: Set<'unknown'> } = {};
        const optional = filter(props, options);
        type Optional = Assert<Equal<typeof optional,
          Partial<Pick<typeof props, BaseKeys | EventKeys | 'unknown'>>>>;
        const maybeOptions: typeof options | undefined = Math.random() > 0.5 ? options : undefined;
        const maybe = filter(props, maybeOptions);
        type Maybe = Assert<Equal<typeof maybe, typeof optional>>;
        const dynamicNames: Set<string> = new Set(['color']);
        const broad = filter(props, { propNames: dynamicNames });
        type Broad = Assert<Equal<typeof broad, Partial<typeof props>>>;
        const genericOptions = filter<typeof props>(props, { eventProps: true });
        const genericEvent: typeof props.onClick | undefined = genericOptions.onClick;

        const symbol = Symbol('data-symbol');
        const nonString = filter({ id: 'own', 0: true, [symbol]: true });
        type NonString = Assert<Equal<typeof nonString, { id?: string }>>;
        const record: Record<string, unknown> = { id: 'dynamic', color: 'red' };
        const filteredRecord = filter(record);
        const recordId: unknown = filteredRecord.id;
        // @ts-expect-error Arbitrary string keys are filtered out.
        filteredRecord.color;
        const recordEvents = filter(record, { eventProps: true });
        const recordEvent: unknown = recordEvents.onClick;
        const numeric = filter({ 0: 'own', 1: false }, { propNames: new Set(['0'] as const) });
        type Numeric = Assert<Equal<typeof numeric, { 0?: string }>>;
        const numericValue: string | undefined = numeric[0];
        const union: { id: string; color: number } | { title: string; width: number } =
          Math.random() > 0.5 ? { id: 'own', color: 123 } : { title: 'Details', width: 10 };
        const filteredUnion = filter(union);
        type Union = Assert<Equal<typeof filteredUnion, { id?: string } | { title?: string }>>;
      }

      function Wrapper<T extends ComponentProps<typeof ColoredBox>>(input: T) {
        return <PlainBox {...filterBaseProps(input)} />;
      }
    `;
    // These fixtures need Node globals, but not Vitest's full declaration graph.
    const options = { ...config.options, types: ['node'] };
    const host = ts.createCompilerHost(options);
    const original = host.getSourceFile.bind(host);
    host.getSourceFile = (fileName, languageVersion, ...rest) =>
      fileName === fixture
        ? ts.createSourceFile(fileName, source, languageVersion, true)
        : original(fileName, languageVersion, ...rest);
    const program = ts.createProgram([fixture], options, host);
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
  }, 60_000);
});
