/**
 * Pipeline Tests
 *
 * Tests for the new style rendering pipeline.
 */

import type {
  ConditionNode,
  ModifierCondition,
  ParentCondition,
  PseudoCondition,
  RootCondition,
} from './conditions';
import {
  and,
  createContainerDimensionCondition,
  createMediaDimensionCondition,
  createModifierCondition,
  createParentCondition,
  falseCondition,
  not,
  or,
  trueCondition,
} from './conditions';
import { buildExclusiveConditions, parseStyleEntries } from './exclusive';
import { conditionToCSS, parentGroupsToCSS, pseudoToCSS } from './materialize';
import { clearParseCache, parseStateKey } from './parseStateKey';
import { simplifyCondition } from './simplify';

function assertParentCondition(node: ConditionNode): ParentCondition {
  if (node.kind !== 'state' || node.type !== 'parent') {
    throw new Error(`Expected parent condition, got ${node.kind}`);
  }
  return node;
}

function assertModifierCondition(node: ConditionNode): ModifierCondition {
  if (node.kind !== 'state' || node.type !== 'modifier') {
    throw new Error(
      `Expected modifier condition, got ${node.kind}${node.kind === 'state' ? `:${node.type}` : ''}`,
    );
  }
  return node;
}

function assertPseudoCondition(node: ConditionNode): PseudoCondition {
  if (node.kind !== 'state' || node.type !== 'pseudo') {
    throw new Error(
      `Expected pseudo condition, got ${node.kind}${node.kind === 'state' ? `:${node.type}` : ''}`,
    );
  }
  return node;
}

function assertRootCondition(node: ConditionNode): RootCondition {
  if (node.kind !== 'state' || node.type !== 'root') {
    throw new Error(`Expected root condition, got ${node.kind}`);
  }
  return node;
}

import { getConditionUniqueId } from './conditions';
import { clearPipelineCache, renderStyles } from './index';
import { clearSimplifyCache } from './simplify';
import { clearConditionCache } from './materialize';
import { configure, resetConfig } from '../config';
import type { StyleResult } from './index';

describe('ConditionNode operations', () => {
  describe('and()', () => {
    it('should return TRUE for empty args', () => {
      expect(and().kind).toBe('true');
    });

    it('should return child for single arg', () => {
      const mod = createModifierCondition('data-hovered');
      expect(and(mod)).toBe(mod);
    });

    it('should return FALSE when any child is FALSE', () => {
      const mod = createModifierCondition('data-hovered');
      expect(and(mod, falseCondition()).kind).toBe('false');
    });

    it('should skip TRUE children', () => {
      const mod = createModifierCondition('data-hovered');
      const result = and(mod, trueCondition());
      expect(result).toBe(mod);
    });

    it('should flatten nested ANDs', () => {
      const a = createModifierCondition('data-a');
      const b = createModifierCondition('data-b');
      const c = createModifierCondition('data-c');
      const nested = and(a, and(b, c));
      expect(nested.kind).toBe('compound');
      if (nested.kind === 'compound') {
        expect(nested.children.length).toBe(3);
      }
    });
  });

  describe('or()', () => {
    it('should return FALSE for empty args', () => {
      expect(or().kind).toBe('false');
    });

    it('should return child for single arg', () => {
      const mod = createModifierCondition('data-hovered');
      expect(or(mod)).toBe(mod);
    });

    it('should return TRUE when any child is TRUE', () => {
      const mod = createModifierCondition('data-hovered');
      expect(or(mod, trueCondition()).kind).toBe('true');
    });

    it('should skip FALSE children', () => {
      const mod = createModifierCondition('data-hovered');
      const result = or(mod, falseCondition());
      expect(result).toBe(mod);
    });
  });

  describe('not()', () => {
    it('should negate TRUE to FALSE', () => {
      expect(not(trueCondition()).kind).toBe('false');
    });

    it('should negate FALSE to TRUE', () => {
      expect(not(falseCondition()).kind).toBe('true');
    });

    it('should toggle negated flag on state', () => {
      const mod = createModifierCondition(
        'data-hovered',
        undefined,
        '=',
        false,
      );
      const negated = not(mod);
      expect(negated.kind).toBe('state');
      if (negated.kind === 'state') {
        expect(negated.negated).toBe(true);
      }
    });

    it("should apply De Morgan's law to AND", () => {
      const a = createModifierCondition('data-a');
      const b = createModifierCondition('data-b');
      const notAnd = not(and(a, b));
      // NOT(AND(a, b)) = OR(NOT(a), NOT(b))
      expect(notAnd.kind).toBe('compound');
      if (notAnd.kind === 'compound') {
        expect(notAnd.operator).toBe('OR');
        expect(notAnd.children.length).toBe(2);
      }
    });
  });
});

describe('parseStateKey()', () => {
  it('should parse empty string as TRUE', () => {
    expect(parseStateKey('').kind).toBe('true');
  });

  it('should parse boolean modifier', () => {
    const result = parseStateKey('hovered');
    expect(result.kind).toBe('state');
    if (result.kind === 'state') {
      expect(result.type).toBe('modifier');
      expect((result as any).attribute).toBe('data-hovered');
    }
  });

  it('should parse value modifier', () => {
    const result = parseStateKey('theme=danger');
    expect(result.kind).toBe('state');
    if (result.kind === 'state') {
      expect(result.type).toBe('modifier');
      expect((result as any).attribute).toBe('data-theme');
      expect((result as any).value).toBe('danger');
    }
  });

  it('should parse AND operator', () => {
    const result = parseStateKey('hovered & disabled');
    expect(result.kind).toBe('compound');
    if (result.kind === 'compound') {
      expect(result.operator).toBe('AND');
      expect(result.children.length).toBe(2);
    }
  });

  it('should parse OR operator', () => {
    const result = parseStateKey('hovered | focused');
    expect(result.kind).toBe('compound');
    if (result.kind === 'compound') {
      expect(result.operator).toBe('OR');
      expect(result.children.length).toBe(2);
    }
  });

  it('should parse NOT operator', () => {
    const result = parseStateKey('!disabled');
    expect(result.kind).toBe('state');
    if (result.kind === 'state') {
      expect(result.negated).toBe(true);
    }
  });

  it('should parse @starting', () => {
    const result = parseStateKey('@starting');
    expect(result.kind).toBe('state');
    if (result.kind === 'state') {
      expect(result.type).toBe('starting');
    }
  });

  it('should parse @media:print', () => {
    const result = parseStateKey('@media:print');
    expect(result.kind).toBe('state');
    if (result.kind === 'state') {
      expect(result.type).toBe('media');
      expect((result as any).subtype).toBe('type');
      expect((result as any).mediaType).toBe('print');
    }
  });

  it('should parse @media dimension query', () => {
    const result = parseStateKey('@media(w < 768px)');
    expect(result.kind).toBe('state');
    if (result.kind === 'state') {
      expect(result.type).toBe('media');
      expect((result as any).subtype).toBe('dimension');
      expect((result as any).dimension).toBe('width');
      expect((result as any).upperBound).toBeDefined();
    }
  });

  it('should parse @media range query', () => {
    const result = parseStateKey('@media(600px <= w < 1200px)');
    expect(result.kind).toBe('state');
    if (result.kind === 'state') {
      expect(result.type).toBe('media');
      expect((result as any).lowerBound).toBeDefined();
      expect((result as any).upperBound).toBeDefined();
    }
  });

  it('should parse @root state', () => {
    const result = parseStateKey('@root(theme=dark)');
    const root = assertRootCondition(result);
    const inner = root.innerCondition;
    expect(inner.kind).toBe('state');
    if (inner.kind === 'state' && inner.type === 'modifier') {
      expect(inner.attribute).toBe('data-theme');
      expect(inner.value).toBe('dark');
    }
  });

  it('should parse @parent state with boolean modifier', () => {
    const parent = assertParentCondition(parseStateKey('@parent(hovered)'));
    const inner = parent.innerCondition;
    expect(inner.kind).toBe('state');
    if (inner.kind === 'state' && inner.type === 'modifier') {
      expect(inner.attribute).toBe('data-hovered');
    }
    expect(parent.direct).toBe(false);
  });

  it('should parse @parent state with value modifier', () => {
    const parent = assertParentCondition(parseStateKey('@parent(theme=dark)'));
    const inner = parent.innerCondition;
    expect(inner.kind).toBe('state');
    if (inner.kind === 'state' && inner.type === 'modifier') {
      expect(inner.attribute).toBe('data-theme');
      expect(inner.value).toBe('dark');
    }
    expect(parent.direct).toBe(false);
  });

  it('should parse @parent state with direct parent syntax', () => {
    const parent = assertParentCondition(parseStateKey('@parent(hovered, >)'));
    const inner = parent.innerCondition;
    expect(inner.kind).toBe('state');
    if (inner.kind === 'state' && inner.type === 'modifier') {
      expect(inner.attribute).toBe('data-hovered');
    }
    expect(parent.direct).toBe(true);
  });

  it('should parse @parent state with class selector', () => {
    const parent = assertParentCondition(parseStateKey('@parent(.my-class)'));
    const inner = parent.innerCondition;
    expect(inner.kind).toBe('state');
    if (inner.kind === 'state' && inner.type === 'pseudo') {
      expect(inner.pseudo).toBe('.my-class');
    }
    expect(parent.direct).toBe(false);
  });

  it('should parse @parent state with attribute selector', () => {
    const parent = assertParentCondition(
      parseStateKey('@parent([aria-expanded="true"])'),
    );
    const inner = parent.innerCondition;
    expect(inner.kind).toBe('state');
    if (inner.kind === 'state' && inner.type === 'pseudo') {
      expect(inner.pseudo).toBe('[aria-expanded="true"]');
    }
  });

  it('should parse negated @parent state', () => {
    const parent = assertParentCondition(parseStateKey('!@parent(hovered)'));
    expect(parent.negated).toBe(true);
    const inner = parent.innerCondition;
    expect(inner.kind).toBe('state');
    if (inner.kind === 'state' && inner.type === 'modifier') {
      expect(inner.attribute).toBe('data-hovered');
    }
  });

  it('should parse @parent AND @parent as independent conditions', () => {
    const result = parseStateKey('@parent(hovered) & @parent(focused)');
    expect(result.kind).toBe('compound');
    if (result.kind === 'compound') {
      expect(result.operator).toBe('AND');
      expect(result.children.length).toBe(2);
      for (const child of result.children) {
        expect(child.kind).toBe('state');
        if (child.kind === 'state') {
          expect(child.type).toBe('parent');
        }
      }
    }
  });

  it('should parse @parent combined with modifier', () => {
    const result = parseStateKey('@parent(hovered) & disabled');
    expect(result.kind).toBe('compound');
    if (result.kind === 'compound') {
      expect(result.operator).toBe('AND');
      expect(result.children.length).toBe(2);
    }
  });

  it('should parse @parent OR @parent as OR condition', () => {
    const result = parseStateKey('@parent(hovered) | @parent(focused)');
    expect(result.kind).toBe('compound');
    if (result.kind === 'compound') {
      expect(result.operator).toBe('OR');
      expect(result.children.length).toBe(2);
      for (const child of result.children) {
        expect(child.kind).toBe('state');
        if (child.kind === 'state') {
          expect(child.type).toBe('parent');
        }
      }
    }
  });

  it('should parse @parent with OR inside as parent with inner OR', () => {
    const parent = assertParentCondition(
      parseStateKey('@parent(hovered | focused)'),
    );
    const inner = parent.innerCondition;
    expect(inner.kind).toBe('compound');
    if (inner.kind === 'compound') {
      expect(inner.operator).toBe('OR');
      expect(inner.children).toHaveLength(2);
    }
  });

  it('should parse @root with OR inside as root with inner OR', () => {
    const root = assertRootCondition(
      parseStateKey('@root(theme=dark | mode=compact)'),
    );
    const inner = root.innerCondition;
    expect(inner.kind).toBe('compound');
    if (inner.kind === 'compound') {
      expect(inner.operator).toBe('OR');
      expect(inner.children).toHaveLength(2);
    }
  });

  it('should parse @own state', () => {
    const result = parseStateKey('@own(hovered)', { isSubElement: true });
    expect(result.kind).toBe('state');
    if (result.kind === 'state') {
      expect(result.type).toBe('own');
    }
  });

  it('should parse @own with nested :has()', () => {
    const result = parseStateKey('@own(:has(input:checked))', {
      isSubElement: true,
    });
    expect(result.kind).toBe('state');
    if (result.kind === 'state') {
      expect(result.type).toBe('own');
      expect(result.innerCondition).toBeDefined();
      if (result.innerCondition) {
        expect(result.innerCondition.kind).toBe('state');
        if (result.innerCondition.kind === 'state') {
          expect(result.innerCondition.type).toBe('pseudo');
          expect(result.innerCondition.pseudo).toBe(':has(input:checked)');
        }
      }
    }
  });

  it('should parse container query', () => {
    const result = parseStateKey('@(layout, w < 600px)');
    expect(result.kind).toBe('state');
    if (result.kind === 'state') {
      expect(result.type).toBe('container');
      expect((result as any).containerName).toBe('layout');
    }
  });

  it('should parse container style query', () => {
    const result = parseStateKey('@(layout, $variant=danger)');
    expect(result.kind).toBe('state');
    if (result.kind === 'state') {
      expect(result.type).toBe('container');
      expect((result as any).subtype).toBe('style');
      expect((result as any).property).toBe('variant');
      expect((result as any).propertyValue).toBe('danger');
    }
  });

  it('should parse container raw function query (unnamed)', () => {
    const result = parseStateKey('@(scroll-state(stuck: top))');
    expect(result.kind).toBe('state');
    if (result.kind === 'state') {
      expect(result.type).toBe('container');
      expect((result as any).subtype).toBe('raw');
      expect((result as any).rawCondition).toBe('scroll-state(stuck: top)');
      expect((result as any).containerName).toBeUndefined();
    }
  });

  it('should parse container raw function query (named)', () => {
    const result = parseStateKey('@(nav, scroll-state(stuck: top))');
    expect(result.kind).toBe('state');
    if (result.kind === 'state') {
      expect(result.type).toBe('container');
      expect((result as any).subtype).toBe('raw');
      expect((result as any).rawCondition).toBe('scroll-state(stuck: top)');
      expect((result as any).containerName).toBe('nav');
    }
  });

  it('should parse container raw style() function query', () => {
    const result = parseStateKey('@(style(display: flex))');
    expect(result.kind).toBe('state');
    if (result.kind === 'state') {
      expect(result.type).toBe('container');
      expect((result as any).subtype).toBe('raw');
      expect((result as any).rawCondition).toBe('style(display: flex)');
    }
  });

  it('should parse container raw style() with custom property', () => {
    const result = parseStateKey('@(card, style(--theme: dark))');
    expect(result.kind).toBe('state');
    if (result.kind === 'state') {
      expect(result.type).toBe('container');
      expect((result as any).subtype).toBe('raw');
      expect((result as any).rawCondition).toBe('style(--theme: dark)');
      expect((result as any).containerName).toBe('card');
    }
  });

  it('should handle function with inner commas (paren-aware split)', () => {
    const result = parseStateKey('@(scroll-state(snapped, inline))');
    expect(result.kind).toBe('state');
    if (result.kind === 'state') {
      expect(result.type).toBe('container');
      expect((result as any).subtype).toBe('raw');
      expect((result as any).rawCondition).toBe(
        'scroll-state(snapped, inline)',
      );
      expect((result as any).containerName).toBeUndefined();
    }
  });

  it('should parse @supports feature query', () => {
    const result = parseStateKey('@supports(display: grid)');
    expect(result.kind).toBe('state');
    if (result.kind === 'state') {
      expect(result.type).toBe('supports');
      expect((result as any).subtype).toBe('feature');
      expect((result as any).condition).toBe('display: grid');
    }
  });

  it('should parse @supports selector query', () => {
    const result = parseStateKey('@supports($, :has(*))');
    expect(result.kind).toBe('state');
    if (result.kind === 'state') {
      expect(result.type).toBe('supports');
      expect((result as any).subtype).toBe('selector');
      expect((result as any).condition).toBe(':has(*)');
    }
  });

  it('should parse pseudo-class', () => {
    const result = parseStateKey(':hover');
    expect(result.kind).toBe('state');
    if (result.kind === 'state') {
      expect(result.type).toBe('pseudo');
    }
  });

  it('should parse vendor-prefixed pseudo-class', () => {
    const result = parseStateKey(':-webkit-autofill');
    expect(result.kind).toBe('state');
    if (result.kind === 'state') {
      expect(result.type).toBe('pseudo');
      expect(result.pseudo).toBe(':-webkit-autofill');
    }
  });

  it('should parse combined states', () => {
    const result = parseStateKey('@media(w < 768px) & hovered');
    expect(result.kind).toBe('compound');
    if (result.kind === 'compound') {
      expect(result.operator).toBe('AND');
      expect(result.children.length).toBe(2);
    }
  });
});

