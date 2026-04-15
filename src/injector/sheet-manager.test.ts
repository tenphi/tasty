/**
 * @vitest-environment happy-dom
 */
import { SheetManager } from './sheet-manager';
import type { StyleInjectorConfig, StyleRule } from './types';

function createStyleRule(selector: string, declarations: string): StyleRule {
  return {
    selector,
    declarations,
  };
}

describe('SheetManager', () => {
  let sheetManager: SheetManager;
  let config: StyleInjectorConfig;

  beforeEach(() => {
    config = {
      maxRulesPerSheet: 100,
    };
    sheetManager = new SheetManager(config);

    document.head.querySelectorAll('[data-tasty]').forEach((el) => el.remove());
  });

  afterEach(() => {
    document.head.querySelectorAll('[data-tasty]').forEach((el) => el.remove());
  });

  describe('getRegistry', () => {
    it('should create new registry for new root', () => {
      const registry = sheetManager.getRegistry(document);

      expect(registry).toBeDefined();
      expect(registry.sheets).toEqual([]);
      expect(registry.refCounts).toBeInstanceOf(Map);
      expect(registry.rules).toBeInstanceOf(Map);
      expect(registry.refCounts).toBeInstanceOf(Map);
    });

    it('should return same registry for same root', () => {
      const registry1 = sheetManager.getRegistry(document);
      const registry2 = sheetManager.getRegistry(document);

      expect(registry1).toBe(registry2);
    });

    it('should create different registries for different roots', () => {
      const registry1 = sheetManager.getRegistry(document);

      const shadowRoot = document
        .createElement('div')
        .attachShadow({ mode: 'open' });
      const registry2 = sheetManager.getRegistry(shadowRoot);

      expect(registry1).not.toBe(registry2);
    });
  });

  describe('createSheet', () => {
    it('should create style element sheet', () => {
      const registry = sheetManager.getRegistry(document);
      const sheet = sheetManager.createSheet(registry, document);

      expect(sheet.sheet).toBeInstanceOf(HTMLStyleElement);
      expect(sheet.ruleCount).toBe(0);
      expect(sheet.holes).toEqual([]);
      expect(registry.sheets).toContain(sheet);
    });

    it('should create style element with proper attributes', () => {
      const registry = sheetManager.getRegistry(document);
      const sheet = sheetManager.createSheet(registry, document);

      expect(sheet.sheet).toBeInstanceOf(HTMLStyleElement);

      const styleElement = sheet.sheet;
      expect(styleElement.getAttribute('data-tasty')).toBe('');
      expect(document.head.contains(styleElement)).toBe(true);
    });

    it('should set nonce when provided', () => {
      const configWithNonce = {
        ...config,
        nonce: 'test-nonce',
      };
      const manager = new SheetManager(configWithNonce);

      const registry = manager.getRegistry(document);
      const sheet = manager.createSheet(registry, document);

      const styleElement = sheet.sheet;
      expect(styleElement.nonce).toBe('test-nonce');
    });
  });

  describe('insertRule', () => {
    it('should insert rule into style element', () => {
      const registry = sheetManager.getRegistry(document);
      const rules = [createStyleRule('.test', 'color: red;')];

      const ruleInfo = sheetManager.insertRule(
        registry,
        rules,
        'test',
        document,
      );

      expect(ruleInfo).not.toBeNull();
      expect(ruleInfo!.ruleIndex).toBe(0);
      expect(ruleInfo!.sheetIndex).toBe(0);
      expect(registry.sheets[0].ruleCount).toBe(1);
    });

    it('should insert multiple rules correctly', () => {
      const registry = sheetManager.getRegistry(document);
      const rules = [createStyleRule('.test', 'color: red;')];

      const ruleInfo = sheetManager.insertRule(
        registry,
        rules,
        'test',
        document,
      );

      expect(ruleInfo).not.toBeNull();
      expect(ruleInfo!.ruleIndex).toBe(0);

      const styleElement = registry.sheets[0].sheet;
      expect(styleElement.sheet?.cssRules.length).toBe(1);
    });

    it('should create new sheet when max rules exceeded', () => {
      const configWithLimit = { ...config, maxRulesPerSheet: 2 };
      const manager = new SheetManager(configWithLimit);

      const registry = manager.getRegistry(document);

      manager.insertRule(
        registry,
        [createStyleRule('.rule1', 'color: red;')],
        'rule1',
        document,
      );
      manager.insertRule(
        registry,
        [createStyleRule('.rule2', 'color: blue;')],
        'rule2',
        document,
      );

      expect(registry.sheets.length).toBe(1);

      manager.insertRule(
        registry,
        [createStyleRule('.rule3', 'color: green;')],
        'rule3',
        document,
      );

      expect(registry.sheets.length).toBe(2);
    });

    it('should append rules sequentially', () => {
      const registry = sheetManager.getRegistry(document);

      const rule1 = sheetManager.insertRule(
        registry,
        [createStyleRule('.rule1', 'color: red;')],
        'rule1',
        document,
      );
      const rule2 = sheetManager.insertRule(
        registry,
        [createStyleRule('.rule2', 'color: blue;')],
        'rule2',
        document,
      );
      const rule3 = sheetManager.insertRule(
        registry,
        [createStyleRule('.rule3', 'color: green;')],
        'rule3',
        document,
      );

      expect(rule1!.ruleIndex).toBe(0);
      expect(rule2!.ruleIndex).toBe(1);
      expect(rule3!.ruleIndex).toBe(2);

      sheetManager.deleteRule(registry, rule2!);

      const rule4 = sheetManager.insertRule(
        registry,
        [createStyleRule('.rule4', 'color: yellow;')],
        'rule4',
        document,
      );
      expect(rule4!.ruleIndex).toBe(2);
    });
  });

  describe('deleteRule', () => {
    it('should delete rule and update rule count', () => {
      const registry = sheetManager.getRegistry(document);

      const rule1 = sheetManager.insertRule(
        registry,
        [createStyleRule('.rule1', 'color: red;')],
        'rule1',
        document,
      );
      const _rule2 = sheetManager.insertRule(
        registry,
        [createStyleRule('.rule2', 'color: blue;')],
        'rule2',
        document,
      );

      const sheet = registry.sheets[0];
      expect(sheet.ruleCount).toBe(2);

      sheetManager.deleteRule(registry, rule1!);

      expect(sheet.ruleCount).toBe(1);
    });

    it('should handle deletion of non-existent rule gracefully', () => {
      const registry = sheetManager.getRegistry(document);

      const fakeRule = {
        className: 'fake',
        ruleIndex: 999,
        sheetIndex: 999,
        cssText: ['.fake { color: red; }'],
      };

      expect(() => sheetManager.deleteRule(registry, fakeRule)).not.toThrow();
    });

    it('should correctly adjust indices after non-contiguous deletions', () => {
      const registry = sheetManager.getRegistry(document);

      const rules = [];
      for (let i = 0; i < 8; i++) {
        const rule = sheetManager.insertRule(
          registry,
          [createStyleRule(`.rule${i}`, `order: ${i};`)],
          `rule${i}`,
          document,
        );
        rules.push(rule);
        registry.rules.set(`class${i}`, rule!);
      }

      expect(rules[0]!.indices).toEqual([0]);
      expect(rules[4]!.indices).toEqual([4]);
      expect(rules[7]!.indices).toEqual([7]);

      sheetManager.deleteRule(registry, rules[1]!);
      sheetManager.deleteRule(registry, rules[3]!);
      sheetManager.deleteRule(registry, rules[5]!);

      expect(rules[0]!.indices).toEqual([0]);
      expect(rules[0]!.ruleIndex).toBe(0);

      expect(rules[2]!.indices).toEqual([1]);
      expect(rules[2]!.ruleIndex).toBe(1);

      expect(rules[4]!.indices).toEqual([2]);
      expect(rules[4]!.ruleIndex).toBe(2);

      expect(rules[6]!.indices).toEqual([3]);
      expect(rules[6]!.ruleIndex).toBe(3);

      expect(rules[7]!.indices).toEqual([4]);
      expect(rules[7]!.ruleIndex).toBe(4);

      expect(registry.sheets[0].ruleCount).toBe(5);
    });

    it('should correctly adjust indices for rules with multiple CSS declarations', () => {
      const registry = sheetManager.getRegistry(document);

      const rule1 = sheetManager.insertRule(
        registry,
        [
          createStyleRule('.rule1', 'color: red;'),
          createStyleRule('.rule1:hover', 'color: blue;'),
        ],
        'rule1',
        document,
      );
      registry.rules.set('class1', rule1!);

      const rule2 = sheetManager.insertRule(
        registry,
        [createStyleRule('.rule2', 'color: green;')],
        'rule2',
        document,
      );
      registry.rules.set('class2', rule2!);

      const rule3 = sheetManager.insertRule(
        registry,
        [
          createStyleRule('.rule3', 'color: yellow;'),
          createStyleRule('.rule3:active', 'color: orange;'),
        ],
        'rule3',
        document,
      );
      registry.rules.set('class3', rule3!);

      expect(rule1!.indices).toEqual([0, 1]);
      expect(rule2!.indices).toEqual([2]);
      expect(rule3!.indices).toEqual([3, 4]);

      sheetManager.deleteRule(registry, rule1!);

      expect(rule2!.indices).toEqual([0]);
      expect(rule2!.ruleIndex).toBe(0);
      expect(rule2!.endRuleIndex).toBe(0);

      expect(rule3!.indices).toEqual([1, 2]);
      expect(rule3!.ruleIndex).toBe(1);
      expect(rule3!.endRuleIndex).toBe(2);

      expect(registry.sheets[0].ruleCount).toBe(3);
    });
  });

  describe('findAvailableRuleIndex', () => {
    it('should return next rule count for new rule insertion', () => {
      const registry = sheetManager.getRegistry(document);
      const sheet = sheetManager.createSheet(registry, document);

      sheet.ruleCount = 5;

      const index = sheetManager.findAvailableRuleIndex(sheet);
      expect(index).toBe(5);
    });

    it('should return 0 for empty sheet', () => {
      const registry = sheetManager.getRegistry(document);
      const sheet = sheetManager.createSheet(registry, document);

      expect(sheet.ruleCount).toBe(0);
      const index = sheetManager.findAvailableRuleIndex(sheet);
      expect(index).toBe(0);
    });
  });

  describe('unused tracking and bulk cleanup', () => {
    it('should track unused rules via refCount = 0', () => {
      const registry = sheetManager.getRegistry(document);

      const rules = [createStyleRule('.test', 'color: red;')];
      const ruleInfo = sheetManager.insertRule(
        registry,
        rules,
        'test',
        document,
      );
      const className = 'test-class';

      registry.rules.set(className, ruleInfo!);
      registry.refCounts.set(className, 1);

      registry.refCounts.set(className, 0);

      expect(registry.rules.has(className)).toBe(true);
      expect(registry.refCounts.get(className)).toBe(0);
    });

    it('should reuse unused rules by setting refCount > 0', () => {
      const registry = sheetManager.getRegistry(document);

      const rules = [createStyleRule('.test', 'color: red;')];
      const ruleInfo = sheetManager.insertRule(
        registry,
        rules,
        'test',
        document,
      );
      const className = 'test-class';

      registry.rules.set(className, ruleInfo!);
      registry.refCounts.set(className, 1);

      registry.refCounts.set(className, 0);

      registry.refCounts.set(className, 1);

      expect(registry.refCounts.get(className)).toBe(1);
      expect(registry.rules.has(className)).toBe(true);
    });
  });

  describe('getTotalRuleCount', () => {
    it('should count rules across all sheets minus holes', () => {
      const registry = sheetManager.getRegistry(document);

      const sheet1 = sheetManager.createSheet(registry, document);
      sheet1.ruleCount = 5;
      sheet1.holes = [1, 3];

      const sheet2 = sheetManager.createSheet(registry, document);
      sheet2.ruleCount = 3;
      sheet2.holes = [0];

      const total = sheetManager.getTotalRuleCount(registry);
      expect(total).toBe(5);
    });
  });

  describe('getCssText', () => {
    it('should return CSS text from all sheets', () => {
      const manager = new SheetManager(config);

      const registry = manager.getRegistry(document);

      manager.insertRule(
        registry,
        [createStyleRule('.rule1', 'color: red;')],
        'rule1',
        document,
      );
      manager.insertRule(
        registry,
        [createStyleRule('.rule2', 'color: blue;')],
        'rule2',
        document,
      );

      const cssText = manager.getCssText(registry);

      expect(cssText).toContain('.rule1');
      expect(cssText).toContain('color: red');
      expect(cssText).toContain('.rule2');
      expect(cssText).toContain('color: blue');
    });
  });

  describe('cleanup', () => {
    it('should remove all sheets and clear registry', () => {
      const manager = new SheetManager(config);

      const registry = manager.getRegistry(document);

      manager.insertRule(
        registry,
        [createStyleRule('.test', 'color: red;')],
        'test',
        document,
      );

      expect(document.head.querySelectorAll('[data-tasty]').length).toBe(1);

      manager.cleanup(document);

      expect(document.head.querySelectorAll('[data-tasty]').length).toBe(0);

      const newRegistry = manager.getRegistry(document);
      expect(newRegistry).not.toBe(registry);
    });
  });
});

