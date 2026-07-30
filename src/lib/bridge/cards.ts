/**
 * Card, suit and seat primitives.
 *
 * Numeric values are chosen to match the conventions of the underlying double
 * dummy solver (dds) so that no translation layer is needed when talking to the
 * wasm module: suits run spades..clubs, seats run clockwise from north.
 */

export const Suit = {
  Spades: 0,
  Hearts: 1,
  Diamonds: 2,
  Clubs: 3,
} as const;
export type Suit = (typeof Suit)[keyof typeof Suit];

/** A denomination that can be bid: the four suits plus notrump. */
export const Strain = {
  ...Suit,
  NoTrump: 4,
} as const;
export type Strain = (typeof Strain)[keyof typeof Strain];

export const Seat = {
  North: 0,
  East: 1,
  South: 2,
  West: 3,
} as const;
export type Seat = (typeof Seat)[keyof typeof Seat];

export const SUITS: Suit[] = [
  Suit.Spades,
  Suit.Hearts,
  Suit.Diamonds,
  Suit.Clubs,
];
export const STRAINS: Strain[] = [...SUITS, Strain.NoTrump];
export const SEATS: Seat[] = [Seat.North, Seat.East, Seat.South, Seat.West];

export const SUIT_LETTERS = ["S", "H", "D", "C"] as const;
export const STRAIN_LETTERS = ["S", "H", "D", "C", "N"] as const;
export const SUIT_SYMBOLS = ["♠", "♥", "♦", "♣"] as const;
export const STRAIN_SYMBOLS = [...SUIT_SYMBOLS, "NT"] as const;
export const SEAT_LETTERS = ["N", "E", "S", "W"] as const;
export const SEAT_NAMES = ["North", "East", "South", "West"] as const;

/** Rank values: 2..10 are numeric, jack..ace are 11..14. */
export const RANKS = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2] as const;
export const RANK_LETTERS = "23456789TJQKA";

/** A card encoded as `suit * 16 + rank`, keeping cards comparable and hashable. */
export type Card = number;

export function makeCard(suit: Suit, rank: number): Card {
  return suit * 16 + rank;
}

export function cardSuit(card: Card): Suit {
  return (card >> 4) as Suit;
}

export function cardRank(card: Card): number {
  return card & 15;
}

export function rankLetter(rank: number): string {
  return RANK_LETTERS[rank - 2];
}

export function rankFromLetter(letter: string): number {
  const index = RANK_LETTERS.indexOf(letter.toUpperCase());
  if (index < 0) throw new Error(`Unknown rank letter: ${letter}`);
  return index + 2;
}

export function cardName(card: Card): string {
  return `${SUIT_SYMBOLS[cardSuit(card)]}${rankLetter(cardRank(card))}`;
}

/** The `SR` form used by the solver's play traces, e.g. `H9`. */
export function cardToPbn(card: Card): string {
  return `${SUIT_LETTERS[cardSuit(card)]}${rankLetter(cardRank(card))}`;
}

export function cardFromPbn(text: string): Card {
  const suit = SUIT_LETTERS.indexOf(
    text[0].toUpperCase() as (typeof SUIT_LETTERS)[number],
  );
  if (suit < 0) throw new Error(`Unknown suit letter: ${text[0]}`);
  return makeCard(suit as Suit, rankFromLetter(text[1]));
}

export const FULL_DECK: readonly Card[] = SUITS.flatMap((suit) =>
  RANKS.map((rank) => makeCard(suit, rank)),
);

export function nextSeat(seat: Seat, steps = 1): Seat {
  return ((((seat + steps) % 4) + 4) % 4) as Seat;
}

export function partnerOf(seat: Seat): Seat {
  return nextSeat(seat, 2);
}

/** True when the two seats belong to the same partnership. */
export function isSameSide(a: Seat, b: Seat): boolean {
  return a % 2 === b % 2;
}

/** Sorts by suit (spades first) then by descending rank — the usual hand order. */
export function compareCards(a: Card, b: Card): number {
  const suitDelta = cardSuit(a) - cardSuit(b);
  return suitDelta !== 0 ? suitDelta : cardRank(b) - cardRank(a);
}

export function sortHand(cards: readonly Card[]): Card[] {
  return [...cards].sort(compareCards);
}

/** Splits a hand into four rank lists, ordered spades..clubs, high to low. */
export function bySuit(cards: readonly Card[]): number[][] {
  const suits: number[][] = [[], [], [], []];
  for (const card of cards) suits[cardSuit(card)].push(cardRank(card));
  for (const ranks of suits) ranks.sort((a, b) => b - a);
  return suits;
}

const HIGH_CARD_POINTS: Record<number, number> = { 14: 4, 13: 3, 12: 2, 11: 1 };

export function highCardPoints(cards: readonly Card[]): number {
  let points = 0;
  for (const card of cards) points += HIGH_CARD_POINTS[cardRank(card)] ?? 0;
  return points;
}

/** Suit lengths as a four element array ordered spades..clubs. */
export function shape(cards: readonly Card[]): number[] {
  const lengths = [0, 0, 0, 0];
  for (const card of cards) lengths[cardSuit(card)] += 1;
  return lengths;
}
