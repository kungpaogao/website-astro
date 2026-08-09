/**
 * Hand evaluation shared by the bidding engine and the review panel.
 */

import {
  bySuit,
  cardRank,
  cardSuit,
  highCardPoints,
  shape,
  Suit,
  SUITS,
  SUIT_SYMBOLS,
  type Card,
} from "./cards";

export interface HandEvaluation {
  hcp: number;
  /** Suit lengths ordered spades..clubs. */
  lengths: number[];
  /** High card points plus one for each card over four in a suit. */
  withLength: number;
  balanced: boolean;
  /** 4333, 4432 or 5332 with no five card major — the classic notrump shapes. */
  semiBalanced: boolean;
  longestSuit: Suit;
  /** Suits of at least five cards, longest first. */
  longSuits: Suit[];
  /** Four card or longer majors. */
  majors: Suit[];
  shapeLabel: string;
}

export function isMajor(suit: Suit): boolean {
  return suit === Suit.Spades || suit === Suit.Hearts;
}

export function isMinor(suit: Suit): boolean {
  return suit === Suit.Diamonds || suit === Suit.Clubs;
}

/** Points added for length: one for each card beyond the fourth in a suit. */
export function lengthPoints(lengths: readonly number[]): number {
  return lengths.reduce((total, length) => total + Math.max(0, length - 4), 0);
}

/** Points added for shortness when raising partner: void 5, singleton 3, doubleton 1. */
export function shortnessPoints(
  lengths: readonly number[],
  trumpSuit: Suit,
): number {
  return SUITS.reduce((total, suit) => {
    if (suit === trumpSuit) return total;
    const length = lengths[suit];
    if (length === 0) return total + 5;
    if (length === 1) return total + 3;
    if (length === 2) return total + 1;
    return total;
  }, 0);
}

export function evaluateHand(cards: readonly Card[]): HandEvaluation {
  const hcp = highCardPoints(cards);
  const lengths = shape(cards);
  const sorted = [...lengths].sort((a, b) => b - a);
  const balanced =
    lengths.every((length) => length >= 2) && sorted[0] <= 5 && sorted[3] >= 2;
  const longSuits = SUITS.filter((suit) => lengths[suit] >= 5).sort(
    (a, b) => lengths[b] - lengths[a] || a - b,
  );

  let longestSuit: Suit = Suit.Spades;
  for (const suit of SUITS) {
    if (lengths[suit] > lengths[longestSuit]) longestSuit = suit;
  }

  return {
    hcp,
    lengths,
    withLength: hcp + lengthPoints(lengths),
    balanced,
    semiBalanced: balanced && sorted[0] <= 5,
    longestSuit,
    longSuits,
    majors: SUITS.filter((suit) => isMajor(suit) && lengths[suit] >= 4),
    shapeLabel: sorted.join("-"),
  };
}

/**
 * A rough quality score for a suit, used to decide whether it is worth bidding
 * at the one or two level as an overcall.
 */
export function suitQuality(cards: readonly Card[], suit: Suit): number {
  const ranks = cards.filter((card) => cardSuit(card) === suit).map(cardRank);
  const honours = ranks.filter((rank) => rank >= 10).length;
  const topHonours = ranks.filter((rank) => rank >= 12).length;
  return ranks.length + honours + topHonours;
}

/** True when the hand holds a plausible notrump stopper in the suit. */
export function hasStopper(cards: readonly Card[], suit: Suit): boolean {
  const ranks = bySuit(cards)[suit];
  if (ranks.includes(14)) return true;
  if (ranks.includes(13) && ranks.length >= 2) return true;
  if (ranks.includes(12) && ranks.length >= 3) return true;
  if (ranks.includes(11) && ranks.length >= 4) return true;
  return false;
}

export function describeHand(evaluation: HandEvaluation): string {
  const lengths = SUITS.map(
    (suit) => `${SUIT_SYMBOLS[suit]}${evaluation.lengths[suit]}`,
  ).join(" ");
  return `${evaluation.hcp} HCP, ${lengths}`;
}