describe('simplifyCondition()', () => {
  it('should detect A & !A contradiction', () => {
    const a = createModifierCondition('data-hovered');
    const result = simplifyCondition(and(a, not(a)));
    expect(result.kind).toBe('false');
  });

  it('should detect A | !A tautology', () => {
    const a = createModifierCondition('data-hovered');
    const result = simplifyCondition(or(a, not(a)));
    expect(result.kind).toBe('true');
  });

  it('should detect impossible media range', () => {
    const low = createMediaDimensionCondition('width', undefined, {
      value: '400px',
      valueNumeric: 400,
      inclusive: true,
    });
    const high = createMediaDimensionCondition(
      'width',
      { value: '800px', valueNumeric: 800, inclusive: true },
      undefined,
    );
    const result = simplifyCondition(and(low, high));
    expect(result.kind).toBe('false');
  });

  it('should deduplicate terms', () => {
    const a = createModifierCondition('data-hovered');
    const result = simplifyCondition(and(a, a));
    expect(result.kind).toBe('state');
  });

  it('should apply absorption: A & (A | B) → A', () => {
    const a = createModifierCondition('data-a');
    const b = createModifierCondition('data-b');
    const result = simplifyCondition(and(a, or(a, b)));
    expect(result.kind).toBe('state');
    if (result.kind === 'state') {
      expect((result as any).attribute).toBe('data-a');
    }
  });

  it('should apply absorption: A | (A & B) → A', () => {
    const a = createModifierCondition('data-a');
    const b = createModifierCondition('data-b');
    const result = simplifyCondition(or(a, and(a, b)));
    expect(result.kind).toBe('state');
    if (result.kind === 'state') {
      expect((result as any).attribute).toBe('data-a');
    }
  });

  it('should handle nested absorption: A & (A | (B & C)) → A', () => {
    const a = createModifierCondition('data-a');
    const b = createModifierCondition('data-b');
    const c = createModifierCondition('data-c');
    const result = simplifyCondition(and(a, or(a, and(b, c))));
    expect(result.kind).toBe('state');
    if (result.kind === 'state') {
      expect((result as any).attribute).toBe('data-a');
    }
  });

  it('should merge overlapping media ranges', () => {
    const lower = createMediaDimensionCondition(
      'width',
      { value: '400px', valueNumeric: 400, inclusive: true },
      undefined,
    );
    const upper = createMediaDimensionCondition('width', undefined, {
      value: '800px',
      valueNumeric: 800,
      inclusive: true,
    });
    const result = simplifyCondition(and(lower, upper));
    expect(result.kind).toBe('state');
    if (result.kind === 'state' && result.type === 'media') {
      expect(result.lowerBound?.valueNumeric).toBe(400);
      expect(result.upperBound?.valueNumeric).toBe(800);
    }
  });

  it('should merge container dimension ranges', () => {
    const lower = createContainerDimensionCondition(
      'width',
      { value: '200px', valueNumeric: 200, inclusive: true },
      undefined,
    );
    const upper = createContainerDimensionCondition('width', undefined, {
      value: '600px',
      valueNumeric: 600,
      inclusive: false,
    });
    const result = simplifyCondition(and(lower, upper));
    expect(result.kind).toBe('state');
    if (result.kind === 'state' && result.type === 'container') {
      expect(result.lowerBound?.valueNumeric).toBe(200);
      expect(result.lowerBound?.inclusive).toBe(true);
      expect(result.upperBound?.valueNumeric).toBe(600);
      expect(result.upperBound?.inclusive).toBe(false);
    }
  });

  it('should detect impossible adjacent media ranges', () => {
    const lower = createMediaDimensionCondition(
      'width',
      { value: '800px', valueNumeric: 800, inclusive: false },
      undefined,
    );
    const upper = createMediaDimensionCondition('width', undefined, {
      value: '800px',
      valueNumeric: 800,
      inclusive: false,
    });
    const result = simplifyCondition(and(lower, upper));
    expect(result.kind).toBe('false');
  });
});

describe('XOR parsing and simplification', () => {
  it('should parse simple XOR: A ^ B', () => {
    const result = parseStateKey('hovered ^ focused');
    const css = conditionToCSS(result);
    expect(css.variants.length).toBe(2);
  });

  it('should parse chained XOR: A ^ B ^ C', () => {
    const result = parseStateKey('hovered ^ focused ^ disabled');
    const css = conditionToCSS(result);
    expect(css.variants.length).toBeGreaterThanOrEqual(2);
  });

  it('should produce correct XOR semantics (A ^ B = A&!B | !A&B)', () => {
    const result = parseStateKey('hovered ^ focused');
    const simplified = simplifyCondition(result);
    expect(simplified.kind).toBe('compound');
    if (simplified.kind === 'compound') {
      expect(simplified.operator).toBe('OR');
      expect(simplified.children.length).toBe(2);
      for (const branch of simplified.children) {
        expect(branch.kind).toBe('compound');
        if (branch.kind === 'compound') {
          expect(branch.operator).toBe('AND');
          expect(branch.children.length).toBe(2);
        }
      }
    }
  });

  it('should simplify XOR with contradiction: A ^ A → FALSE', () => {
    const a = createModifierCondition('data-hovered');
    const xorResult = or(and(a, not(a)), and(not(a), a));
    const result = simplifyCondition(xorResult);
    expect(result.kind).toBe('false');
  });

  it('should emit warning for long XOR chains', async () => {
    const { setWarningHandler } = await import('./warnings');
    const warnings: { code: string; message: string }[] = [];
    const restore = setWarningHandler(
      (w: { code: string; message: string }) => {
        warnings.push(w);
      },
    );

    clearParseCache();
    parseStateKey('a ^ b ^ c ^ d ^ e');
    expect(warnings.some((w) => w.code === 'XOR_CHAIN_TOO_LONG')).toBe(true);

    restore();
  });
});

describe('XOR integration with renderStyles', () => {
  it('should render XOR branches for A ^ B with correct selectors', () => {
    const styles = {
      color: {
        '': 'black',
        'hovered ^ focused': 'red',
      },
    };

    const result = renderStyles(styles, '.test');

    const xorRule = result.find((r) => r.declarations.includes('red'));
    expect(xorRule).toBeDefined();

    // XOR branches may be merged into a single :is() selector
    const sel = xorRule!.selector;
    expect(sel).toContain('[data-hovered]');
    expect(sel).toContain('[data-focused]');
    expect(sel).toContain(':not(');
  });

  it('should render default with exclusive negation of XOR branches', () => {
    const styles = {
      color: {
        '': 'black',
        'hovered ^ focused': 'red',
      },
    };

    const result = renderStyles(styles, '.test');

    const defaultRule = result.find((r) => r.declarations.includes('black'));
    expect(defaultRule).toBeDefined();
    // Default should exclude the XOR states (both active or neither)
    expect(defaultRule!.selector).toContain(':not(');
  });

  it('should handle A & (B ^ C) — AND combined with XOR', () => {
    const styles = {
      color: {
        '': 'black',
        'disabled & (hovered ^ focused)': 'gray',
      },
    };

    const result = renderStyles(styles, '.test');

    const xorRule = result.find((r) => r.declarations.includes('gray'));
    expect(xorRule).toBeDefined();
    expect(xorRule!.selector).toContain('[data-disabled]');
    expect(xorRule!.selector).toContain(':not(');
  });

  it('should handle A | (B ^ C) — OR combined with XOR', () => {
    const styles = {
      color: {
        '': 'black',
        'pressed | (hovered ^ focused)': 'blue',
      },
    };

    const result = renderStyles(styles, '.test');

    const blueRule = result.find((r) => r.declarations.includes('blue'));
    expect(blueRule).toBeDefined();
    expect(blueRule!.selector).toContain('[data-pressed]');
  });

  it('should handle XOR with @media queries', () => {
    const styles = {
      color: {
        '': 'black',
        '@media(w < 768px) ^ @media(w < 1024px)': 'red',
      },
    };

    const result = renderStyles(styles, '.test');

    const mediaRules = result.filter((r) => r.atRules?.length);
    expect(mediaRules.length).toBeGreaterThanOrEqual(1);

    const allAtRules = mediaRules.flatMap((r) => r.atRules ?? []);
    const has768 = allAtRules.some((a) => a.includes('768px'));
    const has1024 = allAtRules.some((a) => a.includes('1024px'));
    expect(has768).toBe(true);
    expect(has1024).toBe(true);
  });

  it('should handle chained XOR: A ^ B ^ C', () => {
    const styles = {
      color: {
        '': 'black',
        'hovered ^ focused ^ disabled': 'red',
      },
    };

    const result = renderStyles(styles, '.test');

    const xorRule = result.find((r) => r.declarations.includes('red'));
    expect(xorRule).toBeDefined();
    expect(xorRule!.selector).toContain(':not(');
  });
});

describe('De Morgan expansion in exclusive conditions', () => {
  it('should handle NOT(AND) in exclusive conditions', () => {
    const entries = parseStyleEntries(
      'padding',
      {
        '': '4x',
        'hovered & focused': '2x',
      },
      parseStateKey,
    );

    const exclusive = buildExclusiveConditions(entries);
    expect(exclusive.length).toBe(2);

    const defaultEntry = exclusive.find((e) => e.stateKey === '');
    expect(defaultEntry).toBeDefined();
    expect(defaultEntry!.exclusiveCondition.kind).not.toBe('false');
  });
});

describe('dedupeVariants via conditionToCSS', () => {
  it('should remove exact duplicate variants', () => {
    const a = createModifierCondition('data-a');
    const condition = or(a, a);
    const css = conditionToCSS(condition);
    expect(css.variants.length).toBe(1);
  });

  it('should remove superset variants', () => {
    const a = createModifierCondition('data-a');
    const b = createModifierCondition('data-b');
    const ab = and(a, b);
    const condition = or(a, ab);
    const css = conditionToCSS(condition);
    expect(css.variants.length).toBe(1);
    expect(css.variants[0].modifierConditions.length).toBe(1);
  });
});

describe('buildExclusiveConditions()', () => {
  it('should order entries by priority (highest first)', () => {
    const entries = parseStyleEntries(
      'padding',
      {
        '': '4x',
        hovered: '2x',
      },
      parseStateKey,
    );

    const exclusive = buildExclusiveConditions(entries);

    // parseStyleEntries reverses so highest priority comes first
    // First entry should be hovered (highest priority), last should be default
    expect(exclusive[0].stateKey).toBe('hovered');
    expect(exclusive[1].stateKey).toBe('');
  });

  it('should add negation to lower priority entries', () => {
    const entries = parseStyleEntries(
      'padding',
      {
        '': '4x',
        hovered: '2x',
      },
      parseStateKey,
    );

    const exclusive = buildExclusiveConditions(entries);

    // Default entry should have !hovered exclusive condition
    const defaultEntry = exclusive.find((e) => e.stateKey === '');
    expect(defaultEntry).toBeDefined();
    // The exclusive condition should be a negated state (NOT hovered)
    expect(defaultEntry!.exclusiveCondition.kind).toBe('state');
    if (defaultEntry!.exclusiveCondition.kind === 'state') {
      expect(defaultEntry!.exclusiveCondition.negated).toBe(true);
    }
  });

  it('should filter out impossible combinations', () => {
    const entries = parseStyleEntries(
      'padding',
      {
        '': '4x',
        hovered: '2x',
        'hovered & !hovered': '1x', // Impossible
      },
      parseStateKey,
    );

    const exclusive = buildExclusiveConditions(entries);

    // Should not include the impossible entry
    expect(
      exclusive.find((e) => e.stateKey === 'hovered & !hovered'),
    ).toBeUndefined();
  });
});

describe('mergeEntriesByValue with default + same-value state', () => {
  it('should preserve pressed state when its value matches default', () => {
    const styles = {
      fill: {
        '': '#white #primary',
        hovered: '#white #primary-text',
        pressed: '#white #primary',
        disabled: '#white #primary-disabled',
      },
    };

    const result = renderStyles(styles, '.test') as StyleResult[];

    // pressed has the same value as default, but it must still
    // participate in exclusive conditions so that hovered is negated
    // by pressed (pressed has higher priority than hovered).
    const hoveredRule = result.find(
      (r) =>
        r.selector.includes('[data-hovered]') &&
        r.declarations.includes('primary-text'),
    );
    expect(hoveredRule).toBeDefined();
    expect(
      hoveredRule!.selector,
      'hovered selector must exclude pressed for mutual exclusivity',
    ).toContain(':not([data-pressed])');
  });

  it('should produce mutually exclusive selectors for all states', () => {
    const styles = {
      color: {
        '': 'red',
        hovered: 'blue',
        pressed: 'red',
        disabled: 'gray',
      },
    };

    const result = renderStyles(styles, '.test') as StyleResult[];

    // disabled: highest priority, no negations needed
    const disabledRule = result.find((r) => r.declarations.includes('gray'));
    expect(disabledRule).toBeDefined();
    expect(disabledRule!.selector).toContain('[data-disabled]');

    // hovered: must negate both disabled AND pressed
    const hoveredRule = result.find((r) => r.declarations.includes('blue'));
    expect(hoveredRule).toBeDefined();
    expect(hoveredRule!.selector).toContain(':not([data-disabled])');
    expect(hoveredRule!.selector).toContain(':not([data-pressed])');

    // pressed + default merged (same CSS output): must negate disabled
    // but NOT hovered (pressed wins over hovered, and default covers
    // the remaining case)
    const defaultRule = result.find(
      (r) =>
        r.declarations.includes('red') &&
        !r.declarations.includes('gray') &&
        !r.declarations.includes('blue'),
    );
    expect(defaultRule).toBeDefined();
    expect(defaultRule!.selector).toContain(':not([data-disabled])');
  });
});

