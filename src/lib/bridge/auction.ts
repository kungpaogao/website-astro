/**
 * The auction: call representation, legality, and resolution to a contract.
 */

import {
  isSameSide,
  nextSeat,
  partnerOf,
  STRAIN_SYMBOLS,
  Strain,
  type Seat,
} from "./cards";

export type CallKind = "bid" | "pass" | "double" | "redouble";

export interface Call {
  kind: CallKind;
  /** Contract level 1..7, present only on `bid` calls. */
  level?: number;
  /** Denomination, present only on `bid` calls. */
  strain?: Strain;
}

export const PASS: Call = { kind: "pass" };
export const DOUBLE: Call = { kind: "double" };
export const REDOUBLE: Call = { kind: "redouble" };

export function bid(level: number, strain: Strain): Call {
  return { kind: "bid", level, strain };
}

/**
 * Auction order of the denominations: clubs lowest, notrump highest.
 *
 * The numeric `Strain` values run the other way (spades is 0) because they mirror
 * the double dummy solver, so bidding order needs this explicit mapping.
 */
export function strainOrdinal(strain: Strain): number {
  return strain === Strain.NoTrump ? 4 : 3 - strain;
}

/** Denominations in bidding order, for the bidding box. */
export const BIDDING_ORDER: Strain[] = [
  Strain.Clubs,
  Strain.Diamonds,
  Strain.Hearts,
  Strain.Spades,
  Strain.NoTrump,
];

/** Ordinal used to compare bids: 1♣ is 0, 7NT is 34. */
export function bidRank(call: Call): number {
  if (call.kind !== "bid") throw new Error("Only bids have a rank");
  return (call.level! - 1) * 5 + strainOrdinal(call.strain!);
}

export function callToString(call: Call): string {
  switch (call.kind) {
    case "pass":
      return "Pass";
    case "double":
      return "X";
    case "redouble":
      return "XX";
    case "bid":
      return `${call.level}${STRAIN_SYMBOLS[call.strain!]}`;
  }
}

export const ALL_BIDS: Call[] = Array.from({ length: 7 }, (_, levelIndex) =>
  BIDDING_ORDER.map((strain) => bid(levelIndex + 1, strain)),
).flat();

export interface AuctionEntry {
  seat: Seat;
  call: Call;
}

export interface Auction {
  dealer: Seat;
  entries: AuctionEntry[];
}

export function createAuction(dealer: Seat): Auction {
  return { dealer, entries: [] };
}

export function seatToCall(auction: Auction): Seat {
  return nextSeat(auction.dealer, auction.entries.length);
}

export function lastBidEntry(auction: Auction): AuctionEntry | undefined {
  for (let i = auction.entries.length - 1; i >= 0; i -= 1) {
    if (auction.entries[i].call.kind === "bid") return auction.entries[i];
  }
  return undefined;
}

/** The doubling state of the current highest bid. */
function doubleState(auction: Auction): "none" | "doubled" | "redoubled" {
  for (let i = auction.entries.length - 1; i >= 0; i -= 1) {
    const { kind } = auction.entries[i].call;
    if (kind === "bid") return "none";
    if (kind === "double") return "doubled";
    if (kind === "redouble") return "redoubled";
  }
  return "none";
}

export function isLegalCall(auction: Auction, call: Call): boolean {
  const seat = seatToCall(auction);
  const highest = lastBidEntry(auction);

  switch (call.kind) {
    case "pass":
      return true;
    case "bid":
      if (call.level === undefined || call.level < 1 || call.level > 7)
        return false;
      return highest === undefined || bidRank(call) > bidRank(highest.call);
    case "double":
      // Legal only over an opponent's bid that has not already been doubled.
      return (
        highest !== undefined &&
        !isSameSide(highest.seat, seat) &&
        doubleState(auction) === "none"
      );
    case "redouble":
      return (
        highest !== undefined &&
        isSameSide(highest.seat, seat) &&
        doubleState(auction) === "doubled"
      );
  }
}

export function legalCalls(auction: Auction): Call[] {
  const calls: Call[] = [PASS, DOUBLE, REDOUBLE, ...ALL_BIDS];
  return calls.filter((call) => isLegalCall(auction, call));
}

export function makeCall(auction: Auction, call: Call): Auction {
  if (!isLegalCall(auction, call)) {
    throw new Error(`Illegal call: ${callToString(call)}`);
  }
  return {
    ...auction,
    entries: [...auction.entries, { seat: seatToCall(auction), call }],
  };
}

/**
 * The auction ends after three consecutive passes following any call, or after
 * four passes when nobody has bid.
 */
export function isAuctionComplete(auction: Auction): boolean {
  const { entries } = auction;
  if (entries.length < 4) return false;
  const trailingPasses = countTrailingPasses(auction);
  return entries.length === trailingPasses
    ? trailingPasses === 4
    : trailingPasses >= 3;
}

function countTrailingPasses(auction: Auction): number {
  let count = 0;
  for (let i = auction.entries.length - 1; i >= 0; i -= 1) {
    if (auction.entries[i].call.kind !== "pass") break;
    count += 1;
  }
  return count;
}

export interface Contract {
  level: number;
  strain: Strain;
  declarer: Seat;
  doubled: "none" | "doubled" | "redoubled";
}

export function contractToString(contract: Contract): string {
  const suffix =
    contract.doubled === "doubled"
      ? "X"
      : contract.doubled === "redoubled"
        ? "XX"
        : "";
  return `${contract.level}${STRAIN_SYMBOLS[contract.strain]}${suffix}`;
}

/**
 * Resolves a completed auction. Returns undefined when the board was passed out.
 *
 * Declarer is whichever member of the winning partnership first named the final
 * strain, which is not necessarily the player who made the final bid.
 */
export function auctionResult(auction: Auction): Contract | undefined {
  if (!isAuctionComplete(auction)) throw new Error("Auction is not complete");
  const highest = lastBidEntry(auction);
  if (!highest) return undefined;

  const strain = highest.call.strain!;
  const partnership = [highest.seat, partnerOf(highest.seat)];
  const declarer =
    auction.entries.find(
      (entry) =>
        entry.call.kind === "bid" &&
        entry.call.strain === strain &&
        partnership.includes(entry.seat),
    )?.seat ?? highest.seat;

  return {
    level: highest.call.level!,
    strain,
    declarer,
    doubled: doubleState(auction),
  };
}

/** Groups the auction into rows of four starting from the dealer, for display. */
export function auctionRows(auction: Auction): (Call | undefined)[][] {
  const rows: (Call | undefined)[][] = [];
  const leadingBlanks = auction.dealer;
  const cells: (Call | undefined)[] = Array<Call | undefined>(
    leadingBlanks,
  ).fill(undefined);
  for (const entry of auction.entries) cells.push(entry.call);
  while (cells.length % 4 !== 0 || cells.length === 0) cells.push(undefined);
  for (let i = 0; i < cells.length; i += 4) rows.push(cells.slice(i, i + 4));
  return rows;
}
