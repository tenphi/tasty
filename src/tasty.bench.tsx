import { cleanup, render } from '@testing-library/react';
import { createElement } from 'react';
import { bench, describe } from 'vitest';

import { clearPipelineCache } from './pipeline';
import { clearConditionCache } from './pipeline/materialize';
import { clearParseCache } from './pipeline/parseStateKey';
import { clearSimplifyCache } from './pipeline/simplify';
import type { Styles } from './styles/types';
import { tasty } from './tasty';
import { getGlobalParser } from './utils/styles';

function clearAllCaches() {
  clearPipelineCache();
  clearParseCache();
  clearConditionCache();
  clearSimplifyCache();
  getGlobalParser().clearCache();
}

// ============================================================================
// Factory benchmarks — measuring tasty() component creation
// ============================================================================

describe('tasty() factory', () => {
  bench('simple element', () => {
    tasty({
      as: 'div',
      styles: {
        display: 'flex',
        padding: '2x',
        gap: '1x',
        fill: '#surface',
      },
    });
  });

  bench('element with state maps', () => {
    tasty({
      as: 'button',
      styles: {
        padding: '2x 4x',
        fill: {
          '': '#primary',
          ':hover': '#primary-text',
          disabled: '#muted',
        },
        color: {
          '': '#white',
          disabled: '#muted-text',
        },
        border: {
          '': '1bw solid #border',
          '@media (width < 768px)': 'none',
        },
        radius: '1r',
      },
    });
  });

  bench('element with variants', () => {
    tasty({
      as: 'button',
      styles: {
        padding: '2x 4x',
        border: '1bw solid #border',
        radius: '1r',
      },
      variants: {
        primary: {
          fill: '#primary',
          color: '#white',
        },
        secondary: {
          fill: '#surface',
          color: '#text',
        },
        danger: {
          fill: '#danger',
          color: '#white',
        },
      },
    });
  });

  bench('element with sub-elements', () => {
    tasty({
      as: 'div',
      styles: {
        display: 'flex',
        gap: '2x',
        Icon: { color: '#primary', width: '20px' },
        Label: { fontWeight: 'bold' },
        Description: { color: '#text-soft', fontSize: '12px' },
      },
      elements: {
        Icon: 'span',
        Label: 'span',
        Description: 'p',
      },
    });
  });

  const BaseComponent = tasty({
    as: 'div',
    styles: { display: 'block' },
  });

  bench('wrapping existing component', () => {
    tasty(BaseComponent, {
      styles: {
        padding: '2x',
        fill: '#surface',
        border: '1bw solid #border',
      },
    });
  });
});

// ============================================================================
// Render benchmarks — measuring component rendering
// ============================================================================

const SimpleDiv = tasty({
  styles: {
    display: 'flex',
    flow: 'column',
    padding: '2x',
    gap: '1x',
    fill: '#surface',
  },
});

const ButtonWithStates = tasty({
  as: 'button',
  styles: {
    padding: '2x 4x',
    fill: {
      '': '#primary',
      ':hover': '#primary-text',
      disabled: '#muted',
    },
    color: {
      '': '#white',
      disabled: '#muted-text',
    },
    border: '1bw solid #border',
    radius: '1r',
  },
});

const CardWithVariants = tasty({
  styles: {
    padding: '4x',
    border: '1bw solid #border',
    radius: '1r',
  },
  variants: {
    default: { fill: '#surface', color: '#text' },
    primary: { fill: '#primary', color: '#white' },
    danger: { fill: '#danger', color: '#white' },
  },
});

const WithStyleProps = tasty({
  styleProps: ['padding', 'fill', 'radius', 'border'] as const,
  styles: {
    display: 'flex',
    padding: '2x',
  },
});

const WithModProps = tasty({
  modProps: ['isActive', 'size'] as const,
  styles: {
    fill: { '': '#surface', isActive: '#primary' },
    padding: { '': '2x', 'size=large': '4x' },
  },
});

// Pre-warm caches for cached benchmarks
render(createElement(SimpleDiv));
cleanup();
render(createElement(ButtonWithStates));
cleanup();

const POOL_SIZE = 2000;
let idx = 0;

function makeStyleOverridePool(n: number): Styles[] {
  return Array.from({ length: n }, (_, i) => ({
    padding: `${i}px`,
    fill: `#color-${i}`,
    border: `${(i % 4) + 1}bw solid #border-${i}`,
  }));
}

const styleOverridePool = makeStyleOverridePool(POOL_SIZE);

describe('tasty component render', () => {
  bench('simple element (cached)', () => {
    const { unmount } = render(createElement(SimpleDiv));
    unmount();
    cleanup();
  });

  bench('element with state maps (cached)', () => {
    const { unmount } = render(createElement(ButtonWithStates));
    unmount();
    cleanup();
  });

  bench('element with mods', () => {
    const { unmount } = render(
      createElement(SimpleDiv, { mods: { active: true, size: 'large' } }),
    );
    unmount();
    cleanup();
  });

  bench('element with tokens', () => {
    const { unmount } = render(
      createElement(SimpleDiv, {
        tokens: { $spacing: '2x', '#accent': '#purple' },
      }),
    );
    unmount();
    cleanup();
  });

  bench(
    'element with style overrides (cold)',
    () => {
      const { unmount } = render(
        createElement(SimpleDiv, {
          styles: styleOverridePool[idx++ % POOL_SIZE],
        }),
      );
      unmount();
      cleanup();
    },
    {
      setup() {
        clearAllCaches();
        idx = 0;
      },
    },
  );

  bench('element with variant', () => {
    const { unmount } = render(
      createElement(CardWithVariants, { variant: 'primary' }),
    );
    unmount();
    cleanup();
  });

  bench('element with styleProps', () => {
    const { unmount } = render(
      createElement(WithStyleProps, {
        padding: '4x',
        fill: '#white',
        radius: '2r',
      }),
    );
    unmount();
    cleanup();
  });

  bench('element with modProps', () => {
    const { unmount } = render(
      createElement(WithModProps, { isActive: true, size: 'large' }),
    );
    unmount();
    cleanup();
  });
});
