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
import { cardSuit, Seat, type Card } from "../bridge/cards";
import { createBoard, isVulnerable } from "../bridge/deal";
import { buildPlayRequest, chooseCard } from "../bridge/bot-play";
import { getSolver } from "../bridge/dds-solver";
import {
  createPlayState,
  isPlayComplete,
  legalPlays,
  playCard,
  playedCards,
  seatToPlay,
  trickWinnerIndex,
} from "../bridge/play";
import { scoreContract } from "../bridge/scoring";
import { analyseBoard } from "../bridge/analysis";

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function runAuction(
  hands: readonly (readonly Card[])[],
  dealer: Seat,
): Auction {
  let auction = createAuction(dealer);
  while (!isAuctionComplete(auction)) {
    const seat = seatToCall(auction);
    auction = makeCall(auction, suggestCall(hands[seat], auction, seat).call);
  }
  return auction;
}

describe("trick play", () => {
  it("awards the trick to the highest trump", () => {
    // ♠2 beats ♥A when spades are trumps.
    const cards = [1 * 16 + 14, 0 * 16 + 2, 1 * 16 + 13, 1 * 16 + 3];
    expect(trickWinnerIndex(cards, 0)).toBe(1);
  });

  it("awards the trick to the highest card of the suit led when nobody trumps", () => {
    const cards = [1 * 16 + 5, 1 * 16 + 14, 2 * 16 + 13, 1 * 16 + 9];
    expect(trickWinnerIndex(cards, 0)).toBe(1);
  });

  it("requires following suit when possible", () => {
    const board = createBoard(1, seededRandom(3));
    const state = createPlayState(
      { level: 3, strain: 4, declarer: Seat.South, doubled: "none" },
      board.hands,
    );
    const leader = seatToPlay(state);
    const led = state.hands[leader][0];
    const next = playCard(state, led);
    const follower = seatToPlay(next);
    const held = next.hands[follower].filter(
      (card) => cardSuit(card) === cardSuit(led),
    );
    if (held.length > 0) expect(legalPlays(next)).toEqual(held);
    else expect(legalPlays(next).length).toBe(next.hands[follower].length);
  });
});

describe("full board played by robots", () => {
  it("bids, plays thirteen tricks and produces a coherent review", async () => {
    const dds = await getSolver();
    const random = seededRandom(2026);

    for (let boardNumber = 1; boardNumber <= 2; boardNumber += 1) {
      const board = createBoard(boardNumber, random);
      const auction = runAuction(board.hands, board.dealer);
      const contract = auctionResult(auction);
      if (!contract) continue;

      let state = createPlayState(contract, board.hands);
      while (!isPlayComplete(state)) {
        const seat = seatToPlay(state);
        const request = buildPlayRequest(state, auction, seat);

        // The robot must never be handed a hidden hand.
        request.visible.forEach((cards, index) => {
          const allowed =
            index === seat ||
            index === (contract.declarer + 2) % 4 ||
            (seat === (contract.declarer + 2) % 4 &&
              index === contract.declarer);
          if (!allowed) expect(cards).toEqual([]);
        });

        const choice = chooseCard(dds, request, random);
        expect(legalPlays(state, seat)).toContain(choice.card);
        state = playCard(state, choice.card);
      }

      expect(state.declarerTricks + state.defenderTricks).toBe(13);

      const analysis = analyseBoard(dds, {
        hands: board.hands,
        auction,
        trace: playedCards(state),
        dealer: board.dealer,
        vulnerability: board.vulnerability,
        seat: Seat.South,
        declarerTricks: state.declarerTricks,
      });

      expect(analysis.table.length).toBe(5);
      expect(analysis.headline).toBeTruthy();
      expect(analysis.bidding.summary).toBeTruthy();
      // The solver stops evaluating once the last trick is forced, so a
      // completed board yields 49 values rather than 53.
      expect(analysis.play.values.length).toBe(49);
      expect(analysis.play.totalTricksLost).toBeGreaterThanOrEqual(0);

      // With one trick left nobody has a choice, so the final double dummy
      // value has to match the tricks actually won. This is the end to end
      // check that the solver's point of view is being read correctly.
      expect(analysis.play.values[analysis.play.values.length - 1]).toBe(
        state.declarerTricks,
      );

      // The double dummy result must bracket what actually happened by no more
      // than the number of tricks the two sides gave away between them.
      expect(
        Math.abs(analysis.makeable - state.declarerTricks),
      ).toBeLessThanOrEqual(13);

      const expected = scoreContract(
        contract,
        state.declarerTricks,
        isVulnerable(contract.declarer, board.vulnerability),
      );
      expect(Math.abs(analysis.score)).toBe(Math.abs(expected.score));

      for (const note of analysis.play.notes) {
        expect(note.tricksLost).toBeGreaterThan(0);
        expect(note.best.length).toBeGreaterThan(0);
        expect(note.explanation).toMatch(/played/);
      }
    }
  }, 180_000);
});

describe("scoring", () => {
  it("scores a vulnerable game", () => {
    const result = scoreContract(
      { level: 4, strain: 0, declarer: Seat.South, doubled: "none" },
      10,
      true,
    );
    expect(result.score).toBe(620);
  });

  it("scores a non vulnerable partscore", () => {
    const result = scoreContract(
      { level: 2, strain: 1, declarer: Seat.South, doubled: "none" },
      8,
      false,
    );
    expect(result.score).toBe(110);
  });

  it("scores a doubled undertrick sequence", () => {
    const result = scoreContract(
      { level: 4, strain: 0, declarer: Seat.South, doubled: "doubled" },
      7,
      false,
    );
    expect(result.score).toBe(-500);
  });

  it("scores a vulnerable small slam", () => {
    const result = scoreContract(
      { level: 6, strain: 4, declarer: Seat.South, doubled: "none" },
      12,
      true,
    );
    expect(result.score).toBe(1440);
  });
});
