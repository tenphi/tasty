import { cleanup, render } from '@testing-library/react';

import { computeStyles } from './compute-styles';
import { destroy } from './injector';
import { ServerStyleCollector } from './ssr/collector';
import { tasty } from './tasty';

describe('fontStyle', () => {
  afterEach(() => {
    cleanup();
    destroy();
  });

  it.each([
    ['normal', 'normal'],
    ['italic', 'italic'],
    ['oblique', 'oblique'],
    ['oblique 10deg', 'oblique 10deg'],
    [true, 'italic'],
    [false, 'normal'],
  ] as const)(
    'renders %s over inherited italic text',
    (fontStyle, expected) => {
      const Text = tasty({ styles: { fontStyle } });
      const { getByTestId } = render(
        <div style={{ fontStyle: 'italic' }}>
          <Text qa="text">Text</Text>
        </div>,
      );

      expect(getComputedStyle(getByTestId('text')).fontStyle).toBe(expected);
    },
  );

  it('switches a state map between normal and italic over an italic preset', () => {
    const Text = tasty({
      styles: {
        preset: 't3 / italic',
        fontStyle: { '': 'normal', emphasized: 'italic' },
      },
    });
    const { getByTestId, rerender } = render(<Text qa="text">Text</Text>);

    expect(getComputedStyle(getByTestId('text')).fontStyle).toBe('normal');

    rerender(
      <Text qa="text" mods={{ emphasized: true }}>
        Text
      </Text>,
    );
    expect(getComputedStyle(getByTestId('text')).fontStyle).toBe('italic');

    rerender(<Text qa="text">Text</Text>);
    expect(getComputedStyle(getByTestId('text')).fontStyle).toBe('normal');
  });

  it('overrides an italic preset through the fontStyle prop', () => {
    const Text = tasty({
      styles: { preset: 't3 / italic' },
      styleProps: ['fontStyle'],
    });
    const { getByTestId, rerender } = render(
      <Text qa="text" fontStyle="normal">
        Text
      </Text>,
    );

    expect(getComputedStyle(getByTestId('text')).fontStyle).toBe('normal');

    rerender(
      <Text qa="text" fontStyle="oblique 10deg">
        Text
      </Text>,
    );
    expect(getComputedStyle(getByTestId('text')).fontStyle).toBe(
      'oblique 10deg',
    );
  });

  it('resolves fontStyle from a design token', () => {
    const Text = tasty({
      styles: {
        '$text-font-style': 'normal',
        fontStyle: '$text-font-style',
      },
    });
    const { getByTestId } = render(
      <div style={{ fontStyle: 'italic' }}>
        <Text qa="text">Text</Text>
      </div>,
    );

    expect(getComputedStyle(getByTestId('text')).fontStyle).toBe('normal');
  });

  it('renders normal from collected SSR styles over an italic preset', () => {
    const collector = new ServerStyleCollector();
    const { className } = computeStyles(
      { preset: 't3 / italic', fontStyle: 'normal' },
      { ssrCollector: collector },
    );
    const sheet = document.createElement('style');
    sheet.textContent = collector.getCSS();
    expect(sheet.textContent).toContain('font-style: normal;');
    document.head.append(sheet);

    try {
      const { getByTestId } = render(
        <div style={{ fontStyle: 'italic' }}>
          <span className={className} data-qa="text">
            Text
          </span>
        </div>,
      );

      expect(getComputedStyle(getByTestId('text')).fontStyle).toBe('normal');
    } finally {
      sheet.remove();
    }
  });
});
