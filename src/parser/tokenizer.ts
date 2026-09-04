type TokenCallback = (
  token: string,
  isComma: boolean,
  isSlash: boolean,
) => void;

const isWhitespace = (ch: string | undefined): boolean =>
  ch === ' ' || ch === '\n' || ch === '\t' || ch === '\r' || ch === '\f';

export function scan(src: string, cb: TokenCallback) {
  let depth = 0;
  let inQuote: string | 0 = 0;
  let start = 0;
  let i = 0;
  // Track if we just saw a standalone slash separator (whitespace before, whitespace after)
  let pendingSlash = false;

  const flush = (isComma: boolean, isSlash: boolean) => {
    // If we have a pending slash, emit the part break
    const actualSlash = isSlash || pendingSlash;
    pendingSlash = false;

    if (start < i) {
      cb(src.slice(start, i), isComma, actualSlash);
    } else if (isComma) {
      cb('', true, false); // empty token followed by comma => group break.
    } else if (actualSlash) {
      cb('', false, true); // empty token followed by slash => part break.
    }
    start = i + 1;
  };

  for (; i < src.length; i++) {
    const ch = src[i];

    // quote mode
    if (inQuote) {
      if (ch === inQuote && src[i - 1] !== '\\') inQuote = 0;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inQuote = ch;
      continue;
    }

    // Parenthesis tracking keeps separators inside any function together.
    if (ch === '(') {
      depth++;
      continue;
    }
    if (ch === ')') {
      if (depth) depth--;
      continue;
    }

    if (!depth) {
      if (ch === ',') {
        flush(true, false);
        continue;
      }
      // Slash is only a separator when surrounded by whitespace (e.g., "a / b")
      // This preserves CSS patterns like "center/cover" as single tokens
      if (ch === '/') {
        const prevIsWhitespace = isWhitespace(src[i - 1]);
        const nextIsWhitespace = isWhitespace(src[i + 1]);
        if (prevIsWhitespace && nextIsWhitespace) {
          // Already flushed by whitespace before, mark pending slash
          pendingSlash = true;
          start = i + 1; // skip the slash character
          continue;
        }
        // Not surrounded by whitespace - treat as part of token
        continue;
      }
      if (isWhitespace(ch)) {
        flush(false, false);
        continue;
      }
    }
  }
  flush(false, false); // tail
}
