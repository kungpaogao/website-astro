/**
 * Packing a finished board into a URL.
 *
 * There are 52!/(13!)^4 ≈ 5.36e28 distinct deals, so a deal needs about 95 bits
 * of information — small enough that a whole board, auction and play included,
 * fits comfortably in a link.
 *
 * The layout below spends a little more than the theoretical minimum in exchange
 * for being obvious to read:
 *
 * | field        | bits                                                  |
 * | ------------ | ----------------------------------------------------- |
 * | version      | 4                                                     |
 * | board number | 10                                                    |
 * | dealer       | 2                                                     |
 * | vulnerability| 2                                                     |
 * | deal         | 104  (two bits per card, naming the seat that holds it)|
 * | auction      | 6 + 6 per call                                        |
 * | play         | 6 + ceil(log2(legal moves)) per card                   |
 *
 * The play is the interesting one: rather than naming each card outright, it
 * stores the card's index among the legal plays at that moment. Both sides
 * replay the hand as they go, so they always agree on that list, and a card
 * played to a suit you must follow often costs a bit or two rather than six.
 * A complete board lands around forty bytes, or roughly fifty characters.
 */

import {
  ALL_BIDS,
  createAuction,
  isLegalCall,
  makeCall,
  auctionResult,
  type Auction,
  type Call,
} from "./auction";
import { FULL_DECK, SEATS, sortHand, type Card, type Seat } from "./cards";
import type { Hands, Vulnerability } from "./deal";
import {
  createPlayState,
  isPlayComplete,
  legalPlays,
  playCard,
  seatToPlay,
  type PlayState,
} from "./play";

const VERSION = 1;

export interface BoardRecord {
  boardNumber: number;
  dealer: Seat;
  vulnerability: Vulnerability;
  hands: Hands;
  auction: Auction;
  /** Cards in the order played. Empty when the board was passed out. */
  trace: Card[];
}

// --------------------------------------------------------------------------
// Bit level plumbing
// --------------------------------------------------------------------------

class BitWriter {
  #bytes: number[] = [];
  #current = 0;
  #used = 0;

  write(value: number, bits: number): void {
    for (let i = bits - 1; i >= 0; i -= 1) {
      this.#current = (this.#current << 1) | ((value >> i) & 1);
      this.#used += 1;
      if (this.#used === 8) {
        this.#bytes.push(this.#current);
        this.#current = 0;
        this.#used = 0;
      }
    }
  }

