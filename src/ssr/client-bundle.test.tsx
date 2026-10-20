import { render } from '@testing-library/react';

import { tasty } from '../tasty';

import * as ssr from './index';

/**
 * A browser bundle stubs `node:async_hooks`, which `@tenphi/tasty/ssr` imports
 * for `runWithCollector()`. Vite does here what an app's bundler does, so this
 * suite is that bundle: importing the entry for `hydrateTastyClasses()` must
 * not break rendering.
 */
describe('@tenphi/tasty/ssr in a browser bundle', () => {
  it('renders tasty() components after the entry is imported', () => {
    const Box = tasty({ styles: { color: '#purple' } });

    expect(() => render(<Box data-qa="box" />)).not.toThrow();
    expect(ssr.getSSRCollector()).toBeNull();
  });
});