// ---------------------------------------------------------------------------
// Adopted-mode tests (ShadowRoot with real constructable stylesheets)
// ---------------------------------------------------------------------------
describe('SheetManager (adopted mode)', () => {
  let manager: SheetManager;
  let shadowRoot: ShadowRoot;
  let host: HTMLDivElement;

  beforeEach(() => {
    manager = new SheetManager({ maxRulesPerSheet: 100 });

    host = document.createElement('div');
    document.body.appendChild(host);
    shadowRoot = host.attachShadow({ mode: 'open' });
  });

  afterEach(() => {
    manager.cleanup(shadowRoot);
    host.remove();
  });

  it('auto-selects adopted mode for ShadowRoot', () => {
    const registry = manager.getRegistry(shadowRoot);
    expect(registry.injectionMode).toBe('adopted');
  });

  it('uses style-element mode for Document', () => {
    const registry = manager.getRegistry(document);
    expect(registry.injectionMode).toBe('style-element');
  });

  it('falls back to style-element when forceTextInjection is set', () => {
    const forced = new SheetManager({
      maxRulesPerSheet: 100,
      forceTextInjection: true,
    });
    const registry = forced.getRegistry(shadowRoot);
    expect(registry.injectionMode).toBe('style-element');
  });

  it('createSheet pushes a constructable sheet to adoptedStyleSheets', () => {
    const registry = manager.getRegistry(shadowRoot);
    manager.createSheet(registry, shadowRoot);

    expect(registry.sheets.length).toBe(1);
    expect(registry.sheets[0].constructableSheet).toBeInstanceOf(CSSStyleSheet);
    expect(shadowRoot.adoptedStyleSheets.length).toBe(1);
  });

  it('insertRule inserts via constructable sheet', () => {
    const registry = manager.getRegistry(shadowRoot);

    const ruleInfo = manager.insertRule(
      registry,
      [createStyleRule('.t0', 'color: red;')],
      't0',
      shadowRoot,
    );

    expect(ruleInfo).not.toBeNull();
    expect(ruleInfo!.ruleIndex).toBe(0);

    const sheet = registry.sheets[0].constructableSheet!;
    expect(sheet.cssRules.length).toBe(1);
    expect(sheet.cssRules[0].cssText).toContain('.t0');
  });

  it('deleteRule removes from constructable sheet', () => {
    const registry = manager.getRegistry(shadowRoot);

    const rule = manager.insertRule(
      registry,
      [createStyleRule('.t1', 'color: blue;')],
      't1',
      shadowRoot,
    );

    manager.deleteRule(registry, rule!);
    expect(registry.sheets[0].ruleCount).toBe(0);
  });

  it('getCssText reads from constructable sheets', () => {
    const registry = manager.getRegistry(shadowRoot);

    manager.insertRule(
      registry,
      [createStyleRule('.t2', 'display: flex;')],
      't2',
      shadowRoot,
    );

    const cssText = manager.getCssText(registry);
    expect(cssText).toContain('.t2');
    expect(cssText).toContain('display: flex');
  });

  it('cleanup clears adoptedStyleSheets', () => {
    const registry = manager.getRegistry(shadowRoot);
    manager.createSheet(registry, shadowRoot);

    expect(shadowRoot.adoptedStyleSheets.length).toBe(1);

    manager.cleanup(shadowRoot);

    expect(shadowRoot.adoptedStyleSheets.length).toBe(0);
  });

  it('raw CSS injects into a separate constructable sheet in adopted mode', () => {
    manager.getRegistry(shadowRoot);

    const result = manager.injectRawCSS('body { margin: 0; }', shadowRoot);

    expect(shadowRoot.adoptedStyleSheets.length).toBe(1);
    const rawSheet = shadowRoot.adoptedStyleSheets[0];
    expect(rawSheet.cssRules.length).toBeGreaterThan(0);

    result.dispose();

    expect(rawSheet.cssRules.length).toBe(0);
  });

  it('getRawCSSText returns raw content in adopted mode', () => {
    manager.getRegistry(shadowRoot);
    manager.injectRawCSS('.reset { padding: 0; }', shadowRoot);

    const text = manager.getRawCSSText(shadowRoot);
    expect(text).toContain('.reset { padding: 0; }');
  });

  it('raw CSS sheet precedes main tasty sheets in adoptedStyleSheets', () => {
    const registry = manager.getRegistry(shadowRoot);

    manager.createSheet(registry, shadowRoot);

    manager.injectRawCSS('.raw { color: red; }', shadowRoot);

    expect(shadowRoot.adoptedStyleSheets.length).toBe(2);
    const firstSheet = shadowRoot.adoptedStyleSheets[0];
    expect(firstSheet.cssRules[0]?.cssText).toContain('.raw');
  });
});