  finish(): Uint8Array {
    if (this.#used > 0) this.#bytes.push(this.#current << (8 - this.#used));
    return new Uint8Array(this.#bytes);
  }
}

class BitReader {
  #bytes: Uint8Array;
  #index = 0;
  #bit = 0;

  constructor(bytes: Uint8Array) {
    this.#bytes = bytes;
  }

  read(bits: number): number {
    let value = 0;
    for (let i = 0; i < bits; i += 1) {
      if (this.#index >= this.#bytes.length)
        throw new Error("Truncated board code");
      value =
        (value << 1) | ((this.#bytes[this.#index] >> (7 - this.#bit)) & 1);
      this.#bit += 1;
      if (this.#bit === 8) {
        this.#bit = 0;
        this.#index += 1;
      }
    }
    return value;
  }
}

/** Bits needed to index `count` options. Zero when there is no choice. */
function bitsFor(count: number): number {
  if (count <= 1) return 0;
  return 32 - Math.clz32(count - 1);
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// --------------------------------------------------------------------------
// Calls
// --------------------------------------------------------------------------

function callCode(call: Call): number {
  if (call.kind === "pass") return 0;
  if (call.kind === "double") return 1;
  if (call.kind === "redouble") return 2;
  const index = ALL_BIDS.findIndex(
    (bid) => bid.level === call.level && bid.strain === call.strain,
  );
  if (index < 0) throw new Error("Unknown bid");
  return 3 + index;
}

function callFromCode(code: number): Call {
  if (code === 0) return { kind: "pass" };
  if (code === 1) return { kind: "double" };
  if (code === 2) return { kind: "redouble" };
  const bid = ALL_BIDS[code - 3];
  if (!bid) throw new Error("Unknown bid code");
  return bid;
}

/**
 * Legal plays in a fixed order, so the encoder and the decoder index the same
 * list even if the order cards happen to sit in a hand ever changes.
 */
function orderedLegalPlays(state: PlayState): Card[] {
  return legalPlays(state, seatToPlay(state)).sort((a, b) => a - b);
}

// --------------------------------------------------------------------------
// Encode and decode
// --------------------------------------------------------------------------

export function encodeBoard(record: BoardRecord): string {
  const writer = new BitWriter();
  writer.write(VERSION, 4);
  writer.write(record.boardNumber & 0x3ff, 10);
  writer.write(record.dealer, 2);
  writer.write(record.vulnerability, 2);

  // Two bits per card naming the seat that holds it.
  const seatOf = new Map<Card, Seat>();
  SEATS.forEach((seat) => {
    for (const card of record.hands[seat]) seatOf.set(card, seat);
  });
  for (const card of FULL_DECK) {
    const seat = seatOf.get(card);
    if (seat === undefined) throw new Error("Deal is missing a card");
    writer.write(seat, 2);
  }

  writer.write(record.auction.entries.length, 6);
  for (const entry of record.auction.entries)
    writer.write(callCode(entry.call), 6);

  writer.write(record.trace.length, 6);
  if (record.trace.length > 0) {
    const contract = auctionResult(record.auction);
    if (!contract) throw new Error("Cards were played without a contract");
    let state = createPlayState(contract, record.hands);
    for (const card of record.trace) {
      const options = orderedLegalPlays(state);
      const index = options.indexOf(card);
      if (index < 0) throw new Error("Trace contains an illegal card");
      writer.write(index, bitsFor(options.length));
      state = playCard(state, card);
    }
  }

  return toBase64Url(writer.finish());
}

export function decodeBoard(code: string): BoardRecord {
  const reader = new BitReader(fromBase64Url(code));

  const version = reader.read(4);
  if (version !== VERSION)
    throw new Error(`Unsupported board code version ${version}`);

  const boardNumber = reader.read(10);
  const dealer = reader.read(2) as Seat;
  const vulnerability = reader.read(2) as Vulnerability;

  const hands: Card[][] = [[], [], [], []];
  for (const card of FULL_DECK) hands[reader.read(2)].push(card);
  if (hands.some((hand) => hand.length !== 13)) {
    throw new Error("Board code does not describe a legal deal");
  }
  const sorted: Hands = hands.map(sortHand);

  let auction: Auction = createAuction(dealer);
  const calls = reader.read(6);
  for (let i = 0; i < calls; i += 1) {
    const call = callFromCode(reader.read(6));
    if (!isLegalCall(auction, call))
      throw new Error("Board code has an illegal call");
    auction = makeCall(auction, call);
  }

  const trace: Card[] = [];
  const played = reader.read(6);
  if (played > 0) {
    const contract = auctionResult(auction);
    if (!contract) throw new Error("Board code plays cards without a contract");
    let state = createPlayState(contract, sorted);
    for (let i = 0; i < played; i += 1) {
      if (isPlayComplete(state))
        throw new Error("Board code plays too many cards");
      const options = orderedLegalPlays(state);
      const card = options[reader.read(bitsFor(options.length))];
      if (card === undefined) throw new Error("Board code has an illegal card");
      trace.push(card);
      state = playCard(state, card);
    }
  }

  return { boardNumber, dealer, vulnerability, hands: sorted, auction, trace };
}

/**
 * Replays a record's trace, returning the finished play state.
 *
 * Undefined when the board was passed out, so there was never a contract.
 */
export function replayRecord(record: BoardRecord): PlayState | undefined {
  const contract = auctionResult(record.auction);
  if (!contract) return undefined;
  let state = createPlayState(contract, record.hands);
  for (const card of record.trace) state = playCard(state, card);
  return state;
}
