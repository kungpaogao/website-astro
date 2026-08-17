import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearHistory,
  loadHistory,
  saveBoard,
  type HistoryEntry,
} from "../bridge/history";

/** Enough of the Storage interface for the history to keep boards in. */
function fakeStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => void values.delete(key),
    setItem: (key: string, value: string) => void values.set(key, value),
  } as Storage;
}

function entry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    code: "AAAA",
    boardNumber: 1,
    contract: "4♠ by South =",
    score: 420,
    playedAt: 1_700_000_000_000,
    ...overrides,
  };
}

function useStorage(storage: Storage | undefined): void {
  vi.stubGlobal("window", storage ? { localStorage: storage } : {});
}

beforeEach(() => useStorage(fakeStorage()));
afterEach(() => vi.unstubAllGlobals());

describe("Bridge history", () => {
  it("starts empty", () => {
    expect(loadHistory()).toEqual([]);
  });

  it("keeps the most recent board first", () => {
    saveBoard(entry({ code: "one", boardNumber: 1 }));
    const after = saveBoard(entry({ code: "two", boardNumber: 2 }));

    expect(after.map((row) => row.code)).toEqual(["two", "one"]);
    expect(loadHistory().map((row) => row.boardNumber)).toEqual([2, 1]);
  });

  it("files a board once, however often it is opened", () => {
    saveBoard(entry({ code: "one" }));
    const after = saveBoard(entry({ code: "one", score: -100 }));

    expect(after).toHaveLength(1);
    expect(after[0].score).toBe(420);
  });

  it("drops the oldest boards past the limit", () => {
    for (let i = 0; i < 30; i += 1) {
      saveBoard(entry({ code: `code-${i}`, boardNumber: i }));
    }

    const rows = loadHistory();
    expect(rows).toHaveLength(25);
    expect(rows[0].code).toBe("code-29");
    expect(rows.at(-1)!.code).toBe("code-5");
  });

  it("clears", () => {
    saveBoard(entry());
    expect(clearHistory()).toEqual([]);
    expect(loadHistory()).toEqual([]);
  });

  it("ignores stored junk rather than throwing", () => {
    const storage = fakeStorage();
    useStorage(storage);
    storage.setItem("bridge.history.v1", "{ not json");
    expect(loadHistory()).toEqual([]);

    storage.setItem(
      "bridge.history.v1",
      JSON.stringify([entry(), { code: "half a row" }, 7]),
    );
    expect(loadHistory().map((row) => row.code)).toEqual(["AAAA"]);
  });

  it("survives a browser that refuses storage", () => {
    vi.stubGlobal("window", {
      get localStorage(): Storage {
        throw new Error("Access denied");
      },
    });

    expect(loadHistory()).toEqual([]);
    expect(clearHistory()).toEqual([]);
    // The board still shows in the review it was played in; it just will not
    // be there after a reload.
    expect(saveBoard(entry()).map((row) => row.code)).toEqual(["AAAA"]);
    expect(loadHistory()).toEqual([]);
  });
});
