/**
 * Thin domain layer over the `bridge-dds` wasm build of the dds double dummy
 * solver.
 *
 * Conventions worth remembering, since the C library is not uniform about them:
 *
 * - `resTable[strain][declarer]` is the number of tricks the declaring side
 *   takes with that declarer, with the opening lead coming from their left.
 * - `SolveBoardPBN` scores are tricks for the side *on lead*.
 * - `AnalysePlayPBN` tricks are for the *declaring* side, i.e. the side that is
 *   not on lead at the start of the trace.
 *
 * `src/lib/tests/bridge-dds.test.ts` pins all three down.
 */

import { Dds, loadDds, type DdsModule } from "bridge-dds";
import {
  cardRank,
  cardSuit,
  cardToPbn,
  makeCard,
  nextSeat,
  Seat,
  Strain,
  type Card,
  type Suit,
} from "./cards";
import { handsToPbn, type Hands, type Vulnerability } from "./deal";

let instance: Dds | undefined;
let pending: Promise<Dds> | undefined;

/** Loads (once) and returns the solver. Safe to call concurrently. */
export function getSolver(): Promise<Dds> {
  if (instance) return Promise.resolve(instance);
  pending ??= loadDds().then((module: DdsModule) => {
    instance = new Dds(module);
    return instance;
  });
  return pending;
}

/** A position handed to the solver: whose lead it is, plus any cards face up. */
export interface Position {
  hands: Hands;
  strain: Strain;
  /** Seat that led the current trick. */
  leader: Seat;
  /** Cards already played to the current trick, in order (zero to three). */
  currentTrick: readonly Card[];
}

function toDealPbn(position: Position) {
  const suits = [0, 0, 0];
  const ranks = [0, 0, 0];
  position.currentTrick.forEach((card, index) => {
    suits[index] = cardSuit(card);
    ranks[index] = cardRank(card);
  });
  return {
    trump: position.strain as number,
    first: position.leader as number,
    currentTrickSuit: suits,
    currentTrickRank: ranks,
    remainCards: handsToPbn(position.hands, Seat.North),
  };
}

export interface CardScore {
  card: Card;
  /** Tricks the side on play takes after this card, played double dummy. */
  tricks: number;
}

/**
 * Ranks every legal card for the player on turn.
 *
 * Scores count tricks for the side on play, so higher is always better for the
 * player choosing.
 */
export function solvePosition(dds: Dds, position: Position): CardScore[] {
  const future = dds.SolveBoardPBN(toDealPbn(position), -1, 3, 0);
  const scores: CardScore[] = [];

  for (let i = 0; i < future.cards; i += 1) {
    const suit = future.suit[i] as Suit;
    const tricks = future.score[i];
    scores.push({ card: makeCard(suit, future.rank[i]), tricks });

    // `equals` is a bitmask of lower ranks that play identically to this card.
    const equals = future.equals[i];
    for (let rank = 2; rank <= 14; rank += 1) {
      if (equals & (1 << rank))
        scores.push({ card: makeCard(suit, rank), tricks });
    }
  }

  return scores;
}

export type DoubleDummyTable = number[][];

/** `table[strain][declarer]` tricks, for all twenty declarer/strain pairs. */
export function doubleDummyTable(dds: Dds, hands: Hands): DoubleDummyTable {
  return dds.CalcDDTablePBN({ cards: handsToPbn(hands, Seat.North) }).resTable;
}

export interface ParResult {
  /** Par score from North/South's point of view. */
  score: number;
  /** Par contracts in dds notation, e.g. `4S-NS` or `3NX-EW`. */
  contracts: string[];
}

export function parContracts(
  dds: Dds,
  table: DoubleDummyTable,
  dealer: Seat,
  vulnerability: Vulnerability,
): ParResult {
  const result = dds.DealerPar(
    { resTable: table },
    dealer as number,
    vulnerability as number,
  );
  return { score: result.score, contracts: result.contracts };
}

/**
 * Double dummy value after every card of `trace`, from the declaring side's
 * point of view. The first entry is the value before the opening lead, so the
 * array is one longer than the trace.
 */
export function analysePlay(
  dds: Dds,
  hands: Hands,
  strain: Strain,
  openingLeader: Seat,
  trace: readonly Card[],
): number[] {
  if (trace.length === 0) return [];
  const solved = dds.AnalysePlayPBN(
    {
      trump: strain as number,
      first: openingLeader as number,
      currentTrickSuit: [0, 0, 0],
      currentTrickRank: [0, 0, 0],
      remainCards: handsToPbn(hands, Seat.North),
    },
    { cards: trace.map(cardToPbn).join("") },
  );
  return solved.tricks;
}

/** Declarer is the opening leader's right hand opponent. */
export function declarerFromLeader(leader: Seat): Seat {
  return nextSeat(leader, 3);
}
