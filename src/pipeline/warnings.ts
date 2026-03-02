/**
 * Structured warning system for the pipeline.
 *
 * Provides typed warning codes and a configurable handler so consumers
 * can programmatically intercept, suppress, or reroute warnings.
 */

export type TastyWarningCode =
  | 'INVALID_SELECTOR_AFFIX'
  | 'XOR_CHAIN_TOO_LONG';

export interface TastyWarning {
  code: TastyWarningCode;
  message: string;
}

export type TastyWarningHandler = (warning: TastyWarning) => void;

const defaultWarningHandler: TastyWarningHandler = (warning) => {
  console.warn(`[Tasty] ${warning.message}`);
};

let warningHandler: TastyWarningHandler = defaultWarningHandler;

/**
 * Set a custom warning handler for pipeline warnings.
 * Returns a function that restores the previous handler.
 */
export function setWarningHandler(
  handler: TastyWarningHandler,
): () => void {
  const previous = warningHandler;
  warningHandler = handler;
  return () => {
    warningHandler = previous;
  };
}

/**
 * Emit a structured pipeline warning via the configured handler.
 */
export function emitWarning(
  code: TastyWarningCode,
  message: string,
): void {
  warningHandler({ code, message });
}
