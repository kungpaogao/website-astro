import { describe, expect, it } from "vitest";
import {
  auctionResult,
  bidRank,
  callToString,
  createAuction,
  isAuctionComplete,
  isLegalCall,
  makeCall,
  seatToCall,
  type Auction,
} from "../bridge/auction";
import { Seat, Strain, Suit } from "../bridge/cards";
import { dealHands, handsFromStrings, type Hands } from "../bridge/deal";
import { suggestCall } from "../bridge/bidding";
import { evaluateHand } from "../bridge/evaluation";

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/** Bids a whole board with the engine sitting in all four seats. */
function runAuction(hands: Hands, dealer: Seat): Auction {
  let auction = createAuction(dealer);
  for (let i = 0; i < 60 && !isAuctionComplete(auction); i += 1) {
    const seat = seatToCall(auction);
    auction = makeCall(auction, suggestCall(hands[seat], auction, seat).call);
  }
  return auction;
}

function openingFor(cards: string): string {
  const hands = handsFromStrings(cards, "...", "...", "...");
  // Only the first hand matters; give the auction to North as dealer.
  return callToString(
    suggestCall(hands[Seat.North], createAuction(Seat.North), Seat.North).call,
  );
}

describe("auction mechanics", () => {
  // The numeric Suit values run spades..clubs to match the solver, which is the
  // opposite of bidding order, so this ordering is easy to get backwards.
  it("orders denominations clubs low through notrump high", () => {
    const order = [
      Strain.Clubs,
      Strain.Diamonds,
      Strain.Hearts,
      Strain.Spades,
      Strain.NoTrump,
    ];
    for (let i = 1; i < order.length; i += 1) {
      expect(
        bidRank({ kind: "bid", level: 1, strain: order[i] }),
      ).toBeGreaterThan(
        bidRank({ kind: "bid", level: 1, strain: order[i - 1] }),
      );
    }
    expect(
      bidRank({ kind: "bid", level: 2, strain: Strain.Clubs }),
    ).toBeGreaterThan(
      bidRank({ kind: "bid", level: 1, strain: Strain.NoTrump }),
    );
  });

  it("only allows a bid that is higher than the last one", () => {
    let auction = createAuction(Seat.North);
    auction = makeCall(auction, {
      kind: "bid",
      level: 1,
      strain: Strain.Hearts,
    });
    expect(
      isLegalCall(auction, { kind: "bid", level: 1, strain: Strain.Spades }),
    ).toBe(true);
    expect(
      isLegalCall(auction, { kind: "bid", level: 1, strain: Strain.Diamonds }),
    ).toBe(false);
    expect(
      isLegalCall(auction, { kind: "bid", level: 2, strain: Strain.Clubs }),
    ).toBe(true);
  });

  it("allows doubles of opponents only, and redoubles of doubles", () => {
    let auction = createAuction(Seat.North);
    auction = makeCall(auction, {
      kind: "bid",
      level: 1,
      strain: Strain.Hearts,
    });
    // East may double North.
    expect(isLegalCall(auction, { kind: "double" })).toBe(true);
    auction = makeCall(auction, { kind: "double" });
    // South may redouble their partner's contract.
    expect(isLegalCall(auction, { kind: "redouble" })).toBe(true);
    expect(isLegalCall(auction, { kind: "double" })).toBe(false);
  });

  it("ends after three passes but not before everyone has called", () => {
    let auction = createAuction(Seat.North);
    auction = makeCall(auction, {
      kind: "bid",
      level: 1,
      strain: Strain.NoTrump,
    });
    auction = makeCall(auction, { kind: "pass" });
    auction = makeCall(auction, { kind: "pass" });
    expect(isAuctionComplete(auction)).toBe(false);
    auction = makeCall(auction, { kind: "pass" });
    expect(isAuctionComplete(auction)).toBe(true);
    expect(auctionResult(auction)).toMatchObject({
      level: 1,
      strain: Strain.NoTrump,
      declarer: Seat.North,
    });
  });

  it("needs four passes to throw the board in", () => {
    let auction = createAuction(Seat.North);
    for (let i = 0; i < 3; i += 1)
      auction = makeCall(auction, { kind: "pass" });
    expect(isAuctionComplete(auction)).toBe(false);
    auction = makeCall(auction, { kind: "pass" });
    expect(isAuctionComplete(auction)).toBe(true);
    expect(auctionResult(auction)).toBeUndefined();
  });

  it("makes the first player to name the strain declarer, not the last bidder", () => {
    let auction = createAuction(Seat.North);
    // North opens 1S, South raises to 4S: North declares.
    auction = makeCall(auction, {
      kind: "bid",
      level: 1,
      strain: Strain.Spades,
    });
    auction = makeCall(auction, { kind: "pass" });
    auction = makeCall(auction, {
      kind: "bid",
      level: 4,
      strain: Strain.Spades,
    });
    auction = makeCall(auction, { kind: "pass" });
    auction = makeCall(auction, { kind: "pass" });
    auction = makeCall(auction, { kind: "pass" });
    expect(auctionResult(auction)!.declarer).toBe(Seat.North);
  });
});

describe("hand evaluation", () => {
  it("counts high card points and shape", () => {
    const hands = handsFromStrings("AKQ.J32.5432.876", "...", "...", "...");
    const evaluation = evaluateHand(hands[Seat.North]);
    expect(evaluation.hcp).toBe(10);
    expect(evaluation.lengths).toEqual([3, 3, 4, 3]);
    expect(evaluation.balanced).toBe(true);
  });

  it("recognises unbalanced hands", () => {
    const hands = handsFromStrings("AKQJ98.K32.5.876", "...", "...", "...");
    expect(evaluateHand(hands[Seat.North]).balanced).toBe(false);
  });
});

