/**
 * PropertyTypeResolver
 *
 * Automatically infers CSS @property types from custom property values.
 * Supports deferred resolution for var() reference chains of arbitrary depth.
 */

import { isDevEnv } from '../utils/is-dev-env';

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
    const parts = declarations.split(/;+/);

    for (const part of parts) {
      if (!part.trim()) continue;

      const match = CUSTOM_PROP_DECL.exec(part);
      if (!match) continue;

      const propName = match[1];
      const value = match[2].trim();

      if (isPropertyDefined(propName)) continue;

      // Single var() reference → record dependency for deferred resolution
      const varMatch = SINGLE_VAR_REF.exec(value);
      if (varMatch) {
        const depName = varMatch[1];
        this.addDependency(propName, depName);
        continue;
      }

      // Skip complex expressions (calc, multiple var, etc.)
      if (this.isComplexValue(value)) continue;

      const inferred = inferSyntaxFromValue(value, propName);
      if (!inferred) continue;

      if (!this.validateTokenType(propName, inferred.syntax)) continue;

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
    // Avoid self-references
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
    // Guard against circular references
    if (!resolving) resolving = new Set();
    if (resolving.has(propName)) return;
    resolving.add(propName);

    if (!isPropertyDefined(propName)) {
      registerProperty(propName, syntax, initialValue);
    }

    // Propagate to dependents
    const dependents = this.reverseDeps.get(propName);
    if (dependents) {
      this.reverseDeps.delete(propName);

      for (const dependent of dependents) {
        this.pendingDeps.delete(dependent);

        if (isPropertyDefined(dependent)) continue;
        if (!this.validateTokenType(dependent, syntax)) continue;

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

  /**
   * Validate that the inferred type matches the token naming convention.
   * Returns false (and warns) on mismatch.
   */
  private validateTokenType(propName: string, syntax: string): boolean {
    const isColorProp = propName.endsWith('-color');

    if (isColorProp && syntax !== '<color>') {
      if (isDevEnv()) {
        const tokenName = propName.replace(/^--/, '#').replace(/-color$/, '');
        console.warn(
          `[Tasty] Color token ${tokenName} has a non-color value. ` +
            `Skipping @property auto-registration.`,
        );
      }
      return false;
    }

    if (!isColorProp && syntax === '<color>') {
      if (isDevEnv()) {
        const tokenName = '$' + propName.replace(/^--/, '');
        console.warn(
          `[Tasty] Token ${tokenName} has a color value but uses $ prefix instead of #. ` +
            `Use the # prefix for color properties. ` +
            `Skipping @property auto-registration.`,
        );
      }
      return false;
    }

    return true;
  }

  private isComplexValue(value: string): boolean {
    if (value.includes('calc(')) return true;
    // Multiple var() references
    const varCount = (value.match(/var\(/g) || []).length;
    if (varCount > 1) return true;
    // var() with additional content around it (e.g. "var(--x) + 1")
    if (varCount === 1 && !SINGLE_VAR_REF.test(value)) return true;
    return false;
  }
}
