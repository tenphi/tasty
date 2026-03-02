import type { CSSProperties as ReactCSSProperties } from 'react';

declare module './utils/css-types' {
  interface CSSProperties extends ReactCSSProperties {}
}

// Framework-agnostic core
export * from './core';

// React bindings
export { tasty, Element } from './tasty';
export {
  useStyles,
  useGlobalStyles,
  useRawCSS,
  useProperty,
  useKeyframes,
} from './hooks';
export type {
  UseStylesOptions,
  UseStylesResult,
  UsePropertyOptions,
} from './hooks';

// React-specific utilities
export * from './utils/get-display-name';

// React-specific types
export type {
  TastyProps,
  TastyElementOptions,
  TastyElementProps,
  AllBasePropsWithMods,
  SubElementDefinition,
  ElementsDefinition,
  SubElementProps,
  WithVariant,
  VariantMap,
} from './tasty';
export type {
  AllBaseProps,
  BaseProps,
  BasePropsWithoutChildren,
} from './types';
