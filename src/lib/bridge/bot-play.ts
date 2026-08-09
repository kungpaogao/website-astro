/**
 * The card playing robot.
 *
 * The robot is handed only what it is entitled to see — its own cards, dummy
 * once it is faced, the cards already played, and the auction. It invents
 * complete deals consistent with that knowledge, solves each one double dummy,
 * and plays the card that wins the most tricks on average. This is the same idea
 * that makes the well known bridge robots play well, and it means the robot can
 * be genuinely fooled by a false card rather than seeing through your hand.
 */

import type { Dds } from "bridge-dds";
import type { Contract } from "./auction";
import {
  cardRank,
  cardSuit,
  FULL_DECK,
  SEATS,
  type Card,
  type Seat,
  type Suit,
} from "./cards";
import type { RandomSource } from "./deal";
import { solvePosition } from "./dds-solver";
import { sampleDeals, type SeatConstraint } from "./sampler";
import {
  dummySeat,
  isDummyVisible,
  knownVoids,
  legalPlays,
  playedCards,
  seatToPlay,
  type PlayState,
} from "./play";
import { inferFromAuction } from "./bidding";
import type { Auction } from "./auction";

/**
 * Everything the robot at `seat` is allowed to know. Building this on the main
 * thread and shipping it to the worker is what stops the robot from cheating:
 * the hidden hands are simply not in the message.
 */
export interface PlayRequest {
  seat: Seat;
  contract: Contract;
  /** Cards the robot can see, by seat. Hidden seats are empty. */
  visible: Card[][];
  /** Unplayed cards the robot cannot see. */
  pool: Card[];
  /** Cards remaining in each seat's hand. */
  handSizes: number[];
  voids: Suit[][];
  hcp: { min: number; max: number }[];
  minLengths: number[][];
  leader: Seat;
  currentTrick: Card[];
  legal: Card[];
  samples: number;
}

function sampleCount(poolSize: number): number {
  if (poolSize === 0) return 1;
  if (poolSize > 26) return 10;
  if (poolSize > 13) return 16;
  return 24;
}

/**
 * Assembles the robot's view of the table. `state` and `auction` are the full
 * game state; only the permitted parts are copied into the request.
 */
export function buildPlayRequest(
  state: PlayState,
  auction: Auction,
  seat: Seat = seatToPlay(state),
): PlayRequest {
  const dummy = dummySeat(state.contract);
  const declarer = state.contract.declarer;

  // A robot sees its own cards; declarer also plays dummy, and everyone sees
  // dummy once the opening lead has been made.
  const seesDummy = isDummyVisible(state) || seat === declarer;
  const visibleSeats = new Set<Seat>([seat]);
  if (seesDummy) visibleSeats.add(dummy);
  if (seat === dummy) visibleSeats.add(declarer);

  const visible = SEATS.map((candidate) =>
    visibleSeats.has(candidate) ? [...state.hands[candidate]] : [],
  );

  const seen = new Set<Card>([...playedCards(state), ...visible.flat()]);
  const pool = FULL_DECK.filter((card) => !seen.has(card));
  const voids = knownVoids(state);

  const hcp = SEATS.map((candidate) => {
    const picture = inferFromAuction(auction, candidate);
    return { min: picture.range.min, max: picture.range.max };
  });
  const minLengths = SEATS.map(
    (candidate) => inferFromAuction(auction, candidate).lengths,
  );

  return {
    seat,
    contract: state.contract,
    visible,
    pool,
    handSizes: SEATS.map((candidate) => state.hands[candidate].length),
    voids,
    hcp,
    minLengths,
    leader: state.current.leader,
    currentTrick: [...state.current.cards],
    legal: legalPlays(state, seat),
    samples: sampleCount(pool.length),
  };
}

/**
 * Chooses between cards the solver rates equally: lead the top of a sequence,
 * otherwise play the cheapest card that does the job.
 */
function pickAmongEqual(candidates: Card[], leading: boolean): Card {
  const cheapest = candidates.reduce((best, card) =>
    cardRank(card) < cardRank(best) ? card : best,
  );
  if (!leading) return cheapest;

  const suit = cardSuit(cheapest);
  const sameSuit = candidates
    .filter((card) => cardSuit(card) === suit)
    .sort((a, b) => cardRank(a) - cardRank(b));

  let top = cheapest;
  for (const card of sameSuit) {
    if (cardRank(card) === cardRank(top) + 1) top = card;
  }
  return top;
}

export interface PlayChoice {
  card: Card;
  /** Average double dummy tricks for the robot's side, across the samples. */
  expectedTricks: number;
  /** How many deals the robot actually managed to construct. */
  samples: number;
}

/** Runs the robot. Always returns one of the legal cards. */
export function chooseCard(
  dds: Dds,
  request: PlayRequest,
  random: RandomSource = Math.random,
): PlayChoice {
  const legal = request.legal;
  if (legal.length === 0) throw new Error("No legal plays");
  if (legal.length === 1)
    return { card: legal[0], expectedTricks: 0, samples: 0 };

  const unseen = SEATS.filter(
    (seat) => request.visible[seat].length === 0 && request.handSizes[seat] > 0,
  );

  const constraints: Record<number, SeatConstraint> = {};
  for (const seat of unseen) {
    constraints[seat] = {
      count: request.handSizes[seat],
      voids: request.voids[seat],
      minHcp: request.hcp[seat].min,
      maxHcp: request.hcp[seat].max,
      minLengths: request.minLengths[seat],
    };
  }

  const deals = sampleDeals(
    { known: request.visible, unseen, pool: request.pool, constraints },
    Math.max(1, request.samples),
    random,
  );

  const totals = new Map<Card, number>();
  let solved = 0;

  for (const hands of deals) {
    let scores;
    try {
      scores = solvePosition(dds, {
        hands,
        strain: request.contract.strain,
        leader: request.leader,
        currentTrick: request.currentTrick,
      });
    } catch {
      continue;
    }
    solved += 1;
    for (const { card, tricks } of scores) {
      if (!legal.includes(card)) continue;
      totals.set(card, (totals.get(card) ?? 0) + tricks);
    }
  }

  if (solved === 0 || totals.size === 0) {
    // The solver was unusable for this position; fall back to a legal card.
    return {
      card: pickAmongEqual([...legal], request.currentTrick.length === 0),
      expectedTricks: 0,
      samples: 0,
    };
  }

  const best = Math.max(...totals.values());
  const tied = [...totals.entries()]
    .filter(([, total]) => total === best)
    .map(([card]) => card);

  return {
    card: pickAmongEqual(tied, request.currentTrick.length === 0),
    expectedTricks: best / solved,
    samples: solved,
  };
}