describe('conditionToCSS()', () => {
  it('should convert modifier to attribute selector', () => {
    const mod = createModifierCondition('data-hovered');
    const css = conditionToCSS(mod);
    expect(css.variants.length).toBe(1);
    expect(css.variants[0].modifierConditions).toHaveLength(1);
    expect(css.variants[0].modifierConditions[0]).toEqual({
      attribute: 'data-hovered',
      value: undefined,
      operator: undefined,
      negated: false,
    });
  });

  it('should convert negated modifier to :not()', () => {
    const mod = createModifierCondition('data-disabled', undefined, '=', true);
    const css = conditionToCSS(mod);
    expect(css.variants.length).toBe(1);
    expect(css.variants[0].modifierConditions).toHaveLength(1);
    expect(css.variants[0].modifierConditions[0]).toEqual({
      attribute: 'data-disabled',
      value: undefined,
      operator: undefined,
      negated: true,
    });
  });

  it('should convert media query to at-rule', () => {
    const media = createMediaDimensionCondition('width', undefined, {
      value: '768px',
      valueNumeric: 768,
      inclusive: true,
    });
    const css = conditionToCSS(media);
    expect(css.variants.length).toBe(1);
    expect(css.variants[0].mediaConditions.length).toBe(1);
    expect(css.variants[0].mediaConditions[0].condition).toContain('width');
    expect(css.variants[0].mediaConditions[0].subtype).toBe('dimension');
  });

  it('should set startingStyle flag for @starting', () => {
    const result = parseStateKey('@starting');
    const css = conditionToCSS(result);
    expect(css.variants.length).toBe(1);
    expect(css.variants[0].startingStyle).toBe(true);
  });

  it('should set rootGroups for @root', () => {
    const result = parseStateKey('@root(theme=dark)');
    const css = conditionToCSS(result);
    expect(css.variants.length).toBe(1);
    expect(css.variants[0].rootGroups).toHaveLength(1);
    expect(css.variants[0].rootGroups[0].negated).toBe(false);
    expect(css.variants[0].rootGroups[0].branches).toHaveLength(1);
    expect(css.variants[0].rootGroups[0].branches[0][0]).toEqual({
      attribute: 'data-theme',
      value: 'dark',
      operator: '=',
      negated: false,
    });
  });

  it('should set parentGroups for @parent', () => {
    const result = parseStateKey('@parent(hovered)');
    const css = conditionToCSS(result);
    expect(css.variants.length).toBe(1);
    expect(css.variants[0].parentGroups).toHaveLength(1);
    expect(css.variants[0].parentGroups[0].direct).toBe(false);
    expect(css.variants[0].parentGroups[0].branches).toHaveLength(1);
    expect(css.variants[0].parentGroups[0].branches[0]).toHaveLength(1);
    expect(css.variants[0].parentGroups[0].branches[0][0]).toEqual({
      attribute: 'data-hovered',
      value: undefined,
      operator: undefined,
      negated: false,
    });
  });

  it('should set parentGroups with direct flag', () => {
    const result = parseStateKey('@parent(hovered, >)');
    const css = conditionToCSS(result);
    expect(css.variants.length).toBe(1);
    expect(css.variants[0].parentGroups).toHaveLength(1);
    expect(css.variants[0].parentGroups[0].direct).toBe(true);
    expect(css.variants[0].parentGroups[0].branches).toHaveLength(1);
    expect(css.variants[0].parentGroups[0].branches[0]).toHaveLength(1);
    expect(css.variants[0].parentGroups[0].branches[0][0]).toEqual({
      attribute: 'data-hovered',
      value: undefined,
      operator: undefined,
      negated: false,
    });
  });

  it('should set negated parentGroups for !@parent', () => {
    const result = parseStateKey('!@parent(hovered)');
    const css = conditionToCSS(result);
    expect(css.variants.length).toBe(1);
    expect(css.variants[0].parentGroups).toHaveLength(1);
    expect(css.variants[0].parentGroups[0].negated).toBe(true);
    expect(css.variants[0].parentGroups[0].branches).toHaveLength(1);
    expect(css.variants[0].parentGroups[0].branches[0]).toHaveLength(1);
    expect(css.variants[0].parentGroups[0].branches[0][0]).toEqual({
      attribute: 'data-hovered',
      value: undefined,
      operator: undefined,
      negated: false,
    });
  });

  it('should set independent parentGroups for AND', () => {
    const result = parseStateKey('@parent(hovered) & @parent(focused)');
    const css = conditionToCSS(result);
    expect(css.variants.length).toBe(1);
    expect(css.variants[0].parentGroups).toHaveLength(2);
  });

  it('should produce single variant with rootGroup for @root with OR inside', () => {
    const result = parseStateKey('@root(theme=dark | mode=compact)');
    const css = conditionToCSS(result);
    expect(css.variants.length).toBe(1);

    const group = css.variants[0].rootGroups[0];
    expect(group.branches).toHaveLength(2);
    expect(group.negated).toBe(false);

    const branchConditions = group.branches.map((b) => b[0]);
    expect(branchConditions).toContainEqual({
      attribute: 'data-theme',
      value: 'dark',
      operator: '=',
      negated: false,
    });
    expect(branchConditions).toContainEqual({
      attribute: 'data-mode',
      value: 'compact',
      operator: '=',
      negated: false,
    });
  });

  it('should produce single variant for @parent with OR inside', () => {
    const result = parseStateKey('@parent(hovered | focused)');
    const css = conditionToCSS(result);
    expect(css.variants.length).toBe(1);

    const group = css.variants[0].parentGroups[0];
    expect(group.branches).toHaveLength(2);
    expect(group.direct).toBe(false);
    expect(group.negated).toBe(false);

    const branchConditions = group.branches.map((b) => b[0]);
    expect(branchConditions).toContainEqual({
      attribute: 'data-hovered',
      value: undefined,
      operator: undefined,
      negated: false,
    });
    expect(branchConditions).toContainEqual({
      attribute: 'data-focused',
      value: undefined,
      operator: undefined,
      negated: false,
    });
  });

  it('should produce single variant with multi-condition AND branches inside @parent OR', () => {
    const hovered = createModifierCondition(
      'data-hovered',
      undefined,
      '=',
      false,
      'hovered',
    );
    const pressed = createModifierCondition(
      'data-pressed',
      undefined,
      '=',
      false,
      'pressed',
    );
    const focused = createModifierCondition(
      'data-focused',
      undefined,
      '=',
      false,
      'focused',
    );
    const active = createModifierCondition(
      'data-active',
      undefined,
      '=',
      false,
      'active',
    );

    const inner = or(and(hovered, pressed), and(focused, active));
    const parent = createParentCondition(inner, false, false, '@parent(...)');
    const css = conditionToCSS(parent);

    expect(css.variants.length).toBe(1);

    const group = css.variants[0].parentGroups[0];
    expect(group.branches).toHaveLength(2);
    expect(group.negated).toBe(false);

    const branch0Attrs = group.branches[0].map(
      (c) => 'attribute' in c && c.attribute,
    );
    const branch1Attrs = group.branches[1].map(
      (c) => 'attribute' in c && c.attribute,
    );

    expect(branch0Attrs).toContain('data-hovered');
    expect(branch0Attrs).toContain('data-pressed');
    expect(branch1Attrs).toContain('data-focused');
    expect(branch1Attrs).toContain('data-active');
  });

  it('should render multi-condition AND branches inside @parent OR as comma-separated :is()', () => {
    const hovered = createModifierCondition(
      'data-hovered',
      undefined,
      '=',
      false,
      'hovered',
    );
    const pressed = createModifierCondition(
      'data-pressed',
      undefined,
      '=',
      false,
      'pressed',
    );
    const focused = createModifierCondition(
      'data-focused',
      undefined,
      '=',
      false,
      'focused',
    );
    const active = createModifierCondition(
      'data-active',
      undefined,
      '=',
      false,
      'active',
    );

    const inner = or(and(hovered, pressed), and(focused, active));
    const parent = createParentCondition(inner, false, false, '@parent(...)');
    const css = conditionToCSS(parent);

    const rendered = parentGroupsToCSS(css.variants[0].parentGroups);
    expect(rendered).toBe(
      ':is([data-active][data-focused] *, [data-hovered][data-pressed] *)',
    );
  });

  it('should produce single variant for @root with AND inside', () => {
    const result = parseStateKey('@root(theme=dark & mode=compact)');
    const css = conditionToCSS(result);
    expect(css.variants.length).toBe(1);
    expect(css.variants[0].rootGroups).toHaveLength(1);
    expect(css.variants[0].rootGroups[0].branches).toHaveLength(1);
    expect(css.variants[0].rootGroups[0].branches[0]).toHaveLength(2);
  });

  it('should convert @supports feature query', () => {
    const result = parseStateKey('@supports(display: grid)');
    const css = conditionToCSS(result);
    expect(css.variants.length).toBe(1);
    expect(css.variants[0].supportsConditions.length).toBe(1);
    expect(css.variants[0].supportsConditions[0].subtype).toBe('feature');
    expect(css.variants[0].supportsConditions[0].condition).toBe(
      'display: grid',
    );
    expect(css.variants[0].supportsConditions[0].negated).toBe(false);
  });

  it('should convert @supports selector query', () => {
    const result = parseStateKey('@supports($, :has(*))');
    const css = conditionToCSS(result);
    expect(css.variants.length).toBe(1);
    expect(css.variants[0].supportsConditions.length).toBe(1);
    expect(css.variants[0].supportsConditions[0].subtype).toBe('selector');
    expect(css.variants[0].supportsConditions[0].condition).toBe(':has(*)');
  });
});

describe('Integration: Exclusive conditions for media queries', () => {
  it('should generate non-overlapping media ranges', () => {
    const entries = parseStyleEntries(
      'gridTemplateColumns',
      {
        '': '1fr 1fr 1fr', // Default: w > 1400px
        '@media(w <= 1400px)': '1fr 1fr', // 920px < w <= 1400px
        '@media(w <= 920px)': '1fr', // w <= 920px
      },
      parseStateKey,
    );

    const exclusive = buildExclusiveConditions(entries);

    // Should have 3 non-overlapping entries
    expect(exclusive.length).toBe(3);

    // First (highest priority): w <= 920px
    expect(exclusive[0].stateKey).toBe('@media(w <= 920px)');

    // Second: w <= 1400px & !(w <= 920px) → 920px < w <= 1400px
    expect(exclusive[1].stateKey).toBe('@media(w <= 1400px)');
    expect(exclusive[1].exclusiveCondition.kind).toBe('compound');

    // Third (default): !(w <= 920px) & !(w <= 1400px) → w > 1400px
    expect(exclusive[2].stateKey).toBe('');
  });
});

