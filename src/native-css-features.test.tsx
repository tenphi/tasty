import { render } from '@testing-library/react';

import { computeStyles } from './compute-styles';
import { resetConfig } from './config';
import { destroy } from './injector';
import { createServerStyleCollector } from './ssr/collector';
import type { Styles } from './styles/types';
import { tasty } from './tasty';

type RenderPath = 'runtime' | 'ssr';

function mount(styles: Styles, path: RenderPath): HTMLElement {
  if (path === 'runtime') {
    const Box = tasty({ styles });
    return render(<Box />).container.firstElementChild as HTMLElement;
  }

  const element = document.createElement('div');
  const style = document.createElement('style');

  const collector = createServerStyleCollector();
  element.className = computeStyles(styles, {
    ssrCollector: collector,
  }).className;
  style.textContent = collector.getCSS();

  style.dataset.nativeCssProbe = '';
  document.head.append(style);
  document.body.append(element);
  return element;
}

describe.each<RenderPath>(['runtime', 'ssr'])(
  'native CSS features through %s',
  (path) => {
    afterEach(() => {
      document.querySelectorAll('[data-native-css-probe]').forEach((el) => {
        el.remove();
      });
      document.body.replaceChildren();
      destroy();
      resetConfig();
    });

    it('evaluates nested at-rule support functions, negation, and combined states', () => {
      expect(CSS.supports('at-rule(@scope)')).toBe(true);
      expect(CSS.supports('at-rule(@tasty-unknown)')).toBe(false);

      const element = mount(
        {
          order: {
            _: 1,
            '@supports(at-rule(@scope))': 2,
            '@supports(at-rule(@scope)) & @supports(display: grid)': 3,
            '!@supports(at-rule(@scope))': 4,
            '@supports(at-rule(@tasty-unknown))': 5,
            '!@supports(at-rule(@tasty-unknown)) & active': 6,
          },
        },
        path,
      );

      expect(getComputedStyle(element).order).toBe('3');
      element.setAttribute('data-active', '');
      expect(getComputedStyle(element).order).toBe('6');
    });

    it('keeps the fallback floor for an unsupported at-rule', () => {
      const element = mount(
        { order: { _: 1, '@supports(at-rule(@tasty-unknown))': 2 } },
        path,
      );

      expect(getComputedStyle(element).order).toBe('1');
    });

    it.each([
      ['overscrollBehavior', 'overscroll-behavior'],
      ['overscrollBehaviorBlock', 'overscroll-behavior-block'],
      ['overscrollBehaviorInline', 'overscroll-behavior-inline'],
      ['overscrollBehaviorX', 'overscroll-behavior-x'],
      ['overscrollBehaviorY', 'overscroll-behavior-y'],
    ])('applies chain in %s state maps', (property, cssProperty) => {
      expect(CSS.supports(cssProperty, 'chain')).toBe(true);

      const element = mount(
        { [property]: { '': 'contain', active: 'chain' } },
        path,
      );

      expect(getComputedStyle(element).getPropertyValue(cssProperty)).toBe(
        'contain',
      );
      element.setAttribute('data-active', '');
      expect(getComputedStyle(element).getPropertyValue(cssProperty)).toBe(
        'chain',
      );
    });
  },
);
