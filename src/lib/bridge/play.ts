/**
 * Trick play: legality, trick resolution, and the running state of a hand.
 */

import {
  cardRank,
  cardSuit,
  isSameSide,
  nextSeat,
  partnerOf,
  Strain,
  type Card,
  type Seat,
  type Suit,
} from "./cards";
import { removeCard, type Hands } from "./deal";
import type { Contract } from "./auction";

export interface Trick {
  /** Seat that led to this trick. */
  leader: Seat;
  /** Cards in the order played, starting with the leader's. */
  cards: Card[];
}

export interface PlayState {
  contract: Contract;
  /** Cards still held by each seat. */
  hands: Hands;
  /** Completed tricks in order. */
  tricks: Trick[];
  /** The trick in progress; `cards` may hold zero to three cards. */
  current: Trick;
  /** Tricks won by the declaring side. */
  declarerTricks: number;
  /** Tricks won by the defending side. */
  defenderTricks: number;
}

export function trumpSuit(contract: Contract): Suit | undefined {
  return contract.strain === Strain.NoTrump
    ? undefined
    : (contract.strain as Suit);
}

export function createPlayState(contract: Contract, hands: Hands): PlayState {
  return {
    contract,
    hands: hands.map((cards) => [...cards]),
    tricks: [],
    current: { leader: nextSeat(contract.declarer), cards: [] },
    declarerTricks: 0,
    defenderTricks: 0,
  };
}

/** The seat whose turn it is to play a card. */
export function seatToPlay(state: PlayState): Seat {
  return nextSeat(state.current.leader, state.current.cards.length);
}

/** Dummy is declarer's partner; their cards are exposed after the opening lead. */
export function dummySeat(contract: Contract): Seat {
  return partnerOf(contract.declarer);
}

export function isDummyVisible(state: PlayState): boolean {
  return state.tricks.length > 0 || state.current.cards.length > 0;
}

export function legalPlays(
  state: PlayState,
  seat: Seat = seatToPlay(state),
): Card[] {
  const hand = state.hands[seat];
  if (state.current.cards.length === 0) return [...hand];
  const ledSuit = cardSuit(state.current.cards[0]);
  const following = hand.filter((card) => cardSuit(card) === ledSuit);
  return following.length > 0 ? following : [...hand];
}

export function isLegalPlay(
  state: PlayState,
  card: Card,
  seat: Seat = seatToPlay(state),
): boolean {
  return legalPlays(state, seat).includes(card);
}

/**
 * Ranks a card within a trick: trumps beat the led suit, which beats discards.
 */
function trickValue(
  card: Card,
  ledSuit: Suit,
  trump: Suit | undefined,
): number {
  if (trump !== undefined && cardSuit(card) === trump)
    return 100 + cardRank(card);
  if (cardSuit(card) === ledSuit) return cardRank(card);
  return -1;
}

/** Index of the winning card within `cards`, played in order from the leader. */
export function trickWinnerIndex(
  cards: readonly Card[],
  trump: Suit | undefined,
): number {
  const ledSuit = cardSuit(cards[0]);
  let best = 0;
  for (let i = 1; i < cards.length; i += 1) {
    if (
      trickValue(cards[i], ledSuit, trump) >
      trickValue(cards[best], ledSuit, trump)
    )
      best = i;
  }
  return best;
}

export function trickWinner(trick: Trick, trump: Suit | undefined): Seat {
  return nextSeat(trick.leader, trickWinnerIndex(trick.cards, trump));
}

/** Plays a card and, when the trick completes, awards it and sets the next lead. */
export function playCard(state: PlayState, card: Card): PlayState {
  const seat = seatToPlay(state);
  if (!isLegalPlay(state, card, seat)) {
    throw new Error(`Illegal play from ${seat}: ${card}`);
  }

  const hands = state.hands.map((cards, index) =>
    index === seat ? removeCard(cards, card) : [...cards],
  );
  const cards = [...state.current.cards, card];

  if (cards.length < 4) {
    return { ...state, hands, current: { ...state.current, cards } };
  }

  const trick: Trick = { leader: state.current.leader, cards };
  const winner = trickWinner(trick, trumpSuit(state.contract));
  const declarerWon = isSameSide(winner, state.contract.declarer);

  return {
    ...state,
    hands,
    tricks: [...state.tricks, trick],
    current: { leader: winner, cards: [] },
    declarerTricks: state.declarerTricks + (declarerWon ? 1 : 0),
    defenderTricks: state.defenderTricks + (declarerWon ? 0 : 1),
  };
}

export function isPlayComplete(state: PlayState): boolean {
  return state.tricks.length === 13;
}

/** Every card played so far, in order, as a flat list. */
export function playedCards(state: PlayState): Card[] {
  return [
    ...state.tricks.flatMap((trick) => trick.cards),
    ...state.current.cards,
  ];
}

/** The seat that played each card of `playedCards`, aligned by index. */
export function playedCardSeats(state: PlayState): Seat[] {
  const seats: Seat[] = [];
  for (const trick of state.tricks) {
    trick.cards.forEach((_, index) =>
      seats.push(nextSeat(trick.leader, index)),
    );
  }
  state.current.cards.forEach((_, index) =>
    seats.push(nextSeat(state.current.leader, index)),
  );
  return seats;
}

/**
 * Suits a seat is known to be void in, deduced from failures to follow suit.
 * Used to constrain hand sampling for the bots.
 */
export function knownVoids(state: PlayState): Suit[][] {
  const voids: Suit[][] = [[], [], [], []];
  const allTricks = [...state.tricks, state.current];
  for (const trick of allTricks) {
    if (trick.cards.length === 0) continue;
    const ledSuit = cardSuit(trick.cards[0]);
    trick.cards.forEach((card, index) => {
      if (index === 0) return;
      if (cardSuit(card) === ledSuit) return;
      const seat = nextSeat(trick.leader, index);
      if (!voids[seat].includes(ledSuit)) voids[seat].push(ledSuit);
    });
  }
  return voids;
}