describe('renderStyles integration', () => {
  it('should handle radius with value mapping', () => {
    const styles = {
      radius: {
        '': true,
        'type=link & !focused': 0,
      },
    };

    const result = renderStyles(styles, '.test');

    // Should have border-radius rules
    expect(result.length).toBeGreaterThan(0);
    const hasRadius = result.some((r) =>
      r.declarations.includes('border-radius'),
    );
    expect(hasRadius).toBe(true);
  });

  it('should handle simple radius value', () => {
    const styles = {
      radius: '1r',
    };

    const result = renderStyles(styles, '.test');

    expect(result.length).toBeGreaterThan(0);
    const hasRadius = result.some((r) =>
      r.declarations.includes('border-radius'),
    );
    expect(hasRadius).toBe(true);
  });

  it('should handle priority order for boolean vs value selectors', () => {
    const styles = {
      color: {
        'theme=danger': 'red',
        theme: 'blue', // Higher priority (later in object)
      },
    };

    const result = renderStyles(styles, '.test');

    // With exclusive conditions: theme=danger gets exclusive condition:
    // theme=danger & NOT(theme) which simplifies to FALSE (impossible)
    // because [data-theme="danger"] implies [data-theme]
    // So only the higher priority rule (theme → blue) should be generated
    expect(result.length).toBe(1);
    expect(result[0].declarations).toContain('blue');
  });

  it('should generate OR selectors for exclusive conditions', () => {
    const styles = {
      color: {
        '': 'black',
        'hovered | focused': 'red',
      },
    };

    const result = renderStyles(styles, '.test');

    // Should have rules for:
    // 1. hovered | focused → red
    // 2. !hovered & !focused → black (exclusive)
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('should resolve local predefined states', () => {
    const styles = {
      '@mobile': '@media(w <= 1000px)',
      color: {
        '': 'purple',
        '@mobile': 'red',
      },
    };

    const result = renderStyles(styles, '.test');

    // Should generate a media query rule for the @mobile condition
    const mediaRule = result.find((r) => r.atRules?.length);
    expect(mediaRule).toBeDefined();
    expect(mediaRule!.atRules![0]).toContain('width');
    expect(mediaRule!.atRules![0]).toContain('1000px');
  });

  it('should generate @supports at-rule for feature query', () => {
    const styles = {
      display: {
        '': 'block',
        '@supports(display: grid)': 'grid',
      },
    };

    const result = renderStyles(styles, '.test');

    // Should generate a supports rule
    const supportsRule = result.find((r) =>
      r.atRules?.some((a) => a.startsWith('@supports')),
    );
    expect(supportsRule).toBeDefined();
    expect(supportsRule!.atRules![0]).toBe('@supports (display: grid)');
    expect(supportsRule!.declarations).toContain('display: grid');
  });

  it('should generate @supports at-rule for selector query', () => {
    const styles = {
      display: {
        '': 'block',
        '@supports($, :has(*))': 'flex',
      },
    };

    const result = renderStyles(styles, '.test');

    // Should generate a supports selector rule
    const supportsRule = result.find((r) =>
      r.atRules?.some((a) => a.startsWith('@supports')),
    );
    expect(supportsRule).toBeDefined();
    expect(supportsRule!.atRules![0]).toBe('@supports selector(:has(*))');
    expect(supportsRule!.declarations).toContain('display: flex');
  });

  it('should handle negated @supports condition', () => {
    const styles = {
      display: {
        '': 'grid',
        '!@supports(display: grid)': 'block',
      },
    };

    const result = renderStyles(styles, '.test');

    // Should generate a negated supports rule
    const supportsRule = result.find((r) =>
      r.atRules?.some((a) => a.includes('not')),
    );
    expect(supportsRule).toBeDefined();
    expect(supportsRule!.atRules![0]).toBe('@supports (not (display: grid))');
  });

  it('should apply exclusive logic to @supports queries', () => {
    const styles = {
      display: {
        '': 'block',
        '@supports(display: grid)': 'grid',
        '@supports($, :has(*))': 'flex',
      },
    };

    const result = renderStyles(styles, '.test');

    // Should have 3 rules with exclusive conditions
    expect(result.length).toBe(3);

    // Find each rule
    const hasRule = result.find(
      (r) =>
        r.atRules?.[0]?.includes('selector(:has(*))') &&
        !r.atRules?.[0]?.includes('not'),
    );
    const gridRule = result.find(
      (r) =>
        r.atRules?.[0]?.includes('(display: grid)') &&
        r.atRules?.[0]?.includes('not selector(:has(*))'),
    );
    const defaultRule = result.find(
      (r) =>
        r.atRules?.[0]?.includes('not (display: grid)') &&
        r.atRules?.[0]?.includes('not selector(:has(*))'),
    );

    expect(hasRule).toBeDefined();
    expect(hasRule!.declarations).toContain('display: flex');

    expect(gridRule).toBeDefined();
    expect(gridRule!.declarations).toContain('display: grid');

    expect(defaultRule).toBeDefined();
    expect(defaultRule!.declarations).toContain('display: block');
  });

  it('should eliminate impossible @supports combinations', () => {
    const styles = {
      display: {
        '': 'block',
        '@supports(display: grid)': 'grid',
        '@supports($, :has(*))': 'flex',
        '!@supports(display: grid)': 'inline-block',
      },
    };

    const result = renderStyles(styles, '.test');

    // The default 'block' should be eliminated because:
    // - !@supports(grid) covers no-grid cases
    // - @supports(grid) & @supports(:has(*)) covers grid+has
    // - @supports(grid) & !@supports(:has(*)) covers grid-only
    // These cover all 4 combinations, making default unreachable
    expect(result.length).toBe(3);

    // Verify the three rules
    const noGridRule = result.find(
      (r) => r.atRules?.[0] === '@supports (not (display: grid))',
    );
    expect(noGridRule).toBeDefined();
    expect(noGridRule!.declarations).toContain('display: inline-block');
  });

  it('should support doubleSelector option for increased specificity', () => {
    const styles = { color: 'red' };

    // Default: no doubling
    const resultDefault = renderStyles(styles, '.card');
    expect(resultDefault[0].selector).toBe('.card');

    // Explicit doubleSelector: true
    const resultDoubled = renderStyles(styles, '.card', {
      doubleSelector: true,
    });
    expect(resultDoubled[0].selector).toBe('.card.card');

    // Explicit doubleSelector: false
    const resultNotDoubled = renderStyles(styles, '.card', {
      doubleSelector: false,
    });
    expect(resultNotDoubled[0].selector).toBe('.card');

    // Non-class selectors are never doubled
    const resultBody = renderStyles(styles, 'body', { doubleSelector: true });
    expect(resultBody[0].selector).toBe('body');
  });
});

describe('Complex OR conditions with mixed types', () => {
  it('should detect media feature contradictions', () => {
    // @media(light) & !@media(light) should simplify to FALSE
    const light = parseStateKey('@media(prefers-color-scheme: light)', {});
    const notLight = not(light);
    const contradiction = and(light, notLight);
    const simplified = simplifyCondition(contradiction);

    expect(simplified.kind).toBe('false');
  });

  it('should analyze OR condition with mixed media and root states', () => {
    // Parse the complex condition
    const darkCondition = parseStateKey(
      '(@media(prefers-color-scheme: light) | @media(prefers-color-scheme: no-preference)) | (@root(prefers-schema=light) & @root(prefers-schema=system))',
      {},
    );

    // Get CSS components for the dark condition
    const darkCSS = conditionToCSS(darkCondition);

    // Negate and simplify for the white (default) condition
    const whiteCondition = not(darkCondition);
    const simplifiedWhite = simplifyCondition(whiteCondition);

    const whiteCSS = conditionToCSS(simplifiedWhite);

    // The dark condition should have 3 variants (2 media + 1 root)
    expect(darkCSS.variants.length).toBe(3);

    // The white condition should properly negate the OR
    // NOT(A | B | C) = NOT(A) & NOT(B) & NOT(C)
    // where C = (root1 & root2), so NOT(C) = NOT(root1) | NOT(root2)
    // Final: NOT(media1) & NOT(media2) & (NOT(root1) | NOT(root2))
    // In DNF: 2 terms
    expect(whiteCSS.variants.length).toBe(2);
  });

  it('should render correct CSS for complex OR with mixed types', () => {
    // Clear cache to ensure fresh computation
    clearPipelineCache();

    // The third OR branch combines TWO @root attribute checks on DIFFERENT
    // attributes — both can be true simultaneously (one element, two
    // attributes). Two checks on the SAME attribute with different values
    // would (correctly) simplify to FALSE since :root has one value per
    // attribute; that's covered by a separate test below.
    const styles = {
      color: {
        '': '#white',
        '(@media(prefers-color-scheme: light) | @media(prefers-color-scheme: no-preference)) | (@root(prefers-schema=light) & @root(prefers-contrast=more))':
          '#dark',
      },
    };

    const result = renderStyles(styles, '.test');

    // Check that dark rules exist for each OR branch
    const darkRules = result.filter((r) => r.declarations.includes('dark'));
    expect(darkRules.length).toBeGreaterThanOrEqual(3);

    // Check that white (default) condition fans out into at-rule-wrapped
    // branches that negate the @root(schema=light) & @root(contrast=more)
    // compound. DNF order is implementation-defined — either `!schema` or
    // `!contrast` can be the first branch — so we check for structural
    // presence, not exact branch order.
    const whiteRules = result.filter((r) => r.declarations.includes('white'));
    expect(whiteRules.length).toBeGreaterThanOrEqual(2);

    // Every white rule must be under the "neither media matches" context.
    for (const r of whiteRules) {
      const hasMediaNegation = (r.atRules ?? []).some(
        (ar) =>
          ar.includes('not (prefers-color-scheme: light)') &&
          ar.includes('not (prefers-color-scheme: no-preference)'),
      );
      expect(hasMediaNegation).toBe(true);
    }

    // White rules collectively cover the negation of (schema=light & contrast=more):
    // there must be at least one rule that negates each half independently.
    const joinedSelectors = whiteRules.map((r) => r.selector).join('\n');
    expect(joinedSelectors).toContain(':not([data-prefers-schema="light"])');
    expect(joinedSelectors).toContain(':not([data-prefers-contrast="more"])');
  });

  it('should not produce redundant :not() when boolean root subsumes valued root', () => {
    clearPipelineCache();

    // When we negate "@root(schema) | @root(schema=dark)", each @root()
    // produces an independent negated rootGroup. optimizeGroups detects
    // that :not([data-schema]) subsumes :not([data-schema="dark"]) and
    // drops the latter.
    const styles = {
      color: {
        '': 'red',
        '@root(schema) | @root(schema=dark)': 'blue',
      },
    };

    const result = renderStyles(styles, '.test');

    const defaultRules = result.filter((r) => r.declarations.includes('red'));
    expect(defaultRules.length).toBeGreaterThanOrEqual(1);
    for (const rule of defaultRules) {
      const sel =
        typeof rule.selector === 'string'
          ? rule.selector
          : rule.selector.join(', ');
      if (sel.includes(':not([data-schema])')) {
        expect(sel).not.toContain(':not([data-schema="dark"])');
      }
    }
  });

  it('should support compound AND in @root()', () => {
    clearPipelineCache();

    const styles = {
      color: {
        '': 'red',
        '@root(theme=dark & mode=compact)': 'blue',
      },
    };

    const result = renderStyles(styles, '.test');
    const blueRule = result.find((r) => r.declarations.includes('blue'));
    expect(blueRule).toBeDefined();
    expect(blueRule!.selector).toContain(':root');
    expect(blueRule!.selector).toContain('[data-theme="dark"]');
    expect(blueRule!.selector).toContain('[data-mode="compact"]');
  });

  it('should support compound AND in @parent()', () => {
    clearPipelineCache();

    const styles = {
      color: {
        '': 'red',
        '@parent(theme=dark & !disabled)': 'blue',
      },
    };

    const result = renderStyles(styles, '.test');
    const blueRule = result.find((r) => r.declarations.includes('blue'));
    expect(blueRule).toBeDefined();
    expect(blueRule!.selector).toContain(':is(');
    expect(blueRule!.selector).toContain('[data-theme="dark"]');
    expect(blueRule!.selector).toContain(':not([data-disabled])');
  });

  it('should support OR inside @root()', () => {
    clearPipelineCache();

    const styles = {
      color: {
        '': 'red',
        '@root(theme=dark | mode=compact)': 'blue',
      },
    };

    const result = renderStyles(styles, '.test');
    const blueRules = result.filter((r) => r.declarations.includes('blue'));
    expect(blueRules.length).toBeGreaterThanOrEqual(1);

    const allSelectors = blueRules.map((r) => r.selector).join(', ');
    expect(allSelectors).toContain(
      ':root:is([data-mode="compact"], [data-theme="dark"])',
    );
  });

  it('should support OR inside @parent()', () => {
    clearPipelineCache();

    const styles = {
      color: {
        '': 'red',
        '@parent(hovered | focused)': 'blue',
      },
    };

    const result = renderStyles(styles, '.test');
    const blueRules = result.filter((r) => r.declarations.includes('blue'));
    expect(blueRules.length).toBeGreaterThanOrEqual(1);

    const allSelectors = blueRules.map((r) => r.selector).join(', ');
    expect(allSelectors).toContain(':is([data-focused] *, [data-hovered] *)');
  });
});

describe('Sub-element selector affix ($) tests', () => {
  beforeEach(() => {
    clearPipelineCache();
  });

  describe('Basic combinators', () => {
    it('should handle direct child selector ">"', () => {
      const styles = {
        Row: {
          $: '>',
          padding: '1x',
        },
      };

      const result = renderStyles(styles, '.table');
      expect(result.length).toBe(1);
      expect(result[0].selector).toContain('> [data-element="Row"]');
    });

    it('should handle default descendant selector (no $)', () => {
      const styles = {
        Label: {
          color: 'red',
        },
      };

      const result = renderStyles(styles, '.input');
      expect(result.length).toBe(1);
      expect(result[0].selector).toContain(' [data-element="Label"]');
    });

    it('should handle empty $ as default descendant', () => {
      const styles = {
        Label: {
          $: '',
          color: 'red',
        },
      };

      const result = renderStyles(styles, '.input');
      expect(result.length).toBe(1);
      expect(result[0].selector).toContain(' [data-element="Label"]');
    });
  });

  describe('Self-name shorthand', () => {
    it('should treat trailing element name matching the key as the placeholder (with combinator)', () => {
      const styles = {
        SubElementName: {
          $: '> SubElementName',
          color: 'red',
        },
      };

      const result = renderStyles(styles, '.root');
      expect(result.length).toBe(1);
      expect(result[0].selector).toContain('> [data-element="SubElementName"]');
      // No duplicated key injection.
      expect(result[0].selector).not.toMatch(
        /\[data-element="SubElementName"\][^,{]*\[data-element="SubElementName"\]/,
      );
    });

    it('should treat sole element name matching the key as the placeholder (descendant)', () => {
      const styles = {
        SubElementName: {
          $: 'SubElementName',
          color: 'red',
        },
      };

      const result = renderStyles(styles, '.root');
      expect(result.length).toBe(1);
      expect(result[0].selector).toContain(' [data-element="SubElementName"]');
      expect(result[0].selector).not.toMatch(
        /\[data-element="SubElementName"\][^,{]*\[data-element="SubElementName"\]/,
      );
    });

    it('should treat trailing key in chained pattern as the placeholder', () => {
      const styles = {
        Cell: {
          $: '> Body > Cell',
          padding: '1x',
        },
      };

      const result = renderStyles(styles, '.table');
      expect(result.length).toBe(1);
      expect(result[0].selector).toMatch(
        /> \[data-element="Body"\] > \[data-element="Cell"\]/,
      );
      // Key not duplicated as a descendant.
      expect(result[0].selector).not.toMatch(
        /\[data-element="Cell"\][^,{]*\[data-element="Cell"\]/,
      );
    });

    it('should still inject the key as a descendant when trailing name differs from the key', () => {
      const styles = {
        Cell: {
          $: '>Body>Row',
          padding: '1x',
        },
      };

      const result = renderStyles(styles, '.table');
      expect(result.length).toBe(1);
      expect(result[0].selector).toMatch(
        /> \[data-element="Body"\] > \[data-element="Row"\] \[data-element="Cell"\]/,
      );
    });
  });

  describe('Chained selectors', () => {
    it('should handle chained selectors with trailing combinator', () => {
      const styles = {
        Cell: {
          $: '>Body>Row>',
          border: true,
        },
      };

      const result = renderStyles(styles, '.table');
      expect(result.length).toBe(1);
      expect(result[0].selector).toContain('[data-element="Body"]');
      expect(result[0].selector).toContain('[data-element="Row"]');
      expect(result[0].selector).toContain('[data-element="Cell"]');
      expect(result[0].selector).toMatch(
        /> \[data-element="Body"\] > \[data-element="Row"\] > \[data-element="Cell"\]/,
      );
    });

    it('should handle chained selectors ending with element (descendant)', () => {
      const styles = {
        Text: {
          $: '>Body>Row',
          color: 'red',
        },
      };

      const result = renderStyles(styles, '.table');
      expect(result.length).toBe(1);
      // Text should be a descendant of Row
      expect(result[0].selector).toMatch(
        /> \[data-element="Body"\] > \[data-element="Row"\] \[data-element="Text"\]/,
      );
    });

    it('should support spaced syntax (backward compatible)', () => {
      const styles = {
        Cell: {
          $: '> Body > Row >',
          border: true,
        },
      };

      const result = renderStyles(styles, '.table');
      expect(result.length).toBe(1);
      expect(result[0].selector).toMatch(
        /> \[data-element="Body"\] > \[data-element="Row"\] > \[data-element="Cell"\]/,
      );
    });
  });

  describe('Pseudo-elements on root', () => {
    it('should handle ::before on root', () => {
      const styles = {
        Before: {
          $: '::before',
          content: '""',
        },
      };

      const result = renderStyles(styles, '.divider');
      expect(result.length).toBe(1);
      // Selectors are NOT doubled by default (use { doubleSelector: true } to double)
      expect(result[0].selector).toBe('.divider::before');
      expect(result[0].selector).not.toContain('data-element');
    });

    it('should handle ::after on root', () => {
      const styles = {
        After: {
          $: '::after',
          content: '""',
        },
      };

      const result = renderStyles(styles, '.divider');
      expect(result.length).toBe(1);
      // Selectors are NOT doubled by default (use { doubleSelector: true } to double)
      expect(result[0].selector).toBe('.divider::after');
    });
  });

  describe('Pseudo on sub-element using @', () => {
    it('should handle @::before on sub-element', () => {
      const styles = {
        Label: {
          $: '@::before',
          content: '""',
        },
      };

      const result = renderStyles(styles, '.input');
      expect(result.length).toBe(1);
      expect(result[0].selector).toContain('[data-element="Label"]::before');
    });

    it('should handle >@::before (direct child with pseudo)', () => {
      const styles = {
        Label: {
          $: '>@::before',
          content: '""',
        },
      };

      const result = renderStyles(styles, '.input');
      expect(result.length).toBe(1);
      expect(result[0].selector).toContain('> [data-element="Label"]::before');
    });

    it('should handle >@:hover (pseudo-class on sub-element)', () => {
      const styles = {
        Item: {
          $: '>@:hover',
          fill: '#hover',
        },
      };

      const result = renderStyles(styles, '.list');
      expect(result.length).toBe(1);
      expect(result[0].selector).toContain('> [data-element="Item"]:hover');
    });

    it('should handle multiple pseudo-classes', () => {
      const styles = {
        Item: {
          $: '>@:hover:focus',
          outline: '2px solid blue',
        },
      };

      const result = renderStyles(styles, '.list');
      expect(result.length).toBe(1);
      expect(result[0].selector).toContain(
        '> [data-element="Item"]:hover:focus',
      );
    });
  });

  describe('Class selectors', () => {
    it('should handle class selector (no key injection)', () => {
      const styles = {
        Active: {
          $: '.active',
          fill: 'blue',
        },
      };

      const result = renderStyles(styles, '.card');
      expect(result.length).toBe(1);
      expect(result[0].selector).toContain('.active');
      expect(result[0].selector).not.toContain('data-element');
    });

    it('should handle camelCase class names (.myClass)', () => {
      const styles = {
        Item: {
          $: '.myClass',
          fill: 'blue',
        },
      };

      const result = renderStyles(styles, '.card');
      expect(result.length).toBe(1);
      // Should preserve the full class name with uppercase letters
      expect(result[0].selector).toContain('.myClass');
      // Should NOT incorrectly split into .my and [data-element="Class"]
      expect(result[0].selector).not.toContain('data-element');
    });

    it('should handle camelCase class on sub-element (>@.navItem)', () => {
      const styles = {
        Link: {
          $: '>@.navItem',
          fill: 'blue',
        },
      };

      const result = renderStyles(styles, '.nav');
      expect(result.length).toBe(1);
      // Should attach full camelCase class to the element
      expect(result[0].selector).toContain('[data-element="Link"].navItem');
      // Should NOT incorrectly treat "Item" as a sub-element
      expect(result[0].selector).not.toContain('[data-element="Item"]');
    });

    it('should handle class followed by pseudo (.active:hover)', () => {
      const styles = {
        Button: {
          $: '.active:hover',
          fill: 'blue',
        },
      };

      const result = renderStyles(styles, '.card');
      expect(result.length).toBe(1);
      // Should have class followed by pseudo without space
      expect(result[0].selector).toContain('.active:hover');
      expect(result[0].selector).not.toContain('data-element');
    });

    it('should handle >@.active (class on sub-element)', () => {
      const styles = {
        Item: {
          $: '>@.active',
          fill: 'blue',
        },
      };

      const result = renderStyles(styles, '.list');
      expect(result.length).toBe(1);
      expect(result[0].selector).toContain('> [data-element="Item"].active');
    });

    it('should handle @[disabled] (attribute on sub-element)', () => {
      const styles = {
        Item: {
          $: '@[disabled]',
          opacity: '0.5',
        },
      };

      const result = renderStyles(styles, '.list');
      expect(result.length).toBe(1);
      // Should attach attribute directly to element, not as descendant
      expect(result[0].selector).toContain('[data-element="Item"][disabled]');
      // Should NOT have space between element and attribute
      expect(result[0].selector).not.toMatch(
        /\[data-element="Item"\]\s+\[disabled\]/,
      );
    });

    it('should handle >@[aria-selected="true"] (attribute on direct child)', () => {
      const styles = {
        Option: {
          $: '>@[aria-selected="true"]',
          fill: 'blue',
        },
      };

      const result = renderStyles(styles, '.select');
      expect(result.length).toBe(1);
      expect(result[0].selector).toContain(
        '> [data-element="Option"][aria-selected="true"]',
      );
    });
  });

  describe('Sibling combinators', () => {
    it('should handle valid sibling after element: >Item+', () => {
      const styles = {
        Next: {
          $: '>Item+',
          marginTop: '1x',
        },
      };

      const result = renderStyles(styles, '.list');
      expect(result.length).toBe(1);
      expect(result[0].selector).toContain(
        '> [data-element="Item"] + [data-element="Next"]',
      );
    });

    it('should handle valid general sibling: >First~', () => {
      const styles = {
        Rest: {
          $: '>First~',
          opacity: '0.8',
        },
      };

      const result = renderStyles(styles, '.list');
      expect(result.length).toBe(1);
      expect(result[0].selector).toContain(
        '> [data-element="First"] ~ [data-element="Rest"]',
      );
    });

    it('should warn and skip invalid standalone + selector', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
        /* noop */
      });

      const styles = {
        Item: {
          $: '+',
          marginTop: '1x',
        },
      };

      const result = renderStyles(styles, '.list');
      // Should be empty - invalid selector is skipped
      expect(result.length).toBe(0);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('outside the root scope'),
      );

      warnSpy.mockRestore();
    });

    it('should warn and skip invalid standalone ~ selector', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
        /* noop */
      });

      const styles = {
        Item: {
          $: '~',
          marginTop: '1x',
        },
      };

      const result = renderStyles(styles, '.list');
      expect(result.length).toBe(0);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('outside the root scope'),
      );

      warnSpy.mockRestore();
    });

    it('should warn and skip +Element pattern (targets outside root)', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
        /* noop */
      });

      const styles = {
        Next: {
          $: '+Item',
          marginTop: '1x',
        },
      };

      const result = renderStyles(styles, '.list');
      expect(result.length).toBe(0);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('outside the root scope'),
      );

      warnSpy.mockRestore();
    });

    it('should warn and skip ~Element pattern (targets outside root)', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
        /* noop */
      });

      const styles = {
        Other: {
          $: '~Item',
          marginTop: '1x',
        },
      };

      const result = renderStyles(styles, '.list');
      expect(result.length).toBe(0);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('outside the root scope'),
      );

      warnSpy.mockRestore();
    });

    it('should warn and skip consecutive combinators', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
        /* noop */
      });

      const styles = {
        Item: {
          $: '>>',
          marginTop: '1x',
        },
      };

      const result = renderStyles(styles, '.list');
      expect(result.length).toBe(0);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('consecutive combinators'),
      );

      warnSpy.mockRestore();
    });
  });

  describe('Multiple selectors (comma)', () => {
    it('should handle comma-separated patterns', () => {
      const styles = {
        Cell: {
          $: '>, >Body>',
          padding: '1x',
        },
      };

      const result = renderStyles(styles, '.table');
      // Should generate styles for both patterns (may be 1 merged or 2 separate rules)
      expect(result.length).toBeGreaterThanOrEqual(1);
      // Check that both selector patterns are covered
      const selectors = result.map((r) => r.selector).join(' ');
      expect(selectors).toContain('[data-element="Cell"]');
      // Both patterns should be present
      expect(selectors).toContain('> [data-element="Cell"]');
      expect(selectors).toContain('[data-element="Body"]');
    });

    it('should handle multiple pseudo patterns', () => {
      const styles = {
        Deco: {
          $: '::before, ::after',
          content: '""',
        },
      };

      const result = renderStyles(styles, '.divider');
      // Both ::before and ::after should be generated
      const selectors = result.map((r) => r.selector);
      expect(selectors.some((s) => s.includes('::before'))).toBe(true);
      expect(selectors.some((s) => s.includes('::after'))).toBe(true);
    });
  });

  describe('Pseudo-class on root (no injection)', () => {
    it('should handle :hover on root', () => {
      const styles = {
        Hover: {
          $: ':hover',
          fill: 'blue',
        },
      };

      const result = renderStyles(styles, '.button');
      expect(result.length).toBe(1);
      // Selectors are NOT doubled by default (use { doubleSelector: true } to double)
      expect(result[0].selector).toBe('.button:hover');
      expect(result[0].selector).not.toContain('data-element');
    });

    it('should handle :first-child on root', () => {
      const styles = {
        First: {
          $: ':first-child',
          marginTop: '0',
        },
      };

      const result = renderStyles(styles, '.item');
      expect(result.length).toBe(1);
      // Selectors are NOT doubled by default (use { doubleSelector: true } to double)
      expect(result[0].selector).toBe('.item:first-child');
    });
  });

  describe('Attribute selectors', () => {
    it('should handle attribute selector (no key injection)', () => {
      const styles = {
        TextInput: {
          $: '[type="text"]',
          border: true,
        },
      };

      const result = renderStyles(styles, '.form');
      expect(result.length).toBe(1);
      expect(result[0].selector).toContain('[type="text"]');
      expect(result[0].selector).not.toContain('data-element="TextInput"');
    });
  });

  describe('Edge cases', () => {
    it('should strip leading & from pattern', () => {
      const styles = {
        Before: {
          $: '&::before',
          content: '""',
        },
      };

      const result = renderStyles(styles, '.el');
      expect(result.length).toBe(1);
      // Selectors are NOT doubled by default (use { doubleSelector: true } to double)
      expect(result[0].selector).toBe('.el::before');
    });

    it('should handle complex pattern: >Body>Item+', () => {
      const styles = {
        Next: {
          $: '>Body>Item+',
          marginLeft: '1x',
        },
      };

      const result = renderStyles(styles, '.list');
      expect(result.length).toBe(1);
      expect(result[0].selector).toContain('[data-element="Body"]');
      expect(result[0].selector).toContain('[data-element="Item"]');
      expect(result[0].selector).toContain('[data-element="Next"]');
      expect(result[0].selector).toMatch(/\+ \[data-element="Next"\]/);
    });

    it('should handle element without leading combinator: Body>', () => {
      const styles = {
        Cell: {
          $: 'Body>',
          padding: '1x',
        },
      };

      const result = renderStyles(styles, '.table');
      expect(result.length).toBe(1);
      // Body is descendant of root, Cell is direct child of Body
      expect(result[0].selector).toMatch(
        /\[data-element="Body"\] > \[data-element="Cell"\]/,
      );
    });

    it('should handle direct child class selector: >.active', () => {
      const styles = {
        Active: {
          $: '>.active',
          fill: 'blue',
        },
      };

      const result = renderStyles(styles, '.card');
      expect(result.length).toBe(1);
      expect(result[0].selector).toContain('> .active');
      expect(result[0].selector).not.toContain('data-element');
    });

    it('should handle class on sub-element without combinator: @.active', () => {
      const styles = {
        Item: {
          $: '@.active',
          fill: 'blue',
        },
      };

      const result = renderStyles(styles, '.list');
      expect(result.length).toBe(1);
      expect(result[0].selector).toContain('[data-element="Item"].active');
    });
  });

  describe('HTML tag selectors', () => {
    it('should handle simple tag selector: a (no key injection)', () => {
      const styles = {
        Links: {
          $: 'a',
          color: 'blue',
        },
      };

      const result = renderStyles(styles, '.nav');
      expect(result.length).toBe(1);
      expect(result[0].selector).toContain(' a');
      expect(result[0].selector).not.toContain('data-element');
    });

    it('should handle direct child tag: >a (no key injection)', () => {
      const styles = {
        Link: {
          $: '>a',
          textDecoration: 'none',
        },
      };

      const result = renderStyles(styles, '.nav');
      expect(result.length).toBe(1);
      expect(result[0].selector).toContain('> a');
      expect(result[0].selector).not.toContain('data-element');
    });

    it('should handle chained tags: >ul>li (no key injection)', () => {
      const styles = {
        Item: {
          $: '>ul>li',
          padding: '1x',
        },
      };

      const result = renderStyles(styles, '.list');
      expect(result.length).toBe(1);
      expect(result[0].selector).toMatch(/> ul > li/);
      expect(result[0].selector).not.toContain('data-element');
    });

    it('should handle tag with trailing combinator: >li>', () => {
      const styles = {
        Content: {
          $: '>li>',
          padding: '1x',
        },
      };

      const result = renderStyles(styles, '.list');
      expect(result.length).toBe(1);
      expect(result[0].selector).toMatch(/> li > \[data-element="Content"\]/);
    });

    it('should handle mixed tags and elements: >Body>span (no key injection for trailing tag)', () => {
      const styles = {
        Text: {
          $: '>Body>span',
          color: 'red',
        },
      };

      const result = renderStyles(styles, '.card');
      expect(result.length).toBe(1);
      expect(result[0].selector).toContain('[data-element="Body"]');
      expect(result[0].selector).toContain('> span');
      expect(result[0].selector).not.toContain('[data-element="Text"]');
    });

    it('should handle tag with pseudo: a:hover (no key injection)', () => {
      const styles = {
        HoverLink: {
          $: 'a:hover',
          color: 'red',
        },
      };

      const result = renderStyles(styles, '.nav');
      expect(result.length).toBe(1);
      expect(result[0].selector).toContain(' a:hover');
      // No key injection because pattern ends with pseudo
      expect(result[0].selector).not.toContain('data-element');
    });

    it('should handle tag with class: button.primary (no key injection)', () => {
      const styles = {
        Primary: {
          $: 'button.primary',
          fill: 'blue',
        },
      };

      const result = renderStyles(styles, '.form');
      expect(result.length).toBe(1);
      expect(result[0].selector).toContain(' button.primary');
      // No key injection because pattern ends with class
      expect(result[0].selector).not.toContain('data-element');
    });

    it('should handle tag with @ placeholder: >@>span', () => {
      const styles = {
        Label: {
          $: '>@>span',
          fontWeight: 'bold',
        },
      };

      const result = renderStyles(styles, '.button');
      expect(result.length).toBe(1);
      expect(result[0].selector).toMatch(/> \[data-element="Label"\] > span/);
    });

    it('should handle custom element tags: my-component (no key injection)', () => {
      const styles = {
        Custom: {
          $: '>my-component',
          display: 'block',
        },
      };

      const result = renderStyles(styles, '.container');
      expect(result.length).toBe(1);
      expect(result[0].selector).toContain('> my-component');
      expect(result[0].selector).not.toContain('data-element');
    });

    it('should handle tag with attribute: button[disabled] (no key injection)', () => {
      const styles = {
        Disabled: {
          $: 'button[disabled]',
          opacity: '0.5',
        },
      };

      const result = renderStyles(styles, '.form');
      expect(result.length).toBe(1);
      // Should be compound selector without space between tag and attribute
      expect(result[0].selector).toContain(' button[disabled]');
      // No key injection because pattern ends with attribute
      expect(result[0].selector).not.toContain('data-element');
    });

    it('should handle h1 tag (no key injection)', () => {
      const styles = {
        Title: {
          $: 'h1',
          color: 'red',
        },
      };

      const result = renderStyles(styles, '.card');
      expect(result.length).toBe(1);
      expect(result[0].selector).toContain(' h1');
      expect(result[0].selector).not.toContain('data-element');
    });

    it('should handle tag with trailing combinator: h1 > (key injection)', () => {
      const styles = {
        Title: {
          $: 'h1 >',
          color: 'red',
        },
      };

      const result = renderStyles(styles, '.card');
      expect(result.length).toBe(1);
      expect(result[0].selector).toMatch(/h1 > \[data-element="Title"\]/);
    });
  });

  describe('Universal selector (*)', () => {
    it('should handle bare universal selector: *', () => {
      const styles = {
        All: {
          $: '*',
          boxSizing: 'border-box',
        },
      };

      const result = renderStyles(styles, '.root');
      expect(result.length).toBe(1);
      expect(result[0].selector).toContain(' *');
      expect(result[0].selector).not.toContain('data-element');
    });

    it('should handle tag followed by universal: h1 *', () => {
      const styles = {
        Title: {
          $: 'h1 *',
          color: 'inherit',
        },
      };

      const result = renderStyles(styles, '.card');
      expect(result.length).toBe(1);
      expect(result[0].selector).toContain(' h1 *');
      expect(result[0].selector).not.toContain('data-element');
    });

    it('should handle direct child universal: > *', () => {
      const styles = {
        Children: {
          $: '> *',
          margin: '0',
        },
      };

      const result = renderStyles(styles, '.stack');
      expect(result.length).toBe(1);
      expect(result[0].selector).toContain('> *');
      expect(result[0].selector).not.toContain('data-element');
    });
  });

  describe('Invalid pattern validation', () => {
    it('should warn and skip numeric-only patterns', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
        /* noop */
      });

      const styles = {
        Label: {
          $: '123',
          color: 'red',
        },
      };

      const result = renderStyles(styles, '.input');
      expect(result.length).toBe(0);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('unrecognized token'),
      );

      warnSpy.mockRestore();
    });

    it('should warn and skip patterns starting with numbers', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
        /* noop */
      });

      const styles = {
        Label: {
          $: '123abc',
          color: 'red',
        },
      };

      const result = renderStyles(styles, '.input');
      expect(result.length).toBe(0);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('unrecognized token'),
      );

      warnSpy.mockRestore();
    });
  });
});

