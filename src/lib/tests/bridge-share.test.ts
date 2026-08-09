import { describe, expect, it } from "vitest";
import {
  auctionResult,
  createAuction,
  isAuctionComplete,
  makeCall,
  seatToCall,
  type Auction,
} from "../bridge/auction";
import { suggestCall } from "../bridge/bidding";
import { Seat, type Card } from "../bridge/cards";
import { createBoard, type Hands } from "../bridge/deal";
import {
  createPlayState,
  isPlayComplete,
  legalPlays,
  playCard,
  playedCards,
  seatToPlay,
} from "../bridge/play";
import { decodeBoard, encodeBoard, type BoardRecord } from "../bridge/share";

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function runAuction(hands: Hands, dealer: Seat): Auction {
  let auction = createAuction(dealer);
  while (!isAuctionComplete(auction)) {
    const seat = seatToCall(auction);
    auction = makeCall(auction, suggestCall(hands[seat], auction, seat).call);
  }
  return auction;
}

/** Plays the board out with random legal cards — the encoder does not care how. */
function randomTrace(
  hands: Hands,
  auction: Auction,
  random: () => number,
): Card[] {
  const contract = auctionResult(auction);
  if (!contract) return [];
  let state = createPlayState(contract, hands);
  while (!isPlayComplete(state)) {
    const options = legalPlays(state, seatToPlay(state));
    state = playCard(state, options[Math.floor(random() * options.length)]);
  }
  return playedCards(state);
}

function sameRecord(a: BoardRecord, b: BoardRecord): void {
  expect(b.boardNumber).toBe(a.boardNumber);
  expect(b.dealer).toBe(a.dealer);
  expect(b.vulnerability).toBe(a.vulnerability);
  expect(b.hands.map((hand) => [...hand])).toEqual(
    a.hands.map((hand) => [...hand]),
  );
  expect(b.auction.dealer).toBe(a.auction.dealer);
  expect(b.auction.entries).toEqual(a.auction.entries);
  expect(b.trace).toEqual(a.trace);
}

describe("shareable board codes", () => {
  it("round trips complete boards", () => {
    const random = seededRandom(31337);
    let longest = 0;
    let total = 0;
    let boards = 0;

    for (let boardNumber = 1; boardNumber <= 40; boardNumber += 1) {
      const board = createBoard(boardNumber, random);
      const auction = runAuction(board.hands, board.dealer);
      const record: BoardRecord = {
        boardNumber,
        dealer: board.dealer,
        vulnerability: board.vulnerability,
        hands: board.hands,
        auction,
        trace: randomTrace(board.hands, auction, random),
      };

      const code = encodeBoard(record);
      sameRecord(record, decodeBoard(code));

      // Codes have to stay short enough to paste around.
      expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
      longest = Math.max(longest, code.length);
      total += code.length;
      boards += 1;
    }

    expect(longest).toBeLessThan(120);
    console.log(
      `board codes: ${Math.round(total / boards)} characters on average, ${longest} at most`,
    );
  });

  it("round trips a passed out board", () => {
    const board = createBoard(7, seededRandom(5));
    let auction = createAuction(board.dealer);
    for (let i = 0; i < 4; i += 1)
      auction = makeCall(auction, { kind: "pass" });

    const record: BoardRecord = {
      boardNumber: 7,
      dealer: board.dealer,
      vulnerability: board.vulnerability,
      hands: board.hands,
      auction,
      trace: [],
    };
    sameRecord(record, decodeBoard(encodeBoard(record)));
  });

  it("round trips a doubled contract", () => {
    const board = createBoard(2, seededRandom(11));
    let auction = createAuction(Seat.North);
    auction = makeCall(auction, { kind: "bid", level: 4, strain: 0 });
    auction = makeCall(auction, { kind: "double" });
    auction = makeCall(auction, { kind: "redouble" });
    auction = makeCall(auction, { kind: "pass" });
    auction = makeCall(auction, { kind: "pass" });
    auction = makeCall(auction, { kind: "pass" });

    const record: BoardRecord = {
      boardNumber: 2,
      dealer: Seat.North,
      vulnerability: board.vulnerability,
      hands: board.hands,
      auction,
      trace: [],
    };
    const decoded = decodeBoard(encodeBoard(record));
    sameRecord(record, decoded);
    expect(auctionResult(decoded.auction)!.doubled).toBe("redoubled");
  });

  it("rejects codes it cannot trust", () => {
    expect(() => decodeBoard("")).toThrow();
    expect(() => decodeBoard("AAAA")).toThrow();
    // A valid code with a byte knocked out must not decode to a plausible board.
    const board = createBoard(1, seededRandom(2));
    const auction = runAuction(board.hands, board.dealer);
    const code = encodeBoard({
      boardNumber: 1,
      dealer: board.dealer,
      vulnerability: board.vulnerability,
      hands: board.hands,
      auction,
      trace: [],
    });
    expect(() => decodeBoard(code.slice(0, 6))).toThrow();
  });
});
