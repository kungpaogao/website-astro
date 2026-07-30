/**
 * Deal construction and PBN serialization.
 *
 * PBN deal strings look like `N:AK5.QJ2.T98.7643 ...` — four hands separated by
 * spaces, listed clockwise starting from the seat named by the prefix, each hand
 * written as spades.hearts.diamonds.clubs.
 */

import {
  cardFromPbn,
  cardSuit,
  cardRank,
  FULL_DECK,
  makeCard,
  nextSeat,
  rankLetter,
  SEAT_LETTERS,
  SEATS,
  Seat,
  Suit,
  SUITS,
  sortHand,
  type Card,
} from "./cards";

/** Cards held by each seat, indexed by `Seat`. */
export type Hands = readonly (readonly Card[])[];

export const Vulnerability = {
  None: 0,
  Both: 1,
  NorthSouth: 2,
  EastWest: 3,
} as const;
export type Vulnerability = (typeof Vulnerability)[keyof typeof Vulnerability];

export const VULNERABILITY_NAMES: Record<Vulnerability, string> = {
  [Vulnerability.None]: "None",
  [Vulnerability.Both]: "Both",
  [Vulnerability.NorthSouth]: "N-S",
  [Vulnerability.EastWest]: "E-W",
};

export interface Board {
  number: number;
  dealer: Seat;
  vulnerability: Vulnerability;
  hands: Hands;
}

/** Board 1 is dealt by North and rotates clockwise from there. */
export function dealerForBoard(boardNumber: number): Seat {
  return ((boardNumber - 1) % 4) as Seat;
}

/**
 * Standard duplicate vulnerability cycle, which repeats every sixteen boards.
 * Indexed by (board - 1) % 16.
 */
const VULNERABILITY_CYCLE: Vulnerability[] = [
  Vulnerability.None,
  Vulnerability.NorthSouth,
  Vulnerability.EastWest,
  Vulnerability.Both,
  Vulnerability.NorthSouth,
  Vulnerability.EastWest,
  Vulnerability.Both,
  Vulnerability.None,
  Vulnerability.EastWest,
  Vulnerability.Both,
  Vulnerability.None,
  Vulnerability.NorthSouth,
  Vulnerability.Both,
  Vulnerability.None,
  Vulnerability.NorthSouth,
  Vulnerability.EastWest,
];

export function vulnerabilityForBoard(boardNumber: number): Vulnerability {
  return VULNERABILITY_CYCLE[(boardNumber - 1) % 16];
}

export function isVulnerable(
  seat: Seat,
  vulnerability: Vulnerability,
): boolean {
  const northSouth = seat === Seat.North || seat === Seat.South;
  switch (vulnerability) {
    case Vulnerability.None:
      return false;
    case Vulnerability.Both:
      return true;
    case Vulnerability.NorthSouth:
      return northSouth;
    case Vulnerability.EastWest:
      return !northSouth;
  }
}

export type RandomSource = () => number;

export function shuffled<T>(
  items: readonly T[],
  random: RandomSource = Math.random,
): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function dealHands(random: RandomSource = Math.random): Hands {
  const deck = shuffled(FULL_DECK, random);
  return SEATS.map((seat) => sortHand(deck.slice(seat * 13, seat * 13 + 13)));
}

export function createBoard(
  boardNumber: number,
  random: RandomSource = Math.random,
): Board {
  return {
    number: boardNumber,
    dealer: dealerForBoard(boardNumber),
    vulnerability: vulnerabilityForBoard(boardNumber),
    hands: dealHands(random),
  };
}

function handToPbn(cards: readonly Card[]): string {
  return SUITS.map((suit) =>
    cards
      .filter((card) => cardSuit(card) === suit)
      .map(cardRank)
      .sort((a, b) => b - a)
      .map(rankLetter)
      .join(""),
  ).join(".");
}

/**
 * Serializes hands to PBN, listing them clockwise from `first`.
 *
 * Any seat may hold fewer than thirteen cards, which is how mid-play positions
 * are handed to the solver.
 */
export function handsToPbn(hands: Hands, first: Seat = Seat.North): string {
  const ordered = [0, 1, 2, 3].map((offset) =>
    handToPbn(hands[nextSeat(first, offset)]),
  );
  return `${SEAT_LETTERS[first]}:${ordered.join(" ")}`;
}

export function handsFromPbn(pbn: string): Hands {
  const [prefix, rest] = pbn.split(":");
  const first = SEAT_LETTERS.indexOf(
    prefix.trim().toUpperCase() as (typeof SEAT_LETTERS)[number],
  );
  if (first < 0) throw new Error(`Unknown seat prefix in PBN: ${prefix}`);

  const hands: Card[][] = [[], [], [], []];
  const handTexts = rest.trim().split(/\s+/);
  if (handTexts.length !== 4)
    throw new Error(`Expected four hands in PBN: ${pbn}`);

  handTexts.forEach((handText, offset) => {
    const seat = nextSeat(first as Seat, offset);
    handText.split(".").forEach((ranks, suitIndex) => {
      for (const letter of ranks) {
        hands[seat].push(cardFromPbn(`${"SHDC"[suitIndex]}${letter}`));
      }
    });
  });

  return hands.map(sortHand);
}

export function cardsInSuit(cards: readonly Card[], suit: Suit): Card[] {
  return cards.filter((card) => cardSuit(card) === suit);
}

export function removeCard(cards: readonly Card[], card: Card): Card[] {
  const index = cards.indexOf(card);
  if (index < 0) throw new Error(`Card not held: ${card}`);
  return [...cards.slice(0, index), ...cards.slice(index + 1)];
}

/** Builds a deal from four hand strings written as `spades.hearts.diamonds.clubs`. */
export function handsFromStrings(
  north: string,
  east: string,
  south: string,
  west: string,
): Hands {
  return handsFromPbn(`N:${north} ${east} ${south} ${west}`);
}
