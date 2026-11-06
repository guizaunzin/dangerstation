const cache = new Map<number, Intl.NumberFormat>();

/** Número no formato pt-BR (vírgula decimal). */
export function num(value: number, digits = 1): string {
  let f = cache.get(digits);
  if (!f) {
    f = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
    cache.set(digits, f);
  }
  const v = Math.abs(value) < 0.5 * 10 ** -digits ? 0 : value;
  return f.format(v);
}

export function signed(value: number, digits = 2): string {
  const s = num(value, digits);
  return value > 0 && s !== num(0, digits) ? `+${s}` : s;
}