describe('@supports queries snapshot tests', () => {
  beforeEach(() => {
    clearPipelineCache();
  });

  it('should render @supports feature query', () => {
    const styles = {
      display: {
        '': 'block',
        '@supports(display: grid)': 'grid',
      },
    };

    const result = renderStyles(styles, '.component');
    expect(result).toMatchSnapshot();
  });

  it('should render @supports selector query', () => {
    const styles = {
      display: {
        '': 'block',
        '@supports($, :has(*))': 'flex',
      },
    };

    const result = renderStyles(styles, '.component');
    expect(result).toMatchSnapshot();
  });

  it('should render multiple @supports with exclusive logic', () => {
    const styles = {
      display: {
        '': 'block',
        '@supports(display: flex)': 'flex',
        '@supports(display: grid)': 'grid',
      },
    };

    const result = renderStyles(styles, '.component');
    expect(result).toMatchSnapshot();
  });

  it('should render @supports combined with AND', () => {
    const styles = {
      display: {
        '': 'block',
        '@supports(display: grid) & @supports($, :has(*))': 'grid',
      },
    };

    const result = renderStyles(styles, '.component');
    expect(result).toMatchSnapshot();
  });

  it('should render @supports combined with OR', () => {
    const styles = {
      display: {
        '': 'block',
        '@supports(display: grid) | @supports(display: flex)': 'flex',
      },
    };

    const result = renderStyles(styles, '.component');
    expect(result).toMatchSnapshot();
  });

  it('should render @supports with modifiers', () => {
    const styles = {
      color: {
        '': 'black',
        '@supports(display: grid) & hovered': 'blue',
      },
    };

    const result = renderStyles(styles, '.component');
    expect(result).toMatchSnapshot();
  });

  it('should render @supports with modifier - 2 exclusive rules', () => {
    // Example from user: A & B, and !A | !B should produce exactly 2 rules
    // where A = @supports($, :has(*)) and B = :has(> Icon)
    const styles = {
      display: {
        '': 'block', // !A | !B
        '@supports($, :has(*)) & :has(> Icon)': 'grid', // A & B
      },
    };

    const result = renderStyles(styles, '.demo');

    // Should produce exactly 2 non-overlapping rules:
    // 1. A & B = grid
    // 2. !A = block (first OR branch, covers when supports is false)
    // 3. A & !B = block (second OR branch, covers when supports true but no :has)
    // Rules 2 and 3 have the same value, so they may be merged or kept separate
    // But the key is: NO overlapping, and exactly 2 DISTINCT rules (by selector/at-rule)

    // Verify we have distinct rules with no overlap
    const _atRules = result.map((r) => r.atRules?.[0] || 'none');
    const _selectors = result.map((r) => r.selector);

    // Should have 3 rules (2 for default covering !A and A&!B, 1 for A&B)
    expect(result.length).toBe(3);

    // Verify A & B rule exists
    // :has(> Icon) is transformed to :has(> [data-element="Icon"])
    const supportsWithHas = result.find(
      (r) =>
        r.atRules?.[0]?.includes('selector(:has(*)') &&
        r.selector.includes(':has(> [data-element="Icon"])') &&
        !r.selector.includes(':not'),
    );
    expect(supportsWithHas).toBeDefined();
    expect(supportsWithHas!.declarations).toContain('grid');

    // Verify !A rule exists
    const noSupports = result.find((r) =>
      r.atRules?.[0]?.includes('not selector(:has(*)'),
    );
    expect(noSupports).toBeDefined();
    expect(noSupports!.declarations).toContain('block');

    // Verify A & !B rule exists
    const supportsNoHas = result.find(
      (r) =>
        r.atRules?.[0]?.includes('selector(:has(*)') &&
        r.selector.includes(':not(:has(> [data-element="Icon"]))'),
    );
    expect(supportsNoHas).toBeDefined();
    expect(supportsNoHas!.declarations).toContain('block');

    expect(result).toMatchSnapshot();
  });

  it('should render @supports with multiple modifier states - 3 exclusive rules', () => {
    // Example from user: A & B, A & !B, and !A should produce exactly 3 rules
    // where A = @supports($, :has(*)) and B = :has(> Icon)
    // Using display property to avoid color normalization issues
    const styles = {
      display: {
        '': 'block', // V2 - should apply to !A only
        '@supports($, :has(*)) & !:has(> Icon)': 'flex', // V3 - A & !B
        '@supports($, :has(*)) & :has(> Icon)': 'grid', // V1 - A & B
      },
    };

    const result = renderStyles(styles, '.demo');

    // Should produce exactly 3 non-overlapping rules:
    // 1. A & B = grid
    // 2. A & !B = flex
    // 3. !A = block (covers !A & B and !A & !B)
    expect(result.length).toBe(3);

    // Verify rules exist
    // :has(> Icon) is transformed to :has(> [data-element="Icon"])
    const supportsHasWithIcon = result.filter(
      (r) =>
        r.atRules?.[0]?.includes('selector(:has(*)') &&
        r.selector.includes(':has(> [data-element="Icon"])') &&
        !r.selector.includes(':not(:has'),
    );
    expect(supportsHasWithIcon.length).toBe(1);
    expect(supportsHasWithIcon[0].declarations).toContain('grid');

    const supportsHasNoIcon = result.filter(
      (r) =>
        r.atRules?.[0]?.includes('selector(:has(*)') &&
        r.selector.includes(':not(:has(> [data-element="Icon"]))'),
    );
    expect(supportsHasNoIcon.length).toBe(1);
    expect(supportsHasNoIcon[0].declarations).toContain('flex');

    const noSupports = result.filter((r) =>
      r.atRules?.[0]?.includes('not selector(:has(*)'),
    );
    expect(noSupports.length).toBe(1);
    expect(noSupports[0].declarations).toContain('block');

    expect(result).toMatchSnapshot();
  });

  it('should render @supports combined with @media', () => {
    const styles = {
      display: {
        '': 'block',
        '@media(w <= 768px) & @supports(display: grid)': 'grid',
      },
    };

    const result = renderStyles(styles, '.component');
    expect(result).toMatchSnapshot();
  });

  it('should render @supports combined with @container', () => {
    const styles = {
      display: {
        '': 'block',
        '@(w <= 400px) & @supports(display: grid)': 'grid',
      },
    };

    const result = renderStyles(styles, '.component');
    expect(result).toMatchSnapshot();
  });

  it('should eliminate impossible @supports combinations', () => {
    const styles = {
      display: {
        '': 'block',
        '@supports(display: grid)': 'grid',
        '@supports($, :has(*))': 'flex',
        '!@supports(display: grid)': 'inline-block',
      },
    };

    const result = renderStyles(styles, '.component');
    // Default 'block' should be eliminated as other rules cover all cases
    expect(result).toMatchSnapshot();
  });
});

describe('Vendor-prefixed pseudo-classes', () => {
  beforeEach(() => {
    clearPipelineCache();
  });

  it('should tokenize :-webkit-autofill as a pseudo-class', () => {
    const styles = {
      color: { '': 'black', ':-webkit-autofill': 'blue' },
    };

    const result = renderStyles(styles, '.input');
    const autofillRule = result.find((r) =>
      r.selector.includes(':-webkit-autofill'),
    );
    expect(autofillRule).toBeDefined();
    expect(autofillRule!.declarations).toContain('blue');
    // Should NOT have a [data-webkit-autofill] attribute selector
    const attrRule = result.find((r) =>
      r.selector.includes('[data-webkit-autofill]'),
    );
    expect(attrRule).toBeUndefined();
  });

  it('should work in combined states with &', () => {
    const styles = {
      color: { '(:-webkit-autofill & :hover)': 'red' },
    };

    const result = renderStyles(styles, '.input');
    const rule = result.find(
      (r) =>
        r.selector.includes(':-webkit-autofill') &&
        r.selector.includes(':hover'),
    );
    expect(rule).toBeDefined();
    expect(rule!.declarations).toContain('red');
  });

  it('should work with predefined state alias', () => {
    const styles = {
      '@autofill': ':-webkit-autofill',
      color: { '': 'black', '@autofill': 'blue' },
    };

    const result = renderStyles(styles, '.input');
    const autofillRule = result.find((r) =>
      r.selector.includes(':-webkit-autofill'),
    );
    expect(autofillRule).toBeDefined();
    expect(autofillRule!.declarations).toContain('blue');
  });

  it('should work with :-moz-placeholder', () => {
    const styles = {
      color: { '': 'black', ':-moz-placeholder': 'gray' },
    };

    const result = renderStyles(styles, '.input');
    const mozRule = result.find((r) =>
      r.selector.includes(':-moz-placeholder'),
    );
    expect(mozRule).toBeDefined();
    expect(mozRule!.declarations).toContain('gray');
  });
});