describe("opening bids", () => {
  it("opens 1NT with a balanced 15-17", () => {
    expect(openingFor("KQ5.AJ32.KJ5.Q42")).toBe("1NT");
  });

  it("opens 2NT with a balanced 20-21", () => {
    expect(openingFor("AKQ.AJ32.KJ5.Q42")).toBe("2NT");
  });

  it("opens 2♣ with a huge hand", () => {
    expect(openingFor("AKQ.AKQ2.AK5.KQ2")).toBe("2♣");
  });

  it("opens a five card major", () => {
    expect(openingFor("AKQ82.K32.J54.72")).toBe("1♠");
  });

  it("opens the better minor without a five card suit", () => {
    expect(openingFor("AK52.K932.QJ4.72")).toBe("1♦");
  });

  it("opens a weak two with a good six card suit and a weak hand", () => {
    expect(openingFor("KQJ982.432.54.72")).toBe("2♠");
  });

  it("preempts at the three level with a seven card suit", () => {
    expect(openingFor("KQJ9842.43.54.72")).toBe("3♠");
  });

  it("passes a bust hand", () => {
    expect(openingFor("8432.976.J54.732")).toBe("Pass");
  });
});

describe("responses", () => {
  it("transfers with five hearts opposite 1NT", () => {
    let auction = createAuction(Seat.North);
    const hands = handsFromStrings(
      "KQ5.AJ32.KJ5.Q42",
      "...",
      "8.KQ654.9876.432",
      "...",
    );
    auction = makeCall(
      auction,
      suggestCall(hands[Seat.North], auction, Seat.North).call,
    );
    auction = makeCall(auction, { kind: "pass" });
    const response = suggestCall(hands[Seat.South], auction, Seat.South);
    expect(callToString(response.call)).toBe("2♦");
    expect(response.reason).toMatch(/[Tt]ransfer/);
  });

  it("raises partner's major with support and a limit raise", () => {
    let auction = createAuction(Seat.North);
    const hands = handsFromStrings(
      "AKQ82.K32.J54.72",
      "...",
      "J43.QJ5.KQ32.K65",
      "...",
    );
    auction = makeCall(
      auction,
      suggestCall(hands[Seat.North], auction, Seat.North).call,
    );
    auction = makeCall(auction, { kind: "pass" });
    expect(
      callToString(suggestCall(hands[Seat.South], auction, Seat.South).call),
    ).toBe("3♠");
  });

  it("passes a hand too weak to respond", () => {
    let auction = createAuction(Seat.North);
    const hands = handsFromStrings(
      "AKQ82.K32.J54.72",
      "...",
      "43.J54.9832.9654",
      "...",
    );
    auction = makeCall(
      auction,
      suggestCall(hands[Seat.North], auction, Seat.North).call,
    );
    auction = makeCall(auction, { kind: "pass" });
    expect(
      callToString(suggestCall(hands[Seat.South], auction, Seat.South).call),
    ).toBe("Pass");
  });
});

describe("competitive bidding", () => {
  it("makes a takeout double of an opposing opening", () => {
    let auction = createAuction(Seat.North);
    const hands = handsFromStrings("...", "AQ54.KJ32.KQ54.2", "...", "...");
    auction = makeCall(auction, {
      kind: "bid",
      level: 1,
      strain: Strain.Clubs,
    });
    const suggestion = suggestCall(hands[Seat.East], auction, Seat.East);
    expect(callToString(suggestion.call)).toBe("X");
    expect(suggestion.reason).toMatch(/takeout/i);
  });

  it("overcalls with a good suit", () => {
    let auction = createAuction(Seat.North);
    const hands = handsFromStrings("...", "AQJ98.K32.542.72", "...", "...");
    auction = makeCall(auction, {
      kind: "bid",
      level: 1,
      strain: Strain.Clubs,
    });
    expect(
      callToString(suggestCall(hands[Seat.East], auction, Seat.East).call),
    ).toBe("1♠");
  });
});

describe("full auctions", () => {
  it("always terminates and produces a legal contract", () => {
    const random = seededRandom(99);
    let contracts = 0;
    let passedOut = 0;

    for (let board = 1; board <= 200; board += 1) {
      const hands = dealHands(random);
      const dealer = ((board - 1) % 4) as Seat;
      const auction = runAuction(hands, dealer);

      expect(isAuctionComplete(auction)).toBe(true);
      // A runaway auction would mean two robots bidding at each other forever.
      expect(auction.entries.length).toBeLessThan(30);

      const contract = auctionResult(auction);
      if (contract) {
        contracts += 1;
        expect(contract.level).toBeGreaterThanOrEqual(1);
        expect(contract.level).toBeLessThanOrEqual(7);
      } else {
        passedOut += 1;
      }
    }

    // Most boards have an opening bid somewhere, so passouts should be rare.
    expect(contracts).toBeGreaterThan(150);
    expect(passedOut).toBeLessThan(50);
  });

  it("reaches game on a strong partnership hand", () => {
    const hands = handsFromStrings(
      "AKQ82.K32.A54.72",
      "543.J954.KQ2.J93",
      "JT94.AQ5.J93.A64",
      "76.876.T876.KQ85",
    );
    const auction = runAuction(hands, Seat.North);
    const contract = auctionResult(auction);
    expect(contract).toBeDefined();
    expect(contract!.strain).toBe(Suit.Spades);
    expect(contract!.level).toBeGreaterThanOrEqual(3);
  });
});
