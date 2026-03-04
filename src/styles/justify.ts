export function justifyStyle({ justify }: { justify?: string }) {
  if (typeof justify !== 'string') return;

  if (!justify) return;

  return {
    'justify-items': justify,
    'justify-content': justify,
  };
}

justifyStyle.__lookupStyles = ['justify'];