describe('Sub-element scoped predefined states', () => {
  beforeEach(() => {
    clearPipelineCache();
  });

  it('should resolve @name defined inside a sub-element', () => {
    const styles = {
      Label: {
        '@active': ':focus',
        color: { '': 'black', '@active': 'blue' },
      },
    };

    const result = renderStyles(styles, '.input');
    expect(result.length).toBe(2);
    const activeRule = result.find((r) => r.selector.includes(':focus'));
    expect(activeRule).toBeDefined();
    expect(activeRule!.selector).toContain('[data-element="Label"]');
    expect(activeRule!.declarations).toContain('blue');
  });

  it('should inherit parent-level @name inside sub-elements', () => {
    const styles = {
      '@compact': '@(w < 400px)',
      padding: { '': '16px', '@compact': '8px' },
      Label: {
        color: { '': 'black', '@compact': 'gray' },
      },
    };

    const result = renderStyles(styles, '.card');
    const labelCompact = result.find(
      (r) =>
        r.selector.includes('[data-element="Label"]') &&
        r.atRules?.some((a) => a.includes('container')),
    );
    expect(labelCompact).toBeDefined();
    expect(labelCompact!.declarations).toContain('gray');
  });

  it('should NOT leak sub-element @name to sibling sub-elements', () => {
    const styles = {
      Label: {
        '@active': ':focus',
        color: { '': 'black', '@active': 'blue' },
      },
      Icon: {
        color: { '': 'black', '@active': 'red' },
      },
    };

    const result = renderStyles(styles, '.input');

    // Label should have a :focus rule from its own @active
    const labelFocus = result.find(
      (r) =>
        r.selector.includes('[data-element="Label"]') &&
        r.selector.includes(':focus'),
    );
    expect(labelFocus).toBeDefined();

    // Icon should NOT have a :focus rule — @active is undefined in its scope.
    // Instead, it falls back to a modifier attribute [data-active].
    const iconFocus = result.find(
      (r) =>
        r.selector.includes('[data-element="Icon"]') &&
        r.selector.includes(':focus'),
    );
    expect(iconFocus).toBeUndefined();
  });

  it('should allow sub-element @name to override parent @name', () => {
    const styles = {
      '@custom': ':hover',
      color: { '': 'black', '@custom': 'red' },
      Label: {
        '@custom': ':focus',
        color: { '': 'black', '@custom': 'blue' },
      },
    };

    const result = renderStyles(styles, '.widget');

    // Root-level @custom should resolve to :hover
    const rootHover = result.find(
      (r) =>
        !r.selector.includes('[data-element') && r.selector.includes(':hover'),
    );
    expect(rootHover).toBeDefined();
    expect(rootHover!.declarations).toContain('red');

    // Label-level @custom should resolve to :focus (overridden)
    const labelFocus = result.find(
      (r) =>
        r.selector.includes('[data-element="Label"]') &&
        r.selector.includes(':focus'),
    );
    expect(labelFocus).toBeDefined();
    expect(labelFocus!.declarations).toContain('blue');

    // Label should NOT have a :hover rule from the parent @custom
    const labelHover = result.find(
      (r) =>
        r.selector.includes('[data-element="Label"]') &&
        r.selector.includes(':hover'),
    );
    expect(labelHover).toBeUndefined();
  });

  it('should inherit sub-element @name into deeper nesting via &', () => {
    const styles = {
      Label: {
        '@active': ':focus',
        color: { '': 'black', '@active': 'blue' },
        '&::placeholder': {
          color: { '': 'gray', '@active': 'lightblue' },
        },
      },
    };

    const result = renderStyles(styles, '.input');

    // The ::placeholder nested inside Label should also resolve @active
    const placeholderActive = result.find(
      (r) =>
        r.selector.includes('[data-element="Label"]') &&
        r.selector.includes('::placeholder') &&
        r.selector.includes(':focus'),
    );
    expect(placeholderActive).toBeDefined();
    expect(placeholderActive!.declarations).toContain('lightblue');
  });
});

// ============================================================================
// Enhanced pseudo-classes: :is(), :has(), :not(), :where()
// ============================================================================

describe('Enhanced pseudo-classes (:is, :has, :not, :where)', () => {
  beforeEach(() => {
    clearPipelineCache();
    clearParseCache();
  });

  describe('element-name transformation', () => {
    it('should transform :has(> Icon) capitalized name to [data-element]', () => {
      const result = renderStyles(
        { display: { '': 'block', ':has(> Icon)': 'flex' } },
        '.c',
      );
      const rule = result.find((r) =>
        r.selector.includes(':has(> [data-element="Icon"])'),
      );
      expect(rule).toBeDefined();
      expect(rule!.declarations).toContain('flex');
    });

    it('should transform :is(> Field + input:checked)', () => {
      const result = renderStyles(
        {
          display: {
            '': 'block',
            ':is(> Field + input:checked)': 'grid',
          },
        },
        '.c',
      );
      const rule = result.find((r) =>
        r.selector.includes('> [data-element="Field"] + input:checked'),
      );
      expect(rule).toBeDefined();
    });

    it('should transform :has(Body > Row) with multiple elements', () => {
      const result = renderStyles(
        { display: { '': 'block', ':has(Body > Row)': 'flex' } },
        '.c',
      );
      const rule = result.find((r) =>
        r.selector.includes(
          ':has([data-element="Body"] > [data-element="Row"])',
        ),
      );
      expect(rule).toBeDefined();
    });

    it('should transform :where(Section > Header) and preserve wrapper', () => {
      const result = renderStyles(
        { display: { '': 'block', ':where(Section > Header)': 'flex' } },
        '.c',
      );
      const rule = result.find((r) =>
        r.selector.includes(
          ':where([data-element="Section"] > [data-element="Header"])',
        ),
      );
      expect(rule).toBeDefined();
    });

    it('should leave lowercase HTML tags unchanged in :has()', () => {
      const result = renderStyles(
        { display: { '': 'block', ':has(button)': 'flex' } },
        '.c',
      );
      const rule = result.find((r) => r.selector.includes(':has(button)'));
      expect(rule).toBeDefined();
    });

    it('should leave lowercase HTML tags unchanged in :is()', () => {
      const result = renderStyles(
        { display: { '': 'block', ':is(fieldset > label)': 'flex' } },
        '.c',
      );
      const rule = result.find((r) => r.selector.includes('fieldset > label'));
      expect(rule).toBeDefined();
    });
  });

  describe(':not() normalization', () => {
    it('should normalize :not(Panel) to negated :is()', () => {
      const node = assertPseudoCondition(parseStateKey(':not(Panel)'));
      expect(node.pseudo).toBe(':is([data-element="Panel"])');
      expect(node.negated).toBe(true);
    });

    it('should produce :not([data-element="Panel"]) in CSS output', () => {
      const result = renderStyles(
        { display: { '': 'block', ':not(Panel)': 'flex' } },
        '.c',
      );
      const rule = result.find((r) =>
        r.selector.includes(':not([data-element="Panel"])'),
      );
      expect(rule).toBeDefined();
      expect(rule!.declarations).toContain('flex');
    });

    it('should produce same uniqueId for :not(X) and !:is(X)', () => {
      const fromNot = assertPseudoCondition(parseStateKey(':not(button)'));
      const fromBangIs = assertPseudoCondition(parseStateKey('!:is(button)'));
      expect(fromNot.uniqueId).toBe(fromBangIs.uniqueId);
    });

    it('should resolve double negation !:not(X) to :is(X) → X', () => {
      const node = parseStateKey(':not(:first-child)');
      const doubleNeg = assertPseudoCondition(not(node));
      expect(doubleNeg.negated).toBe(false);
      expect(doubleNeg.pseudo).toBe(':is(:first-child)');

      const css = conditionToCSS(doubleNeg);
      expect(css.variants.length).toBe(1);
      expect(css.variants[0].pseudoConditions[0].pseudo).toBe(
        ':is(:first-child)',
      );
      expect(css.variants[0].pseudoConditions[0].negated).toBe(false);
    });
  });

  describe('negation in CSS output', () => {
    it('should output !:is(button) as :not(button)', () => {
      const result = renderStyles(
        { display: { '': 'block', '!:is(button)': 'flex' } },
        '.c',
      );
      const rule = result.find((r) => r.selector.includes(':not(button)'));
      expect(rule).toBeDefined();
    });

    it('should output !:has(> Icon) as :not(:has(...))', () => {
      const result = renderStyles(
        { display: { '': 'block', '!:has(> Icon)': 'flex' } },
        '.c',
      );
      const rule = result.find((r) =>
        r.selector.includes(':not(:has(> [data-element="Icon"]))'),
      );
      expect(rule).toBeDefined();
    });

    it('should output !:where(Section) as :not(Section)', () => {
      const result = renderStyles(
        { display: { '': 'block', '!:where(Section)': 'flex' } },
        '.c',
      );
      const rule = result.find((r) =>
        r.selector.includes(':not([data-element="Section"])'),
      );
      expect(rule).toBeDefined();
    });
  });

  describe(':is()/:where() unwrap safety', () => {
    it('should unwrap :is(:first-child) → :first-child (pseudo-class)', () => {
      expect(pseudoToCSS({ pseudo: ':is(:first-child)', negated: false })).toBe(
        ':first-child',
      );
    });

    it('should unwrap :is(.active) → .active (class selector)', () => {
      expect(pseudoToCSS({ pseudo: ':is(.active)', negated: false })).toBe(
        '.active',
      );
    });

    it('should unwrap :is([disabled]) → [disabled] (attribute)', () => {
      expect(pseudoToCSS({ pseudo: ':is([disabled])', negated: false })).toBe(
        '[disabled]',
      );
    });

    it('should NOT unwrap :is(a) — tag name breaks compound selectors', () => {
      expect(pseudoToCSS({ pseudo: ':is(a)', negated: false })).toBe(':is(a)');
    });

    it('should NOT unwrap :is(button) — tag name', () => {
      expect(pseudoToCSS({ pseudo: ':is(button)', negated: false })).toBe(
        ':is(button)',
      );
    });

    it('should NOT unwrap :is(> div) — combinator', () => {
      expect(pseudoToCSS({ pseudo: ':is(> div)', negated: false })).toBe(
        ':is(> div)',
      );
    });

    it('should NOT unwrap multi-arg :is(a, b)', () => {
      expect(pseudoToCSS({ pseudo: ':is(a, b)', negated: false })).toBe(
        ':is(a, b)',
      );
    });

    it('should unwrap :where(:hover) → :hover', () => {
      expect(pseudoToCSS({ pseudo: ':where(:hover)', negated: false })).toBe(
        ':hover',
      );
    });

    it('should NOT unwrap :where(div)', () => {
      expect(pseudoToCSS({ pseudo: ':where(div)', negated: false })).toBe(
        ':where(div)',
      );
    });

    it('should NOT unwrap :is() with combinators (whitespace)', () => {
      expect(
        pseudoToCSS({
          pseudo: ':is([data-element="A"] > [data-element="B"])',
          negated: false,
        }),
      ).toBe(':is([data-element="A"] > [data-element="B"])');
    });

    it('should NOT unwrap :where() with combinators (whitespace)', () => {
      expect(
        pseudoToCSS({
          pseudo: ':where([data-element="Section"] > [data-element="Header"])',
          negated: false,
        }),
      ).toBe(':where([data-element="Section"] > [data-element="Header"])');
    });

    it('double negation of :not(:first-child) unwraps in rendered CSS', () => {
      const result = renderStyles(
        { color: { '': 'red', ':not(:first-child)': 'blue' } },
        '.c',
      );
      const defaultRule = result.find(
        (r) => !r.selector.includes(':not') && r.declarations.includes('red'),
      );
      expect(defaultRule).toBeDefined();
      expect(defaultRule!.selector).toContain(':first-child');
      expect(defaultRule!.selector).not.toContain(':is(');
    });

    it('double negation of :not(a) keeps :is(a) wrapper in rendered CSS', () => {
      const result = renderStyles(
        { display: { '': 'block', ':not(a)': 'flex' } },
        '.c',
      );
      const defaultRule = result.find(
        (r) => !r.selector.includes(':not') && r.declarations.includes('block'),
      );
      expect(defaultRule).toBeDefined();
      expect(defaultRule!.selector).toContain(':is(a)');
    });
  });

  describe('trailing combinator auto-completion', () => {
    it('should append * to :has(>) → :has(> *)', () => {
      const node = assertPseudoCondition(parseStateKey(':has(>)'));
      expect(node.pseudo).toBe(':has(> *)');
    });

    it('should append * to :has(Icon >) → :has([data-element="Icon"] > *)', () => {
      const node = assertPseudoCondition(parseStateKey(':has(Icon >)'));
      expect(node.pseudo).toBe(':has([data-element="Icon"] > *)');
    });

    it('should append * to :is(Field +) → :is(... + *)', () => {
      const node = assertPseudoCondition(parseStateKey(':is(Field +)'));
      expect(node.pseudo).toContain('+ *)');
    });

    it('should append * to :has(Body ~) → :has(... ~ *)', () => {
      const node = assertPseudoCondition(parseStateKey(':has(Body ~)'));
      expect(node.pseudo).toContain('~ *)');
    });

    it('should work with :not(>) → negated :is(> *)', () => {
      const node = assertPseudoCondition(parseStateKey(':not(>)'));
      expect(node.pseudo).toBe(':is(> *)');
      expect(node.negated).toBe(true);
    });

    it('should produce valid CSS in rendered output', () => {
      const result = renderStyles(
        { display: { '': 'block', ':has(>)': 'flex' } },
        '.c',
      );
      const rule = result.find((r) => r.selector.includes(':has(> *)'));
      expect(rule).toBeDefined();
      expect(rule!.declarations).toContain('flex');
    });
  });

  describe('nested parentheses', () => {
    it('should handle :has(Input:not(:disabled))', () => {
      const node = assertPseudoCondition(
        parseStateKey(':has(Input:not(:disabled))'),
      );
      expect(node.pseudo).toContain('[data-element="Input"]');
      expect(node.pseudo).toContain(':not(:disabled)');
    });

    it('should handle :is(:not(:first-child):not(:last-child))', () => {
      const node = assertPseudoCondition(
        parseStateKey(':is(:not(:first-child):not(:last-child))'),
      );
      expect(node.pseudo).toContain(':not(:first-child)');
      expect(node.pseudo).toContain(':not(:last-child)');
    });
  });

  describe('boolean logic combinations', () => {
    it('should combine :has(> Icon) & hovered', () => {
      const result = renderStyles(
        {
          display: {
            '': 'block',
            ':has(> Icon) & hovered': 'flex',
          },
        },
        '.c',
      );
      const rule = result.find(
        (r) =>
          r.selector.includes(':has(> [data-element="Icon"])') &&
          r.selector.includes('[data-hovered]'),
      );
      expect(rule).toBeDefined();
    });

    it('should combine @parent(hovered) & :has(> Icon)', () => {
      const result = renderStyles(
        {
          display: {
            '': 'block',
            '@parent(hovered) & :has(> Icon)': 'flex',
          },
        },
        '.c',
      );
      const rule = result.find(
        (r) =>
          r.selector.includes(':is([data-hovered]') &&
          r.selector.includes(':has(> [data-element="Icon"])'),
      );
      expect(rule).toBeDefined();
    });

    it('should combine :has(> Icon) | :has(> Button)', () => {
      const result = renderStyles(
        {
          display: {
            '': 'block',
            ':has(> Icon) | :has(> Button)': 'flex',
          },
        },
        '.c',
      );
      const iconRule = result.find((r) =>
        r.selector.includes(':has(> [data-element="Icon"])'),
      );
      const buttonRule = result.find((r) =>
        r.selector.includes(':has(> [data-element="Button"])'),
      );
      expect(iconRule).toBeDefined();
      expect(buttonRule).toBeDefined();
    });
  });
});

// ============================================================================
// Value mod partial-match operators (^=, $=, *=)
// ============================================================================

