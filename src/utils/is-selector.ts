/** Check whether a style-object key identifies a nested CSS selector. */
export function isSelector(key: string): boolean {
  const first = key.charCodeAt(0);
  return (
    first === 38 || // &
    first === 46 || // .
    (first >= 65 && first <= 90) // A-Z
  );
}
