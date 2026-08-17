/**
 * The boards you have finished, kept in this browser.
 *
 * A board code already describes the whole hand — deal, auction and every card
 * — so the history stores that string and nothing else that cannot be derived
 * from it, plus the two numbers you would have written on a scoresheet: what you
 * played in and what it scored. The code doubles as the entry's identity, which
 * is what keeps reopening a board from adding it a second time.
 *
 * Everything here treats storage as optional. Browsers refuse `localStorage` in
 * private windows and when cookies are blocked, and a game that cannot remember
 * its boards is still a perfectly good game, so failures are swallowed rather
 * than surfaced.
 */

const STORAGE_KEY = "bridge.history.v1";

/** Boards kept. Old ones fall off the end rather than growing without bound. */
const LIMIT = 25;

export interface HistoryEntry {
  /** The board code, as carried by a share link. Also the entry's identity. */
  code: string;
  boardNumber: number;
  /** What you played in, e.g. `4♠ by South`, or `Passed out`. */
  contract: string;
  /** Your side's score, positive when the board went your way. */
  score: number;
  /** When the board finished, in epoch milliseconds. */
  playedAt: number;
}

function storage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function isEntry(value: unknown): value is HistoryEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.code === "string" &&
    entry.code.length > 0 &&
    typeof entry.boardNumber === "number" &&
    typeof entry.contract === "string" &&
    typeof entry.score === "number" &&
    typeof entry.playedAt === "number"
  );
}

/** Boards you have played, most recent first. */
export function loadHistory(): HistoryEntry[] {
  const store = storage();
  if (!store) return [];

  let parsed: unknown;
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return [];
    parsed = JSON.parse(raw);
  } catch {
    // Anything that will not parse is something other than our history, so
    // there is nothing to recover and nothing to report.
    return [];
  }

  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isEntry).slice(0, LIMIT);
}

function write(entries: HistoryEntry[]): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // A full or read-only quota is not worth interrupting the review over.
  }
}

/**
 * Files a finished board and returns the history as it now stands.
 *
 * A board already in the history is left exactly where it was: reopening an old
 * board to look at it again is not playing it again.
 */
export function saveBoard(entry: HistoryEntry): HistoryEntry[] {
  const existing = loadHistory();
  if (existing.some((other) => other.code === entry.code)) return existing;

  const entries = [entry, ...existing].slice(0, LIMIT);
  write(entries);
  return entries;
}

export function clearHistory(): HistoryEntry[] {
  const store = storage();
  try {
    store?.removeItem(STORAGE_KEY);
  } catch {
    // As above: nothing useful to do about a storage that will not cooperate.
  }
  return [];
}
