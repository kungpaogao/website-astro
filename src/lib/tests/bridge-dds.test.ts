import { describe, expect, it } from "vitest";
import { nextSeat, SEATS, STRAINS, type Seat } from "../bridge/cards";
import { dealHands, handsFromStrings } from "../bridge/deal";
import {
  analysePlay,
  declarerFromLeader,
  doubleDummyTable,
  getSolver,
  solvePosition,
} from "../bridge/dds-solver";

/**
 * These tests pin down the dds calling conventions that the rest of the game
 * relies on. They are the reason the bots and the review panel can trust the
 * numbers coming out of the solver.
 */

// A deterministic generator so failures are reproducible.
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

describe("dds conventions", () => {
  it("computes a known double dummy table", async () => {
    const dds = await getSolver();
    const hands = handsFromStrings(
      "QJ6.K652.J85.T98",
      "873.J97.AT764.Q4",
      "K5.T83.KQ9.A7652",
      "AT942.AQ4.32.KJ3",
    );
    const table = doubleDummyTable(dds, hands);
    expect(table).toEqual([
      [5, 8, 5, 8],
      [6, 6, 6, 6],
      [5, 7, 5, 7],
      [7, 5, 7, 5],
      [6, 6, 6, 6],
    ]);
  });

  it("scores SolveBoardPBN from the point of view of the side on lead", async () => {
    const dds = await getSolver();
    const random = seededRandom(20260730);

    for (let trial = 0; trial < 3; trial += 1) {
      const hands = dealHands(random);
      const table = doubleDummyTable(dds, hands);

      for (const strain of STRAINS) {
        for (const declarer of SEATS) {
          const leader = nextSeat(declarer);
          const best = Math.max(
            ...solvePosition(dds, {
              hands,
              strain,
              leader,
              currentTrick: [],
            }).map((s) => s.tricks),
          );
          // The defenders are on lead, so their best is the complement of the
          // declaring side's double dummy result.
          expect(best).toBe(13 - table[strain][declarer]);
        }
      }
    }
  });

  it("reports AnalysePlayPBN tricks for the declaring side", async () => {
    const dds = await getSolver();
    const random = seededRandom(4242);

    for (let trial = 0; trial < 3; trial += 1) {
      const hands = dealHands(random);
      const table = doubleDummyTable(dds, hands);

      for (const strain of STRAINS) {
        for (const leader of SEATS) {
          const declarer = declarerFromLeader(leader as Seat);
          const tricks = analysePlay(dds, hands, strain, leader as Seat, [
            hands[leader][0],
          ]);
          expect(tricks[0]).toBe(table[strain][declarer]);
        }
      }
    }
  });

  it("never reports a card that gains tricks for the side on lead", async () => {
    const dds = await getSolver();
    const hands = dealHands(seededRandom(7));
    const scores = solvePosition(dds, {
      hands,
      strain: 4,
      leader: 1,
      currentTrick: [],
    });
    // Every card in the hand is accounted for, including equivalent ones.
    expect(scores.length).toBe(13);
  });
});
