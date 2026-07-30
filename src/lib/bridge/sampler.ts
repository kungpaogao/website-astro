/**
 * Constrained deal sampling.
 *
 * A robot only knows its own cards, dummy, and the cards already played. To
 * choose a card it invents complete deals that are consistent with everything it
 * has seen and heard, solves each one double dummy, and plays the card that does
 * best on average. This module invents the deals.
 */

import {
  cardSuit,
  highCardPoints,
  SEATS,
  sortHand,
  type Card,
  type Seat,
  type Suit,
} from "./cards";
import { shuffled, type Hands, type RandomSource } from "./deal";

export interface SeatConstraint {
  /** How many cards this seat still holds. */
  count: number;
  /** Suits the seat has shown out of. */
  voids: Suit[];
  /** High card point range implied by the auction. */
  minHcp: number;
  maxHcp: number;
  /** Minimum suit lengths implied by the auction, indexed by suit. */
  minLengths: number[];
}

export interface SamplingRequest {
  /** Cards visible to the robot, by seat. Unseen seats hold an empty list. */
  known: readonly (readonly Card[])[];
  /** Seats whose cards must be invented. */
  unseen: Seat[];
  /** Cards not yet played and not visible, to be shared out among `unseen`. */
  pool: readonly Card[];
  constraints: Record<number, SeatConstraint>;
}

/**
 * Shares `pool` out among the unseen seats, honouring card counts and voids.
 *
 * Cards are placed in random order and each is given to a seat chosen in
 * proportion to how many cards that seat still needs, which keeps the layouts
 * close to uniform. Backtracking covers the rare corner where voids make a
 * partial assignment impossible.
 */
function dealPool(
  request: SamplingRequest,
  random: RandomSource,
): Card[][] | undefined {
  const { pool, unseen, constraints } = request;
  const result: Record<number, Card[]> = {};
  const needed: Record<number, number> = {};
  for (const seat of unseen) {
    result[seat] = [];
    needed[seat] = constraints[seat].count;
  }

  const order = shuffled(pool, random);
  let budget = 20000;

  const place = (index: number): boolean => {
    if (index === order.length) return true;
    if (budget-- <= 0) return false;

    const card = order[index];
    const suit = cardSuit(card);
    const candidates = unseen.filter(
      (seat) => needed[seat] > 0 && !constraints[seat].voids.includes(suit),
    );
    if (candidates.length === 0) return false;

    // Try seats in a random order weighted by how many cards they still need.
    const weighted = [...candidates].sort(
      (a, b) => needed[b] * random() - needed[a] * random(),
    );

    for (const seat of weighted) {
      result[seat].push(card);
      needed[seat] -= 1;
      if (place(index + 1)) return true;
      result[seat].pop();
      needed[seat] += 1;
    }
    return false;
  };

  if (!place(0)) return undefined;
  return unseen.map((seat) => result[seat]);
}

/** How badly a layout contradicts what the auction promised. Zero is consistent. */
function inconsistency(
  cards: readonly Card[],
  constraint: SeatConstraint,
): number {
  const hcp = highCardPoints(cards);
  let penalty = 0;
  if (hcp < constraint.minHcp) penalty += constraint.minHcp - hcp;
  if (hcp > constraint.maxHcp) penalty += hcp - constraint.maxHcp;

  const lengths = [0, 0, 0, 0];
  for (const card of cards) lengths[cardSuit(card)] += 1;
  constraint.minLengths.forEach((minimum, suit) => {
    if (lengths[suit] < minimum) penalty += (minimum - lengths[suit]) * 2;
  });

  return penalty;
}

/**
 * Produces up to `count` complete deals consistent with what the robot knows.
 *
 * Bidding constraints are treated as preferences rather than hard rules: a
 * layout that contradicts the auction is retried a few times, but a robot that
 * cannot find a consistent layout still has to play a card, so the best
 * available layout is used rather than none at all.
 */
export function sampleDeals(
  request: SamplingRequest,
  count: number,
  random: RandomSource = Math.random,
): Hands[] {
  const deals: Hands[] = [];
  const attemptsPerDeal = 12;

  for (let i = 0; i < count; i += 1) {
    let best: Card[][] | undefined;
    let bestPenalty = Number.POSITIVE_INFINITY;

    for (let attempt = 0; attempt < attemptsPerDeal; attempt += 1) {
      const dealt = dealPool(request, random);
      if (!dealt) continue;

      const penalty = dealt.reduce(
        (total, cards, index) =>
          total +
          inconsistency(cards, request.constraints[request.unseen[index]]),
        0,
      );
      if (penalty < bestPenalty) {
        best = dealt;
        bestPenalty = penalty;
      }
      if (penalty === 0) break;
    }

    if (!best) continue;

    const hands: Card[][] = SEATS.map((seat) => [...request.known[seat]]);
    request.unseen.forEach((seat, index) => {
      hands[seat] = sortHand(best![index]);
    });
    deals.push(hands);
  }

  return deals;
}
