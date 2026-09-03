/* eslint-disable tasty/known-property -- published plugin predates these logical category styles */
import { render } from '@testing-library/react';

import { resetConfig } from './config';
import { tasty } from './tasty';

function computed(element: Element, property: string): string {
  return getComputedStyle(element).getPropertyValue(property);
}

describe('logical styles in the browser', () => {
  afterEach(() => {
    resetConfig();
  });

  it('maps inline start/end through direction and preserves two-value axes', () => {
    const Box = tasty({ qa: 'Box', styles: { display: 'block' } });
    const el = render(
      <Box
        styles={{
          direction: 'rtl',
          inlinePadding: '2x start, 1x end',
          blockPadding: '3x 4x',
        }}
      />,
    ).getByTestId('Box');

    expect(computed(el, 'padding-top')).toBe('24px');
    expect(computed(el, 'padding-right')).toBe('16px');
    expect(computed(el, 'padding-bottom')).toBe('32px');
    expect(computed(el, 'padding-left')).toBe('8px');
  });

  it('maps both axes in a vertical writing mode', () => {
    const Box = tasty({ qa: 'Box', styles: { display: 'block' } });
    const el = render(
      <Box
        styles={{
          writingMode: 'vertical-rl',
          textOrientation: 'upright',
          blockPadding: '1x start, 2x end',
          inlinePadding: '3x start, 4x end',
        }}
      />,
    ).getByTestId('Box');

    expect(computed(el, 'writing-mode')).toBe('vertical-rl');
    expect(computed(el, 'text-orientation')).toBe('upright');
    expect(computed(el, 'padding-top')).toBe('24px');
    expect(computed(el, 'padding-right')).toBe('8px');
    expect(computed(el, 'padding-bottom')).toBe('32px');
    expect(computed(el, 'padding-left')).toBe('16px');
  });

  it('applies enhanced blockSize and inlineSize on logical axes', () => {
    const Box = tasty({ qa: 'Box', styles: { display: 'block' } });
    const el = render(
      <Box
        styles={{
          writingMode: 'vertical-rl',
          boxSizing: 'border-box',
          blockSize: 'fixed 5x',
          inlineSize: 'fixed 6x',
        }}
      />,
    ).getByTestId('Box');

    expect(computed(el, 'width')).toBe('40px');
    expect(computed(el, 'height')).toBe('48px');
    expect(computed(el, 'min-width')).toBe('40px');
    expect(computed(el, 'max-height')).toBe('48px');
  });

  it('uses explicit logical min/max declarations over size shorthand values', () => {
    const Box = tasty({ qa: 'Box', styles: { display: 'block' } });
    const el = render(
      <Box
        styles={{
          blockSize: '1x 5x 10x',
          minBlockSize: '2x',
          maxBlockSize: '20x',
        }}
      />,
    ).getByTestId('Box');

    expect(computed(el, 'block-size')).toBe('40px');
    expect(computed(el, 'min-block-size')).toBe('16px');
    expect(computed(el, 'max-block-size')).toBe('160px');
  });

  it('keeps native logical longhands available beside category styles', () => {
    const Box = tasty({ qa: 'Box', styles: { display: 'block' } });

    const withShorthand = render(
      <Box styles={{ inlinePadding: '1x', paddingInlineStart: '2x' }} />,
    ).container.firstElementChild!;
    expect(computed(withShorthand, 'padding-left')).toBe('16px');
    expect(computed(withShorthand, 'padding-right')).toBe('8px');

    const withPhysicalLonghand = render(
      <Box styles={{ blockPadding: '1x', paddingBlockEnd: '3x' }} />,
    ).container.firstElementChild!;
    expect(computed(withPhysicalLonghand, 'padding-top')).toBe('8px');
    expect(computed(withPhysicalLonghand, 'padding-bottom')).toBe('24px');
  });

  it('maps logical borders and corners in RTL', () => {
    const Box = tasty({ qa: 'Box', styles: { display: 'block' } });
    const el = render(
      <Box
        styles={{
          direction: 'rtl',
          '#edge': 'rgb(255 0 0)',
          inlineBorder: '2bw dashed #edge start',
          borderStartStartRadius: '2r',
        }}
      />,
    ).getByTestId('Box');

    expect(computed(el, 'border-right-width')).toBe('2px');
    expect(computed(el, 'border-right-style')).toBe('dashed');
    expect(computed(el, 'border-right-color')).toBe('rgb(255, 0, 0)');
    expect(computed(el, 'border-left-width')).toBe('0px');
    expect(computed(el, 'border-top-right-radius')).toBe('12px');
    expect(computed(el, 'border-top-left-radius')).toBe('0px');
  });

  it('applies logical inset and scroll padding declarations', () => {
    const Box = tasty({ qa: 'Box', styles: { display: 'block' } });
    const el = render(
      <Box
        styles={{
          direction: 'rtl',
          position: 'absolute',
          inlineInset: '2x start',
          inlineScrollPadding: '1x 2x',
          blockScrollMargin: '3x start',
        }}
      />,
    ).getByTestId('Box');

    expect(computed(el, 'right')).toBe('16px');
    expect(computed(el, 'scroll-padding-right')).toBe('8px');
    expect(computed(el, 'scroll-padding-left')).toBe('16px');
    expect(computed(el, 'scroll-margin-top')).toBe('24px');
    expect(computed(el, 'scroll-margin-bottom')).toBe('0px');
  });
});
