const _ids = new Set<string>();

export function injectCSS(id: string, css: string): void {
  if (_ids.has(id) || typeof document === 'undefined') return;
  _ids.add(id);
  let el = document.head.querySelector(
    'style[data-tasty-static]',
  ) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.setAttribute('data-tasty-static', '');
    document.head.appendChild(el);
  }
  el.appendChild(document.createTextNode(css + '\n'));
}
