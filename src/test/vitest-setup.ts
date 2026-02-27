import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';
import { expect } from 'vitest';

import { getCssTextForNode } from '../injector';

configure({ testIdAttribute: 'data-qa' });

declare module 'vitest' {
  interface Assertion {
    toMatchTastySnapshot(): void;
  }
}

expect.extend({
  toMatchTastySnapshot(received: ParentNode | Element | DocumentFragment) {
    if (!received || typeof received.querySelectorAll !== 'function') {
      return {
        pass: false,
        message: () =>
          'Expected a DOM node with querySelectorAll method (container from render)',
      };
    }

    try {
      const css = getCssTextForNode(received);
      expect(css).toMatchSnapshot();

      return {
        pass: true,
        message: () => 'CSS snapshot matched',
      };
    } catch (error) {
      return {
        pass: false,
        message: () => `Failed to match CSS snapshot: ${error}`,
      };
    }
  },
});

const tastySerializer = {
  test(val: unknown): val is ParentNode {
    return !!(
      val &&
      typeof val === 'object' &&
      typeof (val as ParentNode).querySelectorAll === 'function'
    );
  },

  print(val: ParentNode, serialize: (v: unknown) => string): string {
    const markup = serialize(val);
    const css = getCssTextForNode(val);

    if (!css.trim()) {
      return markup;
    }

    return `${markup}\n\n/* Tasty styles */\n${css}`;
  },
};

expect.addSnapshotSerializer(tastySerializer);