describe('Value mod partial-match operators', () => {
  beforeEach(() => {
    clearPipelineCache();
    clearParseCache();
  });

  describe('parseStateKey', () => {
    it('should parse type^=fullscreen as starts-with modifier', () => {
      const node = assertModifierCondition(parseStateKey('type^=fullscreen'));
      expect(node.attribute).toBe('data-type');
      expect(node.value).toBe('fullscreen');
      expect(node.operator).toBe('^=');
    });

    it('should parse type$=screen as ends-with modifier', () => {
      const node = assertModifierCondition(parseStateKey('type$=screen'));
      expect(node.attribute).toBe('data-type');
      expect(node.value).toBe('screen');
      expect(node.operator).toBe('$=');
    });

    it('should parse type*=full as contains modifier', () => {
      const node = assertModifierCondition(parseStateKey('type*=full'));
      expect(node.attribute).toBe('data-type');
      expect(node.value).toBe('full');
      expect(node.operator).toBe('*=');
    });

    it('should parse quoted values with ^= operator', () => {
      const node = assertModifierCondition(parseStateKey('type^="fullscreen"'));
      expect(node.attribute).toBe('data-type');
      expect(node.value).toBe('fullscreen');
      expect(node.operator).toBe('^=');
    });

    it('should parse single-quoted values with $= operator', () => {
      const node = assertModifierCondition(parseStateKey("type$='screen'"));
      expect(node.attribute).toBe('data-type');
      expect(node.value).toBe('screen');
      expect(node.operator).toBe('$=');
    });

    it('should convert camelCase keys with operators', () => {
      const node = assertModifierCondition(
        parseStateKey('dataType^=fullscreen'),
      );
      expect(node.attribute).toBe('data-data-type');
      expect(node.operator).toBe('^=');
    });
  });

  describe('CSS output', () => {
    it('should render ^= operator in attribute selector', () => {
      const result = renderStyles(
        { display: { '': 'block', 'type^=full': 'flex' } },
        '.c',
      );
      const rule = result.find((r) =>
        r.selector.includes('[data-type^="full"]'),
      );
      expect(rule).toBeDefined();
      expect(rule!.declarations).toContain('flex');
    });

    it('should render $= operator in attribute selector', () => {
      const result = renderStyles(
        { display: { '': 'block', 'type$=screen': 'flex' } },
        '.c',
      );
      const rule = result.find((r) =>
        r.selector.includes('[data-type$="screen"]'),
      );
      expect(rule).toBeDefined();
      expect(rule!.declarations).toContain('flex');
    });

    it('should render *= operator in attribute selector', () => {
      const result = renderStyles(
        { display: { '': 'block', 'name*=test': 'flex' } },
        '.c',
      );
      const rule = result.find((r) =>
        r.selector.includes('[data-name*="test"]'),
      );
      expect(rule).toBeDefined();
      expect(rule!.declarations).toContain('flex');
    });

    it('should combine partial-match operator with boolean logic', () => {
      const result = renderStyles(
        { display: { '': 'block', 'type^=full & active': 'flex' } },
        '.c',
      );
      const rule = result.find(
        (r) =>
          r.selector.includes('[data-type^="full"]') &&
          r.selector.includes('[data-active]'),
      );
      expect(rule).toBeDefined();
    });
  });
});

describe('Token CSS deduplication with compound states', () => {
  beforeEach(() => {
    resetConfig();
    clearPipelineCache();
    clearParseCache();
    clearSimplifyCache();
    clearConditionCache();

    configure({
      colorSpace: 'rgb',
      states: {
        '@dark-root':
          'schema=dark | (!schema & @media(prefers-color-scheme: dark))',
        '@high-contrast-root':
          'contrast=more | (!contrast & @media(prefers-contrast: more))',
      },
    });
  });

  afterEach(() => {
    resetConfig();
    clearPipelineCache();
    clearParseCache();
    clearSimplifyCache();
    clearConditionCache();
  });

  it('should not produce duplicate :root rules when dark == dark+HC', () => {
    const tokens = {
      '#shadow-border': {
        '': 'rgb(200 200 200)',
        '@dark-root': 'rgb(11 52 59)',
        '@high-contrast-root': 'rgb(180 180 180)',
        '@dark-root & @high-contrast-root': 'rgb(11 52 59)',
      },
    };

    const result = renderStyles(tokens, ':root') as StyleResult[];

    // Verify no duplicate selector+atRules combinations
    const selectorCounts = new Map<string, number>();
    for (const rule of result) {
      const key = `${rule.atRules?.join('|') ?? ''}||${rule.selector}`;
      selectorCounts.set(key, (selectorCounts.get(key) ?? 0) + 1);
    }

    for (const [key, count] of selectorCounts) {
      expect(count, `Duplicate rule detected for selector: ${key}`).toBe(1);
    }

    // All dark-value rules (containing '11 52 59') should not also
    // contain 'data-contrast', since that dimension is irrelevant
    // when dark and dark+HC have the same value.
    const darkValueRules = result.filter(
      (r) =>
        r.declarations.includes('11 52 59') &&
        !r.declarations.includes('180 180 180') &&
        !r.declarations.includes('200 200 200'),
    );
    for (const rule of darkValueRules) {
      expect(
        rule.selector,
        'Dark-only rule should not reference data-contrast',
      ).not.toContain('data-contrast');
    }
  });

  it('should simplify (A & B) | (A & !B) to A', () => {
    const A = createModifierCondition('data-schema', 'dark');
    const B = createModifierCondition('data-contrast', 'more');
    const notB = not(B);

    // (A & B) | (A & !B) should simplify to A
    const condition = or(and(A, B), and(A, notB));
    const simplified = simplifyCondition(condition);

    expect(simplified.kind).toBe('state');
    if (simplified.kind === 'state') {
      expect(simplified.attribute).toBe('data-schema');
      expect(simplified.value).toBe('dark');
    }
  });

  it('should absorb A | (A & B) where A is simple', () => {
    const A = createModifierCondition('data-schema', 'dark');
    const B = createModifierCondition('data-contrast', 'more');
    const result = simplifyCondition(or(A, and(A, B)));
    expect(result).toEqual(A);
  });

  it('should absorb A | (A & B) where A is compound OR', () => {
    const X = createModifierCondition('data-schema', 'dark');
    const Y = createModifierCondition('data-foo', 'bar');
    const A = or(X, Y); // A = X | Y
    const B = createModifierCondition('data-contrast', 'more');
    const result = simplifyCondition(or(A, and(A, B)));
    // After flattening: or(X, Y, and(or(X,Y), B))
    // A = or(X, Y) should be reconstructed and absorb and(A, B)
    expect(getConditionUniqueId(result)).toBe(getConditionUniqueId(A));
  });

  it('should simplify A | (A & B) via absorption with parsed states', () => {
    const ctx = {
      localPredefinedStates: {},
      globalPredefinedStates: {
        '@dark-root':
          'schema=dark | (!schema & @media(prefers-color-scheme: dark))',
        '@high-contrast-root':
          'contrast=more | (!contrast & @media(prefers-contrast: more))',
      },
    };
    const darkRoot = parseStateKey('@dark-root', { context: ctx });
    const hcRoot = parseStateKey('@high-contrast-root', { context: ctx });

    // Verify the structure before combining
    const andAB = and(darkRoot, hcRoot);

    // Check if `and()` returns the same node or builds an AND compound
    expect(andAB.kind).toBe('compound');
    if (andAB.kind === 'compound') {
      expect(andAB.operator).toBe('AND');
      // The AND should have darkRoot and hcRoot as children
      // Check if A (darkRoot) is still a child by uniqueId
      const childIds = andAB.children.map(getConditionUniqueId);
      const darkId = getConditionUniqueId(darkRoot);
      expect(childIds).toContain(darkId);
    }

    // A | (A & B) should simplify to A
    const combined = or(darkRoot, andAB);
    const simplified = simplifyCondition(combined);

    const simplifiedId = getConditionUniqueId(simplified);
    const darkId = getConditionUniqueId(darkRoot);
    expect(simplifiedId).toBe(darkId);
  });

  it('should simplify compound OR with nested complementary AND terms', () => {
    // Simulates the actual condition produced by:
    //   @dark-root = schema=dark | (!schema & @media(prefers-color-scheme: dark))
    //   @high-contrast-root = contrast=more | (!contrast & @media(prefers-contrast: more))
    //
    // When dark == dark+HC, mergeByValue produces:
    //   (dark_branch0 & hc_branch0) | (dark_branch0 & !hc_branch0_not_hc_branch1)
    // which should simplify back to dark_branch0.
    const darkAttr = createModifierCondition('data-schema', 'dark');
    const hcAttr = createModifierCondition('data-contrast', 'more');
    const notHcAttr = not(hcAttr);

    // (dark & hc) | (dark & !hc) → dark
    const cond = or(and(darkAttr, hcAttr), and(darkAttr, notHcAttr));
    const simplified = simplifyCondition(cond);

    expect(simplified.kind).toBe('state');
    expect(getConditionUniqueId(simplified)).toBe(
      getConditionUniqueId(darkAttr),
    );
  });

  it('should merge dark and dark+HC into a single dark rule when values match', () => {
    const tokens = {
      '#shadow-border': {
        '': 'rgb(200 200 200)',
        '@dark-root': 'rgb(11 52 59)',
        '@high-contrast-root': 'rgb(180 180 180)',
        '@dark-root & @high-contrast-root': 'rgb(11 52 59)',
      },
    };

    const result = renderStyles(tokens, ':root') as StyleResult[];

    const darkRules = result.filter(
      (r) =>
        r.declarations.includes('11 52 59') &&
        !r.declarations.includes('180 180 180') &&
        !r.declarations.includes('200 200 200'),
    );

    for (const rule of darkRules) {
      expect(
        rule.selector,
        'Dark-only rule should not reference data-contrast',
      ).not.toContain('data-contrast');
    }
  });

  it('should factor (A & B) | (A & !B) → A when B is a compound parsed state', () => {
    const ctx = {
      localPredefinedStates: {},
      globalPredefinedStates: {
        '@dark-root':
          'schema=dark | (!schema & @media(prefers-color-scheme: dark))',
        '@high-contrast-root':
          'contrast=more | (!contrast & @media(prefers-contrast: more))',
      },
    };
    const A = parseStateKey('@dark-root', { context: ctx });
    const B = parseStateKey('@high-contrast-root', { context: ctx });

    const condition = or(and(A, B), and(A, not(B)));
    const simplified = simplifyCondition(condition);

    expect(getConditionUniqueId(simplified)).toBe(getConditionUniqueId(A));
  });

  it('should factor (!A & B) | (!A & !B) → !A when both are compound parsed states', () => {
    const ctx = {
      localPredefinedStates: {},
      globalPredefinedStates: {
        '@dark-root':
          'schema=dark | (!schema & @media(prefers-color-scheme: dark))',
        '@high-contrast-root':
          'contrast=more | (!contrast & @media(prefers-contrast: more))',
      },
    };
    const A = parseStateKey('@dark-root', { context: ctx });
    const B = parseStateKey('@high-contrast-root', { context: ctx });
    const notA = not(A);

    const condition = or(and(notA, B), and(notA, not(B)));
    const simplified = simplifyCondition(condition);

    const notASimplified = simplifyCondition(notA);
    expect(getConditionUniqueId(simplified)).toBe(
      getConditionUniqueId(notASimplified),
    );
  });

  it('should merge default and HC entries when values match (same string)', () => {
    const tokens = {
      '#surface': {
        '': 'rgb(255 255 255)',
        '@dark-root': 'rgb(30 30 30)',
        '@high-contrast-root': 'rgb(255 255 255)',
        '@dark-root & @high-contrast-root': 'rgb(10 10 10)',
      },
    };

    const result = renderStyles(tokens, ':root') as StyleResult[];

    // Verify no duplicate selector+atRules combinations
    const selectorCounts = new Map<string, number>();
    for (const rule of result) {
      const key = `${rule.atRules?.join('|') ?? ''}||${rule.selector}`;
      selectorCounts.set(key, (selectorCounts.get(key) ?? 0) + 1);
    }
    for (const [key, count] of selectorCounts) {
      expect(count, `Duplicate rule: ${key}`).toBe(1);
    }

    // Default and HC have the same value but are kept separate during
    // exclusive building. Stage 6 mergeByValue combines them after
    // exclusive conditions are built, so we still get at most 3 groups.
    const declGroups = new Set(result.map((r) => r.declarations));
    expect(declGroups.size).toBeLessThanOrEqual(3);
  });

  it('should produce non-overlapping selectors when handler output matches for default and HC', () => {
    const tokens = {
      '#border': {
        '': 'rgb(200 200 200)',
        '@dark-root': 'rgb(50 50 50)',
        '@high-contrast-root': 'rgb(200 200 200)',
        '@dark-root & @high-contrast-root': 'rgb(50 50 50)',
      },
    };

    const result = renderStyles(tokens, ':root') as StyleResult[];

    // Verify no duplicate selector+atRules combinations
    const selectorKeys = new Map<string, number>();
    for (const rule of result) {
      const key = `${rule.atRules?.join('|') ?? ''}||${rule.selector}`;
      selectorKeys.set(key, (selectorKeys.get(key) ?? 0) + 1);
    }
    for (const [key, count] of selectorKeys) {
      expect(count, `Duplicate rule: ${key}`).toBe(1);
    }

    // Default-value rules should not reference data-contrast
    const defaultRules = result.filter(
      (r) =>
        r.declarations.includes('200 200 200') &&
        !r.declarations.includes('50 50 50'),
    );
    for (const rule of defaultRules) {
      expect(
        rule.selector,
        'Default-value rule should not reference data-contrast',
      ).not.toContain('data-contrast');
    }

    // Dark-value rules should not reference data-contrast
    const darkRules = result.filter(
      (r) =>
        r.declarations.includes('50 50 50') &&
        !r.declarations.includes('200 200 200'),
    );
    for (const rule of darkRules) {
      expect(
        rule.selector,
        'Dark-value rule should not reference data-contrast',
      ).not.toContain('data-contrast');
    }
  });

  it('should not produce overlapping selectors with identical declarations', () => {
    const tokens = {
      '#shadow-border': {
        '': 'rgb(200 200 200)',
        '@dark-root': 'rgb(11 52 59)',
        '@high-contrast-root': 'rgb(180 180 180)',
        '@dark-root & @high-contrast-root': 'rgb(11 52 59)',
      },
    };

    const result = renderStyles(tokens, ':root') as StyleResult[];

    // Group by declarations (ignoring selector) to find rules that set the
    // same CSS properties. Rules in the same group should not have selectors
    // that can both match simultaneously (they should be exclusive).
    const byDecl = new Map<string, StyleResult[]>();
    for (const rule of result) {
      const key = `${rule.atRules?.join('|') ?? ''}||${rule.declarations}`;
      const group = byDecl.get(key);
      if (group) group.push(rule);
      else byDecl.set(key, [rule]);
    }

    // For each group, selectors must be distinct
    for (const [, group] of byDecl) {
      const selectors = group.map((r) => r.selector);
      const uniqueSelectors = new Set(selectors);
      expect(
        uniqueSelectors.size,
        `Duplicate selectors for same declarations: ${selectors.join(', ')}`,
      ).toBe(selectors.length);
    }
  });

  it('should produce non-overlapping selectors for compound state tokens', () => {
    clearPipelineCache();

    const tokens = {
      '#accent-text': {
        '': 'okhsl(340 45% 51.12%)',
        '@dark-root': 'okhsl(340 45% 58.72%)',
        '@high-contrast-root': 'okhsl(340 45% 39.07%)',
        '@dark-root & @high-contrast-root': 'okhsl(340 45% 63.33%)',
      },
    };

    const result = renderStyles(tokens, ':root') as StyleResult[];

    // Every rule should have an @media wrapper — bare selector-only rules
    // overlap with @media-wrapped rules of the same value.
    for (const rule of result) {
      expect(
        rule.atRules && rule.atRules.length > 0,
        `Rule should have @media context: ${rule.selector}`,
      ).toBe(true);
    }

    // No two rules with the same value should share the same @media context
    const byValue = new Map<string, StyleResult[]>();
    for (const rule of result) {
      const val =
        rule.declarations.match(/okhsl\([^)]+\)/)?.[0] ?? rule.declarations;
      if (!byValue.has(val)) byValue.set(val, []);
      byValue.get(val)!.push(rule);
    }

    for (const [, rules] of byValue) {
      const mediaKeys = rules.map((r) =>
        r.atRules ? r.atRules.sort().join(' && ') : '(none)',
      );
      const uniqueMedia = new Set(mediaKeys);
      expect(uniqueMedia.size, `Same-value rules share @media context`).toBe(
        mediaKeys.length,
      );
    }
  });

  it('should not overlap when default and HC values match but dark differs', () => {
    clearPipelineCache();

    const tokens = {
      '#surface': {
        '': 'rgb(255 255 255)',
        '@dark-root': 'rgb(37 34 31)',
        '@high-contrast-root': 'rgb(255 255 255)',
        '@dark-root & @high-contrast-root': 'rgb(40 40 40)',
      },
    };

    const result = renderStyles(tokens, ':root') as StyleResult[];

    // Group rules by @media context
    const byMedia = new Map<string, StyleResult[]>();
    for (const rule of result) {
      const key = rule.atRules ? rule.atRules.sort().join(' && ') : '(none)';
      if (!byMedia.has(key)) byMedia.set(key, []);
      byMedia.get(key)!.push(rule);
    }

    // Within each @media group, no selector should be a superset of another.
    // A dark-specific selector like :root[data-schema="dark"]:not(...)
    // must not coexist with a bare :root:not(...) under the same @media.
    for (const [media, rules] of byMedia) {
      for (let i = 0; i < rules.length; i++) {
        for (let j = i + 1; j < rules.length; j++) {
          const a = rules[i].selector;
          const b = rules[j].selector;

          // Simple superset check: if one selector string is contained
          // in the other (after stripping the common :root prefix),
          // they likely overlap.
          const aParts = a.replace(/:root/g, '').trim();
          const bParts = b.replace(/:root/g, '').trim();

          if (aParts && bParts && (a.includes(b) || b.includes(a))) {
            // Same declarations = harmless duplicate, different = conflict
            if (rules[i].declarations !== rules[j].declarations) {
              expect.unreachable(
                `Overlapping selectors with different values under ${media}:\n` +
                  `  "${a}" vs "${b}"`,
              );
            }
          }
        }
      }
    }
  });
});

