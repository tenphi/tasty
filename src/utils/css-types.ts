import type { Properties } from 'csstype';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- interface needed for declaration merging in index.ts
export interface CSSProperties extends Properties<string | number> {}
