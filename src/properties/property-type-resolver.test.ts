import { PropertyTypeResolver } from './property-type-resolver';

describe('PropertyTypeResolver', () => {
  let resolver: PropertyTypeResolver;
  let registered: Map<string, { syntax: string; initialValue: string }>;

  const isPropertyDefined = (name: string) => registered.has(name);
  const registerProperty = (
    name: string,
    syntax: string,
    initialValue: string,
  ) => {
    registered.set(name, { syntax, initialValue });
  };

  beforeEach(() => {
    resolver = new PropertyTypeResolver();
    registered = new Map();
  });

  describe('concrete value resolution', () => {
    it('should register a number property', () => {
      resolver.scanDeclarations(
        '--scale: 1',
        isPropertyDefined,
        registerProperty,
      );
      expect(registered.get('--scale')).toEqual({
        syntax: '<number>',
        initialValue: '0',
      });
    });

    it('should register a length property', () => {
      resolver.scanDeclarations(
        '--gap: 10px',
        isPropertyDefined,
        registerProperty,
      );
      expect(registered.get('--gap')).toEqual({
        syntax: '<length>',
        initialValue: '0px',
      });
    });

    it('should register an angle property', () => {
      resolver.scanDeclarations(
        '--rotation: 45deg',
        isPropertyDefined,
        registerProperty,
      );
      expect(registered.get('--rotation')).toEqual({
        syntax: '<angle>',
        initialValue: '0deg',
      });
    });

    it('should register a time property', () => {
      resolver.scanDeclarations(
        '--delay: 300ms',
        isPropertyDefined,
        registerProperty,
      );
      expect(registered.get('--delay')).toEqual({
        syntax: '<time>',
        initialValue: '0s',
      });
    });

    it('should register a percentage property', () => {
      resolver.scanDeclarations(
        '--progress: 50%',
        isPropertyDefined,
        registerProperty,
      );
      expect(registered.get('--progress')).toEqual({
        syntax: '<percentage>',
        initialValue: '0%',
      });
    });

    it('should register a color property', () => {
      resolver.scanDeclarations(
        '--bg-color: transparent',
        isPropertyDefined,
        registerProperty,
      );
      expect(registered.get('--bg-color')).toEqual({
        syntax: '<color>',
        initialValue: 'transparent',
      });
    });

    it('should handle multiple declarations', () => {
      resolver.scanDeclarations(
        '--scale: 1; --gap: 10px; --rotation: 45deg',
        isPropertyDefined,
        registerProperty,
      );
      expect(registered.size).toBe(3);
    });
  });

  describe('var() deferred resolution', () => {
    it('should resolve when dependency is later resolved', () => {
      // First, encounter var() reference
      resolver.scanDeclarations(
        '--a: var(--b)',
        isPropertyDefined,
        registerProperty,
      );
      expect(registered.has('--a')).toBe(false);

      // Then resolve the dependency
      resolver.scanDeclarations(
        '--b: 10px',
        isPropertyDefined,
        registerProperty,
      );
      expect(registered.get('--b')).toEqual({
        syntax: '<length>',
        initialValue: '0px',
      });
      expect(registered.get('--a')).toEqual({
        syntax: '<length>',
        initialValue: '0px',
      });
    });

    it('should handle chains longer than two', () => {
      resolver.scanDeclarations(
        '--a: var(--b)',
        isPropertyDefined,
        registerProperty,
      );
      resolver.scanDeclarations(
        '--b: var(--c)',
        isPropertyDefined,
        registerProperty,
      );
      expect(registered.size).toBe(0);

      resolver.scanDeclarations('--c: 1', isPropertyDefined, registerProperty);
      expect(registered.get('--c')).toEqual({
        syntax: '<number>',
        initialValue: '0',
      });
      expect(registered.get('--b')).toEqual({
        syntax: '<number>',
        initialValue: '0',
      });
      expect(registered.get('--a')).toEqual({
        syntax: '<number>',
        initialValue: '0',
      });
    });

    it('should not infinite loop on circular refs', () => {
      resolver.scanDeclarations(
        '--a: var(--b)',
        isPropertyDefined,
        registerProperty,
      );
      resolver.scanDeclarations(
        '--b: var(--a)',
        isPropertyDefined,
        registerProperty,
      );
      // Neither should be registered, no error thrown
      expect(registered.size).toBe(0);
    });
  });

  describe('skip already-defined properties', () => {
    it('should skip when property is already registered', () => {
      registered.set('--scale', { syntax: '<number>', initialValue: '0' });

      resolver.scanDeclarations(
        '--scale: 10px',
        isPropertyDefined,
        registerProperty,
      );
      // Should not have changed
      expect(registered.get('--scale')).toEqual({
        syntax: '<number>',
        initialValue: '0',
      });
    });
  });

  describe('type mismatch validation', () => {
    it('should skip for color token with non-color value', () => {
      resolver.scanDeclarations(
        '--scale-color: 10px',
        isPropertyDefined,
        registerProperty,
      );
      expect(registered.has('--scale-color')).toBe(false);
    });

    it('should warn for color token with non-color value in dev mode', () => {
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      resolver.scanDeclarations(
        '--scale-color: 10px',
        isPropertyDefined,
        registerProperty,
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Color token'),
      );

      warnSpy.mockRestore();
      process.env.NODE_ENV = origEnv;
    });

    it('should skip for regular token with color value', () => {
      resolver.scanDeclarations(
        '--bg: rgb(255 0 0)',
        isPropertyDefined,
        registerProperty,
      );
      expect(registered.has('--bg')).toBe(false);
    });

    it('should warn for regular token with color value in dev mode', () => {
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      resolver.scanDeclarations(
        '--bg: rgb(255 0 0)',
        isPropertyDefined,
        registerProperty,
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('uses $ prefix instead of #'),
      );

      warnSpy.mockRestore();
      process.env.NODE_ENV = origEnv;
    });
  });

  describe('complex values are skipped', () => {
    it('should skip calc expressions', () => {
      resolver.scanDeclarations(
        '--gap: calc(1px + 2px)',
        isPropertyDefined,
        registerProperty,
      );
      expect(registered.size).toBe(0);
    });

    it('should skip multiple var references', () => {
      resolver.scanDeclarations(
        '--gap: var(--a) var(--b)',
        isPropertyDefined,
        registerProperty,
      );
      expect(registered.size).toBe(0);
    });

    it('should skip non-custom properties', () => {
      resolver.scanDeclarations(
        'color: red; font-size: 16px',
        isPropertyDefined,
        registerProperty,
      );
      expect(registered.size).toBe(0);
    });

    it('should skip keyword values', () => {
      resolver.scanDeclarations(
        '--display: auto',
        isPropertyDefined,
        registerProperty,
      );
      expect(registered.size).toBe(0);
    });
  });
});
