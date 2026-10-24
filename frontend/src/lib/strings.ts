/** Display the empty string as epsilon. */
export const fmt = (s: string): string => (s === '' ? 'ε' : s);

/** All strings over `alphabet` of length 0..maxLen in shortlex order. */
export function allStrings(alphabet: string[], maxLen: number): string[] {
  let layer: string[] = [''];
  let out: string[] = [''];
  for (let i = 0; i < maxLen; i++) {
    layer = layer.flatMap((w) => alphabet.map((a) => w + a));
    out = out.concat(layer);
  }
  return out;
}

/** Returns a human-readable error, or null if `text` is a valid input for the alphabet. */
export function validateInput(text: string, alphabet: string[], maxLen = 64): string | null {
  const bad = Array.from(new Set(Array.from(text).filter((c) => !alphabet.includes(c))));
  if (bad.length > 0) {
    return `${bad.map((c) => `'${c}'`).join(', ')} ${bad.length > 1 ? 'are' : 'is'} not in the alphabet {${alphabet.join(', ')}}.`;
  }
  if (text.length > maxLen) return `Input is too long (maximum ${maxLen} symbols).`;
  return null;
}

export const SOURCE_LABELS: Record<string, string> = {
  manual: 'Manual', lstar: 'L* query', 'lstar-test': 'L* test', validation: 'Validation', counterexample: 'Counterexample',
};

export const fmtDate = (iso: string): string => new Date(iso).toLocaleString();
