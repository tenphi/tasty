export function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (s) => `-${s.toLowerCase()}`);
}
