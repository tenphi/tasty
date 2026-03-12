/**
 * PropertyTypeResolver
 *
 * Automatically infers CSS @property types from custom property values.
 * Supports deferred resolution for var() reference chains of arbitrary depth.
 */

import { inferSyntaxFromValue } from './index';

const CUSTOM_PROP_DECL = /^\s*(--[a-z0-9_-]+)\s*:\s*(.+?)\s*$/i;
const SINGLE_VAR_REF = /^var\((--[a-z0-9_-]+)\)$/i;

export class PropertyTypeResolver {
  /** propName → the prop it depends on */
  private pendingDeps = new Map<string, string>();
  /** propName → list of props waiting on it */
  private reverseDeps = new Map<string, string[]>();

  /**
   * Scan CSS declarations and auto-register @property for custom properties
   * whose types can be inferred from their values.
   */
  scanDeclarations(
    declarations: string,
    isPropertyDefined: (name: string) => boolean,
    registerProperty: (
      name: string,
      syntax: string,
      initialValue: string,
    ) => void,
  ): void {
    if (!declarations.includes('--')) return;

    const parts = declarations.split(/;+/);

    for (const part of parts) {
      if (!part.trim()) continue;

      const match = CUSTOM_PROP_DECL.exec(part);
      if (!match) continue;

      const propName = match[1];
      const value = match[2].trim();

      if (isPropertyDefined(propName)) continue;

      // Name-based: --*-color properties are always <color> (from #name tokens)
      if (propName.endsWith('-color')) {
        registerProperty(propName, '<color>', 'transparent');
        continue;
      }

      // Name-based: --*-line-height accepts numbers, lengths, and percentages
      if (propName.endsWith('-line-height')) {
        registerProperty(propName, '<number> | <length-percentage>', '0');
        continue;
      }

      // Single var() reference → record dependency for deferred resolution
      const varMatch = SINGLE_VAR_REF.exec(value);
      if (varMatch) {
        const depName = varMatch[1];
        this.addDependency(propName, depName);
        continue;
      }

      // Skip complex expressions (calc, multiple var, etc.)
      if (this.isComplexValue(value)) continue;

      const inferred = inferSyntaxFromValue(value);
      if (!inferred) continue;

      this.resolve(
        propName,
        inferred.syntax,
        inferred.initialValue,
        isPropertyDefined,
        registerProperty,
      );
    }
  }

  private addDependency(propName: string, depName: string): void {
    if (propName === depName) return;

    this.pendingDeps.set(propName, depName);

    let dependents = this.reverseDeps.get(depName);
    if (!dependents) {
      dependents = [];
      this.reverseDeps.set(depName, dependents);
    }
    if (!dependents.includes(propName)) {
      dependents.push(propName);
    }
  }

  private resolve(
    propName: string,
    syntax: string,
    initialValue: string,
    isPropertyDefined: (name: string) => boolean,
    registerProperty: (
      name: string,
      syntax: string,
      initialValue: string,
    ) => void,
    resolving?: Set<string>,
  ): void {
    if (!resolving) resolving = new Set();
    if (resolving.has(propName)) return;
    resolving.add(propName);

    if (!isPropertyDefined(propName)) {
      registerProperty(propName, syntax, initialValue);
    }

    const dependents = this.reverseDeps.get(propName);
    if (dependents) {
      this.reverseDeps.delete(propName);

      for (const dependent of dependents) {
        this.pendingDeps.delete(dependent);

        if (isPropertyDefined(dependent)) continue;

        this.resolve(
          dependent,
          syntax,
          initialValue,
          isPropertyDefined,
          registerProperty,
          resolving,
        );
      }
    }
  }

  private isComplexValue(value: string): boolean {
    if (value.includes('calc(')) return true;
    const firstVar = value.indexOf('var(');
    if (firstVar === -1) return false;
    if (value.indexOf('var(', firstVar + 4) !== -1) return true;
    return !SINGLE_VAR_REF.test(value);
  }
}
