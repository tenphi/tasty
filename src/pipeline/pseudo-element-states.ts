/**
 * States on a pseudo-element target.
 *
 * When the element a state describes is a pseudo-element, the state means
 * the pseudo-element's own state: `@own(:hover)` on `$: '@::part(label)'`
 * is `::part(label):where(:hover)`. A pseudo-element has no attributes, no
 * classes, and no place in the DOM tree, so a state that tests one of those
 * can never match. Such a state is dropped with a warning. The check uses
 * the CSS language alone, never what one browser supports, so the output
 * is the same everywhere.
 */
import type { ConditionNode } from './conditions';

/** Quoted strings, which may contain anything. */
const QUOTED_RE = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g;

/** Pseudo-classes that test an element's place in the DOM tree. */
const STRUCTURAL_PSEUDO_RE =
  /:(?:root|empty|scope|has|(?:first|last|only)-(?:child|of-type)|nth-(?:last-)?(?:child|of-type))(?![\w-])/i;

/**
 * Which states of a handler's value map describe a pseudo-element: the
 * sub-element's own states (`own`) when its selector ends in one, and the
 * root states (`root`) when the selector-mode base does.
 */
export interface PseudoElementTarget {
  own: boolean;
  root: boolean;
}

/**
 * What a selector-condition leaf tests that a pseudo-element has none of
 * (`'attributes'`), or `null` when it is a pseudo-class a pseudo-element can
 * be in.
 */
function leafMismatch(node: ConditionNode): string | null {
  if (node.kind !== 'state') return null;
  if (node.type === 'modifier') return 'modifiers';
  if (node.type !== 'pseudo') return null;

  const selector = node.pseudo.replace(QUOTED_RE, '""');
  if (STRUCTURAL_PSEUDO_RE.test(selector)) return 'position in the DOM tree';
  if (selector.includes('[')) return 'attributes';
  if (selector.includes('.') || selector.includes('#')) return 'classes or ids';
  return null;
}

/**
 * What `condition` tests that the pseudo-element target has none of, or
 * `null` when every part of it can apply. `@root()`, `@parent()`, and
 * at-rule conditions describe other things and are never a mismatch.
 */
export function pseudoElementMismatch(
  condition: ConditionNode,
  target: PseudoElementTarget,
): string | null {
  const walk = (
    node: ConditionNode,
    describesTarget: boolean,
  ): string | null => {
    if (node.kind === 'compound') {
      for (const child of node.children) {
        const found = walk(child, describesTarget);
        if (found) return found;
      }
      return null;
    }
    if (node.kind !== 'state') return null;
    if (node.type === 'own') {
      return target.own || target.root ? walk(node.innerCondition, true) : null;
    }
    return describesTarget ? leafMismatch(node) : null;
  };

  return walk(condition, target.root);
}
