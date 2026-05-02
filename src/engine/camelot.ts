// Camelot wheel adjacency. A key is "compatible" with itself, ±1 number on
// the same letter (with 12↔1 wraparound), and the parallel relative (same
// number, opposite letter). Ported from prototypes/data.jsx::camelotAdjacent.

export const CAMELOT_KEYS: readonly string[] = [
  "1A","2A","3A","4A","5A","6A","7A","8A","9A","10A","11A","12A",
  "1B","2B","3B","4B","5B","6B","7B","8B","9B","10B","11B","12B",
];

const KEY_RE = /^([0-9]{1,2})([AB])$/;

/** Returns the four keys considered adjacent (or equal) to `key` on the
 *  Camelot wheel: itself, ±1 number same letter (wrapping 12↔1), and the
 *  parallel relative. Returns [] for null/invalid input. */
export function camelotAdjacent(key: string | null | undefined): string[] {
  if (!key) return [];
  const m = key.match(KEY_RE);
  if (!m) return [];
  const num = parseInt(m[1], 10);
  if (num < 1 || num > 12) return [];
  const letter = m[2];
  const other = letter === "A" ? "B" : "A";
  const wrap = (n: number) => ((n - 1 + 12) % 12) + 1;
  return [
    `${num}${letter}`,
    `${wrap(num + 1)}${letter}`,
    `${wrap(num - 1)}${letter}`,
    `${num}${other}`,
  ];
}

/** True if the two keys are equal or adjacent on the Camelot wheel. */
export function camelotIsAdjacent(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return camelotAdjacent(a).includes(b);
}
