export function color(name: string, opacity = 1) {
  if (opacity !== 1) {
    return `rgb(var(--${name}-color-rgb) / ${opacity})`;
  }

  return `var(--${name}-color)`;
}