describe('Consensus/resolution simplification', () => {
  const emptyCtx = {
    localPredefinedStates: {},
    globalPredefinedStates: {},
  };

  it('should simplify (A|B) & (A|!B) → A', () => {
    clearPipelineCache();

    const a = parseStateKey(':hover', { context: emptyCtx });
    const b = parseStateKey(':focus', { context: emptyCtx });

    const condition = and(or(a, b), or(a, not(b)));
    const simplified = simplifyCondition(condition);

    expect(getConditionUniqueId(simplified)).toBe(getConditionUniqueId(a));
  });

  it('should simplify (!A|!B) & (!B|A) → !B', () => {
    clearPipelineCache();

    const a = parseStateKey(':hover', { context: emptyCtx });
    const b = parseStateKey(':focus', { context: emptyCtx });

    const condition = and(or(not(a), not(b)), or(not(b), a));
    const simplified = simplifyCondition(condition);

    expect(getConditionUniqueId(simplified)).toBe(getConditionUniqueId(not(b)));
  });

  it('should resolve De Morgan ORs from compound negation', () => {
    clearPipelineCache();

    const sup = parseStateKey('@supports($, :has(*))', {
      context: emptyCtx,
    });
    const has = parseStateKey(':has(> Icon)', { context: emptyCtx });

    // !(supports & has) & !(supports & !has) should simplify to !supports
    const condition = and(not(and(sup, has)), not(and(sup, not(has))));
    const simplified = simplifyCondition(condition);

    expect(getConditionUniqueId(simplified)).toBe(
      getConditionUniqueId(not(sup)),
    );
  });
});

describe('Boolean algebra laws (explicit)', () => {
  it('identity: A & TRUE → A', () => {
    const a = createModifierCondition('data-hovered');
    const result = simplifyCondition(and(a, trueCondition()));
    expect(getConditionUniqueId(result)).toBe(getConditionUniqueId(a));
  });

  it('identity: A | FALSE → A', () => {
    const a = createModifierCondition('data-hovered');
    const result = simplifyCondition(or(a, falseCondition()));
    expect(getConditionUniqueId(result)).toBe(getConditionUniqueId(a));
  });

  it('annihilator: A & FALSE → FALSE', () => {
    const a = createModifierCondition('data-hovered');
    const result = simplifyCondition(and(a, falseCondition()));
    expect(result.kind).toBe('false');
  });

  it('annihilator: A | TRUE → TRUE', () => {
    const a = createModifierCondition('data-hovered');
    const result = simplifyCondition(or(a, trueCondition()));
    expect(result.kind).toBe('true');
  });

  it('consensus with 4 variables: (A|B) & (A|!B) & (C|D) → A & (C|D)', () => {
    const a = createModifierCondition('data-hovered');
    const b = createModifierCondition('data-focused');
    const c = createModifierCondition('data-pressed');
    const d = createModifierCondition('data-disabled');

    const condition = and(or(a, b), or(a, not(b)), or(c, d));
    const simplified = simplifyCondition(condition);
    const expected = simplifyCondition(and(a, or(c, d)));

    expect(getConditionUniqueId(simplified)).toBe(
      getConditionUniqueId(expected),
    );
  });
});

describe('Container style query rendering', () => {
  beforeEach(() => {
    clearPipelineCache();
  });

  // `#name` color tokens are rewritten to `var(--name-color)` by the color
  // handler, so substring assertions look for the resolved CSS variable.

  it('should render @(card, style(--theme: dark)) as @container card style()', () => {
    const styles = {
      color: {
        '': '#light',
        '@(card, style(--theme: dark))': '#dark',
      },
    };

    const result = renderStyles(styles, '.component');

    const darkRule = result.find((r) =>
      r.atRules?.some((ar) => ar.includes('style(--theme: dark)')),
    );
    expect(darkRule).toBeDefined();
    expect(darkRule!.atRules![0]).toContain('@container card');
    expect(darkRule!.declarations).toContain('var(--dark-color)');
  });

  it('should render unnamed @(style(--variant: primary)) as @container style()', () => {
    const styles = {
      color: {
        '': '#gray',
        '@(style(--variant: primary))': '#blue',
      },
    };

    const result = renderStyles(styles, '.component');

    const primary = result.find((r) =>
      r.atRules?.some((ar) => ar.includes('style(--variant: primary)')),
    );
    expect(primary).toBeDefined();
    expect(primary!.atRules![0]).toMatch(/^@container style\(/);
    expect(primary!.declarations).toContain('var(--blue-color)');
  });

  it('should combine a style query with a dimension query on the same container', () => {
    const styles = {
      color: {
        '': '#gray',
        '@(card, style(--theme: dark)) & @(card, w < 400px)': '#dark',
      },
    };

    const result = renderStyles(styles, '.component');

    // Both the style query and the dimension query should appear as part of
    // a single @container card at-rule (one rule, two conditions ANDed).
    const dark = result.find((r) =>
      r.declarations.includes('var(--dark-color)'),
    );
    expect(dark).toBeDefined();
    const containerRule = dark!.atRules!.find((ar) =>
      ar.startsWith('@container card'),
    );
    expect(containerRule).toBeDefined();
    expect(containerRule!).toContain('style(--theme: dark)');
    expect(containerRule!).toContain('width < 400px');
  });

  it('should combine a style query with a modifier into nested selector under @container', () => {
    const styles = {
      color: {
        '': '#gray',
        '@(card, style(--theme: dark)) & hovered': '#highlight',
      },
    };

    const result = renderStyles(styles, '.component');

    const hl = result.find((r) =>
      r.declarations.includes('var(--highlight-color)'),
    );
    expect(hl).toBeDefined();
    expect(hl!.atRules!.some((ar) => ar.includes('style(--theme: dark)'))).toBe(
      true,
    );
    expect(hl!.selector).toContain('[data-hovered]');
  });
});

describe('expandExclusiveOrs: mixed at-rule types', () => {
  beforeEach(() => {
    clearPipelineCache();
  });

  it('handles De Morgan of @supports & @container as at-rule-aware branches', () => {
    // Higher priority: @supports(grid) & @(card, w < 400px).
    // Default's exclusive becomes !(@supports & @container) = !@supports | !@container.
    // Both branches involve at-rules; Stage 3 must keep each under its
    // correct at-rule wrapping (not as a bare base rule).
    const styles = {
      display: {
        '': 'block',
        '@supports(display: grid) & @(card, w < 400px)': 'grid',
      },
    };

    const result = renderStyles(styles, '.component');

    // The `grid` rule is wrapped in BOTH @supports and @container.
    const grid = result.find((r) => r.declarations.includes('display: grid'));
    expect(grid).toBeDefined();
    expect(grid!.atRules!.some((ar) => ar.startsWith('@supports'))).toBe(true);
    expect(grid!.atRules!.some((ar) => ar.startsWith('@container'))).toBe(true);

    // The `block` default fans out into branches. None of the emitted
    // `block` rules should escape without an at-rule wrapping — every
    // default rule must be scoped by at least one at-rule negation.
    const blockRules = result.filter((r) =>
      r.declarations.includes('display: block'),
    );
    expect(blockRules.length).toBeGreaterThan(0);
    for (const r of blockRules) {
      const atRules = r.atRules ?? [];
      const hasAtRuleWrap = atRules.some(
        (ar) =>
          ar.includes('not (display: grid)') ||
          ar.includes('not selector(') ||
          ar.includes('(not style') ||
          ar.includes('not (width <') ||
          ar.includes('width >=') ||
          ar.includes('width <'),
      );
      expect(hasAtRuleWrap).toBe(true);
    }
  });

  it('sorts @supports before modifier so modifier branch inherits at-rule context', () => {
    const styles = {
      display: {
        '': 'block',
        '@supports(display: grid) & hovered': 'grid',
      },
    };

    const result = renderStyles(styles, '.component');

    const grid = result.find((r) => r.declarations.includes('display: grid'));
    expect(grid).toBeDefined();
    expect(grid!.atRules!.some((ar) => ar.startsWith('@supports'))).toBe(true);
    expect(grid!.selector).toContain('[data-hovered]');

    const blockRules = result.filter((r) =>
      r.declarations.includes('display: block'),
    );
    expect(blockRules.length).toBeGreaterThan(0);
    for (const r of blockRules) {
      const atRules = r.atRules ?? [];
      const hasAtRuleOrNot =
        atRules.some((ar) => ar.includes('@supports')) ||
        r.selector.includes(':not(');
      expect(
        hasAtRuleOrNot,
        `block rule must have at-rule wrap or :not() selector: ${JSON.stringify({ selector: r.selector, atRules })}`,
      ).toBe(true);
    }
  });

  it('sorts @media before modifier so modifier branch inherits at-rule context', () => {
    const styles = {
      color: {
        '': 'red',
        '@media(w < 600px) & pressed': 'blue',
      },
    };

    const result = renderStyles(styles, '.component');

    const blue = result.find((r) => r.declarations.includes('blue'));
    expect(blue).toBeDefined();
    expect(blue!.atRules!.some((ar) => ar.includes('width'))).toBe(true);
    expect(blue!.selector).toContain('[data-pressed]');

    const redRules = result.filter((r) => r.declarations.includes('red'));
    expect(redRules.length).toBeGreaterThan(0);
    for (const r of redRules) {
      const atRules = r.atRules ?? [];
      const hasAtRuleOrNot =
        atRules.some((ar) => ar.includes('width')) ||
        r.selector.includes(':not(');
      expect(
        hasAtRuleOrNot,
        `red rule must have at-rule wrap or :not() selector: ${JSON.stringify({ selector: r.selector, atRules })}`,
      ).toBe(true);
    }
  });

  it('handles reversed source order: modifier & @supports — sort still puts at-rule first', () => {
    const styles = {
      color: {
        '': 'red',
        'focused & @supports(display: grid)': 'blue',
      },
    };

    const result = renderStyles(styles, '.component');

    const blue = result.find((r) => r.declarations.includes('blue'));
    expect(blue).toBeDefined();
    expect(blue!.atRules!.some((ar) => ar.startsWith('@supports'))).toBe(true);
    expect(blue!.selector).toContain('[data-focused]');

    const redRules = result.filter((r) => r.declarations.includes('red'));
    expect(redRules.length).toBeGreaterThan(0);
    for (const r of redRules) {
      const atRules = r.atRules ?? [];
      const hasAtRuleOrNot =
        atRules.some((ar) => ar.includes('@supports')) ||
        r.selector.includes(':not(');
      expect(
        hasAtRuleOrNot,
        `red rule must have at-rule wrap or :not() selector: ${JSON.stringify({ selector: r.selector, atRules })}`,
      ).toBe(true);
    }
  });

  it('handles two at-rules (@media & @container): both branches keep at-rule context', () => {
    const styles = {
      color: {
        '': 'red',
        '@media(w < 600px) & @(card, w < 400px)': 'blue',
      },
    };

    const result = renderStyles(styles, '.component');

    const blue = result.find((r) => r.declarations.includes('blue'));
    expect(blue).toBeDefined();
    expect(blue!.atRules!.some((ar) => ar.includes('width'))).toBe(true);
    expect(blue!.atRules!.some((ar) => ar.startsWith('@container'))).toBe(true);

    const redRules = result.filter((r) => r.declarations.includes('red'));
    expect(redRules.length).toBeGreaterThan(0);
    for (const r of redRules) {
      const atRules = r.atRules ?? [];
      expect(
        atRules.length,
        `red rule must have at-rule wrapping: ${JSON.stringify({ selector: r.selector, atRules })}`,
      ).toBeGreaterThan(0);
    }
  });

  it('handles modifier & modifier: no at-rules, sort is no-op, uses :not() selectors', () => {
    const styles = {
      color: {
        '': 'red',
        'hovered & pressed': 'blue',
      },
    };

    const result = renderStyles(styles, '.component');

    const blue = result.find((r) => r.declarations.includes('blue'));
    expect(blue).toBeDefined();
    expect(blue!.selector).toContain('[data-hovered]');
    expect(blue!.selector).toContain('[data-pressed]');

    const redRules = result.filter((r) => r.declarations.includes('red'));
    expect(redRules.length).toBeGreaterThan(0);
    for (const r of redRules) {
      expect(r.atRules ?? []).toEqual([]);
      expect(
        r.selector.includes(':not('),
        `modifier-only default must use :not() selector: ${r.selector}`,
      ).toBe(true);
    }
  });

  it('handles three-way compound: @supports & @media & modifier — at-rules sort first', () => {
    const styles = {
      color: {
        '': 'red',
        '@supports(display: grid) & @media(w < 600px) & focused': 'blue',
      },
    };

    const result = renderStyles(styles, '.component');

    const blue = result.find((r) => r.declarations.includes('blue'));
    expect(blue).toBeDefined();
    expect(blue!.atRules!.some((ar) => ar.startsWith('@supports'))).toBe(true);
    expect(blue!.atRules!.some((ar) => ar.includes('width'))).toBe(true);
    expect(blue!.selector).toContain('[data-focused]');

    const redRules = result.filter((r) => r.declarations.includes('red'));
    expect(redRules.length).toBeGreaterThan(0);
    for (const r of redRules) {
      const atRules = r.atRules ?? [];
      const hasAtRuleOrNot =
        atRules.some(
          (ar) => ar.includes('@supports') || ar.includes('width'),
        ) || r.selector.includes(':not(');
      expect(
        hasAtRuleOrNot,
        `red rule must have at-rule wrap or :not() selector: ${JSON.stringify({ selector: r.selector, atRules })}`,
      ).toBe(true);
    }

    // The focused-negation branch must carry both at-rule contexts
    const focusedNegBranch = redRules.find(
      (r) =>
        r.selector.includes(':not([data-focused])') ||
        r.selector.includes(':not('),
    );
    if (focusedNegBranch && (focusedNegBranch.atRules ?? []).length > 0) {
      expect(
        focusedNegBranch.atRules!.some((ar) => ar.startsWith('@supports')),
      ).toBe(true);
      expect(focusedNegBranch.atRules!.some((ar) => ar.includes('width'))).toBe(
        true,
      );
    }
  });
});

describe('Edge cases: empty and impossible styles', () => {
  beforeEach(() => {
    clearPipelineCache();
  });

  it('should return no rules for an empty styles object', () => {
    const result = renderStyles({}, '.component');
    expect(result).toEqual([]);
  });

  it('eliminates @root(attr=A) & @root(attr=B) on the same attribute', () => {
    // Two separate @root() wrappers both refer to the single :root element,
    // so two different values on the same attribute can never both match.
    // hasNestedModifierConflict catches this across sibling wrappers.
    const styles = {
      color: {
        '': '#gray',
        '@root(schema=dark) & @root(schema=light)': '#red',
      },
    };

    const result = renderStyles(styles, '.component');
    expect(
      result.find((r) => r.declarations.includes('var(--red-color)')),
    ).toBeUndefined();
  });

  it('eliminates @root(...) when the inner condition is impossible', () => {
    // A single @root() wrapping a same-attribute conflict is also caught:
    // simplifyInner descends into the wrapper, the inner contradicts to
    // FALSE, and the wrapper collapses with it.
    const styles = {
      color: {
        '': '#gray',
        '@root(schema=dark & schema=light)': '#red',
      },
    };

    const result = renderStyles(styles, '.component');
    expect(
      result.find((r) => r.declarations.includes('var(--red-color)')),
    ).toBeUndefined();
  });

  it('eliminates @own(attr=A) & @own(attr=B) on the same attribute', () => {
    // Same logic as @root but for the single own/sub-element scope.
    const styles = {
      Label: {
        color: {
          '': '#gray',
          '@own(schema=dark) & @own(schema=light)': '#red',
        },
      },
    };

    const result = renderStyles(styles as any, '.component');
    expect(
      result.find((r) => r.declarations.includes('var(--red-color)')),
    ).toBeUndefined();
  });

  it('does NOT eliminate @parent(attr=A) & @parent(attr=B)', () => {
    // Different ancestors can hold different attribute values, so two
    // @parent(...) calls with conflicting values can both match (against
    // different ancestors). The rule is still emitted.
    const styles = {
      color: {
        '': '#gray',
        '@parent(schema=dark) & @parent(schema=light)': '#red',
      },
    };

    const result = renderStyles(styles, '.component');
    expect(
      result.find((r) => r.declarations.includes('var(--red-color)')),
    ).toBeDefined();
  });
});
