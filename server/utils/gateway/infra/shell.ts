export function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
