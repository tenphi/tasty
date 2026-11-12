// An app module that configures Tasty when imported, for src/harness.test.ts.
import { configure } from '@tenphi/tasty/core';

configure({
  units: { x: 'var(--gap)' },
  states: { '@mobile': '@media(w < 768px)' },
});
