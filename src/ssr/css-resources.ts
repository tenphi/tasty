/**
 * Find CSS resource references that cannot safely move to a shared stylesheet.
 *
 * This is intentionally a small scanner rather than a CSS parser. It handles
 * comments, strings, escaped identifiers, url(), string-valued image/src
 * functions, and string @import rules without interpreting unrelated CSS.
 */

function skipCSSString(css: string, start: number, quote: string): number {
  for (let index = start + 1; index < css.length; index++) {
    if (css[index] === '\\') {
      index++;
    } else if (css[index] === quote) {
      return index + 1;
    }
  }
  return css.length;
}

function decodeCSSEscapes(value: string): string {
  return value.replace(
    /\\(?:([\da-f]{1,6})\s?|\r\n|[\n\r\f]|(.))/gi,
    (_match, hex: string | undefined, escaped: string | undefined) => {
      if (hex) {
        const codePoint = Number.parseInt(hex, 16);
        return codePoint === 0 || codePoint > 0x10ffff
          ? '\ufffd'
          : String.fromCodePoint(codePoint);
      }
      return escaped ?? '';
    },
  );
}

function readCSSIdentifier(
  css: string,
  start: number,
): { name: string; end: number } | null {
  let name = '';
  let index = start;

  while (index < css.length) {
    const char = css[index];
    if (/[-_a-z\d]/i.test(char) || char.charCodeAt(0) >= 0x80) {
      name += char;
      index++;
      continue;
    }
    if (char !== '\\' || index + 1 >= css.length) break;

    const hex = css.slice(index + 1).match(/^[\da-f]{1,6}/i)?.[0];
    if (hex) {
      name += decodeCSSEscapes(`\\${hex}`);
      index += hex.length + 1;
      if (/\s/.test(css[index] ?? '')) index++;
      continue;
    }

    if (/\r|\n|\f/.test(css[index + 1])) break;
    name += css[index + 1];
    index += 2;
  }

  return index === start ? null : { name, end: index };
}

function skipCSSWhitespaceAndComments(css: string, start: number): number {
  let index = start;
  for (;;) {
    while (/\s/.test(css[index] ?? '')) index++;
    if (css[index] !== '/' || css[index + 1] !== '*') return index;
    const commentEnd = css.indexOf('*/', index + 2);
    if (commentEnd === -1) return css.length;
    index = commentEnd + 2;
  }
}

export interface UnsafeCSSResource {
  url: string;
  rootRelative: boolean;
}

function classifyCSSResource(
  rawURL: string,
  rejectRootRelative: boolean,
): UnsafeCSSResource | null {
  const url = decodeCSSEscapes(rawURL).trim();
  if (!url || url.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(url)) {
    return null;
  }
  if (url.startsWith('/')) {
    return rejectRootRelative ? { url: rawURL, rootRelative: true } : null;
  }
  return { url: rawURL, rootRelative: false };
}

export function findUnsafeCSSResource(
  css: string,
  rejectRootRelative: boolean,
): UnsafeCSSResource | null {
  const functionStack: (string | null)[] = [];
  const stringResourceFunctions = new Set([
    'image',
    'image-set',
    '-webkit-image-set',
    'src',
  ]);

  for (let index = 0; index < css.length; index++) {
    if (css[index] === '/' && css[index + 1] === '*') {
      const commentEnd = css.indexOf('*/', index + 2);
      index = commentEnd === -1 ? css.length : commentEnd + 1;
      continue;
    }

    const quote = css[index];
    if (quote === '"' || quote === "'") {
      const stringEnd = skipCSSString(css, index, quote);
      if (stringResourceFunctions.has(functionStack.at(-1) ?? '')) {
        const unsafe = classifyCSSResource(
          css.slice(index + 1, stringEnd - 1),
          rejectRootRelative,
        );
        if (unsafe) return unsafe;
      }
      index = stringEnd - 1;
      continue;
    }

    if (css[index] === ')') {
      functionStack.pop();
      continue;
    }

    if (css[index] === '(') {
      functionStack.push(null);
      continue;
    }

    if (css[index] === '@') {
      const atRule = readCSSIdentifier(css, index + 1);
      if (atRule?.name.toLowerCase() === 'import') {
        const valueStart = skipCSSWhitespaceAndComments(css, atRule.end);
        const importQuote = css[valueStart];
        if (importQuote === '"' || importQuote === "'") {
          const valueEnd = skipCSSString(css, valueStart, importQuote);
          const unsafe = classifyCSSResource(
            css.slice(valueStart + 1, valueEnd - 1),
            rejectRootRelative,
          );
          if (unsafe) return unsafe;
        }
      }
      continue;
    }

    const identifier = readCSSIdentifier(css, index);
    if (!identifier || css[identifier.end] !== '(') continue;

    const functionName = identifier.name.toLowerCase();
    if (functionName !== 'url') {
      functionStack.push(functionName);
      index = identifier.end;
      continue;
    }

    const valueStart = skipCSSWhitespaceAndComments(css, identifier.end + 1);
    const urlQuote = css[valueStart];
    const quoted = urlQuote === '"' || urlQuote === "'";
    let valueEnd: number;
    if (quoted) {
      valueEnd = skipCSSString(css, valueStart, urlQuote) - 1;
      index = css.indexOf(')', valueEnd + 1);
    } else {
      valueEnd = valueStart;
      while (valueEnd < css.length && css[valueEnd] !== ')') {
        if (css[valueEnd] === '\\') valueEnd++;
        valueEnd++;
      }
      index = valueEnd;
    }

    if (index === -1) return null;
    const unsafe = classifyCSSResource(
      css.slice(valueStart + (quoted ? 1 : 0), valueEnd),
      rejectRootRelative,
    );
    if (unsafe) return unsafe;
  }

  return null;
}
