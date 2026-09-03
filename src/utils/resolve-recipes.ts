import { getGlobalRecipes } from '../config';
import type { Styles } from '../styles/types';

import { resolveRecipesWith } from './resolve-recipes-core';

/** Resolve recipe references against the globally configured recipe map. */
export function resolveRecipes(styles: Styles): Styles {
  return resolveRecipesWith(styles, getGlobalRecipes());
}
