export function isValidTomanPrice(value) {
  return typeof value === 'string' && /^\d+$/.test(value);
}
