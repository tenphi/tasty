import type { ReactNode } from 'react';

import {
  tasty,
  useCounterStyle,
  useFontFace,
  useFunction,
  useGlobalStyles,
  useKeyframes,
  useProperty,
  useRawCSS,
} from '@tenphi/tasty';

const SharedRoot = tasty({
  styles: {
    animation: 'extract-fade 1s',
    display: 'block',
    listStyleType: 'extract-counter',
    padding: '10px',
  },
});

export function Shared({ children }: { children?: ReactNode }) {
  useProperty('$extract-size', {
    syntax: '<length>',
    inherits: false,
    initialValue: '0px',
  });
  useFontFace('Extract Sans', {
    src: 'local("Arial")',
    fontDisplay: 'swap',
  });
  useCounterStyle(
    {
      system: 'cyclic',
      symbols: '"•"',
      suffix: '" "',
    },
    { name: 'extract-counter' },
  );
  useFunction('$$extract-double', {
    args: ['$value'],
    result: '($value * 2)',
  });
  useRawCSS('.extract-raw { --extract-raw: 1; }', { id: 'extract-raw' });
  useRawCSS('.cascade-probe { color: blue; }', { id: 'shared-cascade' });
  useGlobalStyles('.extract-global', { color: 'red' });
  useKeyframes(
    {
      from: { opacity: 0 },
      to: { opacity: 1 },
    },
    { name: 'extract-fade' },
  );

  return <SharedRoot>{children}</SharedRoot>;
}

export function PageOnly({ children }: { children?: ReactNode }) {
  useRawCSS('.cascade-probe { color: red; }', { id: 'page-cascade' });
  useKeyframes(
    {
      from: { opacity: 1 },
      to: { opacity: 0 },
    },
    { name: 'page-only-fade' },
  );

  return <div className="cascade-probe">{children}</div>;
}
