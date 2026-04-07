/**
 * @vitest-environment jsdom
 */
import { useGlobalStyles } from './useGlobalStyles';

describe('useGlobalStyles', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
      /* noop */
    });
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  it('should warn and not inject when selector is empty string', () => {
    const result = useGlobalStyles('', {
      padding: '2x',
    });

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('selector is required and cannot be empty'),
    );

    expect(result).toBeUndefined();
  });

  it('should not warn when selector is valid', () => {
    useGlobalStyles('.my-class', {
      padding: '2x',
    });

    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('should handle undefined styles without warning', () => {
    useGlobalStyles('.my-class', undefined);

    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('should handle empty styles object', () => {
    useGlobalStyles('.my-class', {});

    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });
});
