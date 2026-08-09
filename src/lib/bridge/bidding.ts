/**
 * A rule based bidding engine in the Standard American / SAYC idiom.
 *
 * It serves two purposes: the three robots use it to bid, and the review panel
 * uses it to say what a textbook partner would have called with your cards. That
 * is why every suggestion carries a `reason` — the explanation is the product,
 * not a debugging aid.
 *
 * It is deliberately a competent club player rather than an expert: natural
 * openings, standard responses and rebids, Stayman and Jacoby transfers over
 * notrump, takeout doubles and simple competitive bidding.
 */

import {
  bid,
  bidRank,
  callToString,
  isLegalCall,
  lastBidEntry,
  PASS,
  DOUBLE,
  seatToCall,
  type Auction,
  type AuctionEntry,
  type Call,
} from "./auction";
import {
  isSameSide,
  partnerOf,
  Seat,
  STRAIN_SYMBOLS,
  Strain,
  Suit,
  SUITS,
  SUIT_SYMBOLS,
  type Card,
} from "./cards";
import {
  evaluateHand,
  hasStopper,
  isMajor,
  isMinor,
  shortnessPoints,
  suitQuality,
  type HandEvaluation,
} from "./evaluation";

export interface Suggestion {
  call: Call;
  reason: string;
}

/** Inferred point range for a partner, in high card points. */
export interface Range {
  min: number;
  max: number;
}

const UNKNOWN_RANGE: Range = { min: 0, max: 40 };

const GAME_POINTS = 25;
const MINOR_GAME_POINTS = 29;
const SLAM_POINTS = 33;
const GRAND_SLAM_POINTS = 37;

interface View {
  auction: Auction;
  seat: Seat;
  entries: AuctionEntry[];
  mine: AuctionEntry[];
  partner: AuctionEntry[];
  opponents: AuctionEntry[];
  /** First bid of the auction, whoever made it. */
  opening?: AuctionEntry;
  /** Suits named by the opponents, in the order they were bid. */
  opponentSuits: Suit[];
  /** Suits named by our side. */
  ourSuits: Suit[];
  highest?: AuctionEntry;
}

function buildView(auction: Auction, seat: Seat): View {
  const entries = auction.entries;
  const bids = entries.filter((entry) => entry.call.kind === "bid");
  const suitsFrom = (list: AuctionEntry[]) =>
    list
      .filter(
        (entry) =>
          entry.call.kind === "bid" && entry.call.strain !== Strain.NoTrump,
      )
      .map((entry) => entry.call.strain as Suit);

  const opponents = entries.filter((entry) => !isSameSide(entry.seat, seat));
  const ours = entries.filter((entry) => isSameSide(entry.seat, seat));

  return {
    auction,
    seat,
    entries,
    mine: entries.filter((entry) => entry.seat === seat),
    partner: entries.filter((entry) => entry.seat === partnerOf(seat)),
    opponents,
    opening: bids[0],
    opponentSuits: suitsFrom(opponents),
    ourSuits: suitsFrom(ours),
    highest: lastBidEntry(auction),
  };
}

function lastBidOf(entries: AuctionEntry[]): Call | undefined {
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    if (entries[i].call.kind === "bid") return entries[i].call;
  }
  return undefined;
}

function firstBidOf(entries: AuctionEntry[]): Call | undefined {
  return entries.find((entry) => entry.call.kind === "bid")?.call;
}

function cheapest(auction: Auction, strain: Strain): Call | undefined {
  for (let level = 1; level <= 7; level += 1) {
    const call = bid(level, strain);
    if (isLegalCall(auction, call)) return call;
  }
  return undefined;
}

/** The cheapest bid in `strain`, raised by `jumps` extra levels. */
function jump(
  auction: Auction,
  strain: Strain,
  jumps: number,
): Call | undefined {
  const base = cheapest(auction, strain);
  if (!base) return undefined;
  const level = base.level! + jumps;
  return level <= 7 ? bid(level, strain) : undefined;
}

function at(auction: Auction, level: number, strain: Strain): Call | undefined {
  const call = bid(level, strain);
  return isLegalCall(auction, call) ? call : undefined;
}

/** Best fit our side has shown, as [suit, combined length] when eight or more. */
function bestFit(
  hand: HandEvaluation,
  partnerLengths: number[],
): Suit | undefined {
  let best: Suit | undefined;
  let bestLength = 7;
  for (const suit of SUITS) {
    const combined = hand.lengths[suit] + partnerLengths[suit];
    const better =
      combined > bestLength ||
      (combined === bestLength &&
        best !== undefined &&
        isMajor(suit) &&
        !isMajor(best));
    if (combined >= 8 && better) {
      best = suit;
      bestLength = combined;
    }
  }
  return best;
}

// --------------------------------------------------------------------------
// Interpreting partner's calls
// --------------------------------------------------------------------------

interface PartnerPicture {
  range: Range;
  /** Minimum length partner has promised in each suit. */
  lengths: number[];
  opened: boolean;
  openingCall?: Call;
  balanced: boolean;
}

/**
 * Reads partner's calls through the same system the robots bid, producing the
 * strength and shape inferences the rest of the engine reasons about.
 */
function readPartner(view: View): PartnerPicture {
  const picture: PartnerPicture = {
    range: { ...UNKNOWN_RANGE },
    lengths: [0, 0, 0, 0],
    opened: false,
    balanced: false,
  };

  const calls = view.partner;
  if (calls.length === 0) return picture;

  const partnerOpened =
    view.opening !== undefined && view.opening.seat === partnerOf(view.seat);
  picture.opened = partnerOpened;

  const opening = firstBidOf(calls);
  picture.openingCall = opening;

  if (partnerOpened && opening) {
    const { level, strain } = opening;
    if (level === 1 && strain === Strain.NoTrump) {
      picture.range = { min: 15, max: 17 };
      picture.balanced = true;
      SUITS.forEach((suit) => (picture.lengths[suit] = 2));
    } else if (level === 2 && strain === Strain.NoTrump) {
      picture.range = { min: 20, max: 21 };
      picture.balanced = true;
      SUITS.forEach((suit) => (picture.lengths[suit] = 2));
    } else if (level === 2 && strain === Strain.Clubs) {
      picture.range = { min: 22, max: 40 };
    } else if (level === 1) {
      picture.range = { min: 12, max: 21 };
      if (strain !== Strain.NoTrump) {
        picture.lengths[strain as Suit] = isMajor(strain as Suit) ? 5 : 3;
      }
    } else if (level === 2) {
      picture.range = { min: 5, max: 10 };
      picture.lengths[strain as Suit] = 6;
    } else {
      picture.range = { min: 5, max: 10 };
      picture.lengths[strain as Suit] = level + 4;
    }
  } else if (opening) {
    // Partner overcalled, doubled or responded rather than opened.
    const doubled = calls.some((entry) => entry.call.kind === "double");
    if (doubled) picture.range = { min: 12, max: 21 };
    else if (opening.strain === Strain.NoTrump)
      picture.range = { min: 15, max: 18 };
    else {
      picture.range = { min: opening.level >= 2 ? 11 : 8, max: 17 };
      picture.lengths[opening.strain as Suit] = 5;
    }
  } else if (calls.some((entry) => entry.call.kind === "double")) {
    picture.range = { min: 12, max: 21 };
  } else {
    // Partner has only passed.
    picture.range = { min: 0, max: view.opening ? 11 : 11 };
  }

  // Refine using partner's later calls, which respond to our own bidding.
  const ourOpening = view.opening;
  const weOpened = ourOpening !== undefined && ourOpening.seat === view.seat;
  if (weOpened) {
    const response = calls.find((entry) => entry.call.kind !== "pass")?.call;
    if (!response) {
      picture.range = { min: 0, max: 5 };
    } else if (response.kind === "bid") {
      const openedStrain = ourOpening.call.strain!;
      const raised = response.strain === openedStrain;
      if (raised && response.level === 2) picture.range = { min: 6, max: 9 };
      else if (raised && response.level === 3)
        picture.range = { min: 10, max: 12 };
      else if (raised && response.level === 4)
        picture.range = { min: 13, max: 16 };
      else if (response.strain === Strain.NoTrump && response.level === 1)
        picture.range = { min: 6, max: 10 };
      else if (response.strain === Strain.NoTrump && response.level === 2)
        picture.range = { min: 11, max: 12 };
      else if (response.strain === Strain.NoTrump && response.level === 3)
        picture.range = { min: 13, max: 15 };
      else if (response.level === 1) picture.range = { min: 6, max: 21 };
      else picture.range = { min: 11, max: 21 };

      if (response.strain !== Strain.NoTrump) {
        const suit = response.strain as Suit;
        picture.lengths[suit] = Math.max(
          picture.lengths[suit],
          raised ? response.level + 1 : 4,
        );
      }
    }
  }

  // Any suit partner has bid twice is at least six long. Artificial calls are
  // skipped: a completed transfer or a Stayman denial says nothing about shape.
  const artificial = artificialCalls(view);
  const bidSuits = calls.filter(
    (entry) =>
      entry.call.kind === "bid" &&
      entry.call.strain !== Strain.NoTrump &&
      !artificial.has(entry.call),
  );
  for (const suit of SUITS) {
    const times = bidSuits.filter((entry) => entry.call.strain === suit).length;
    if (times >= 2) picture.lengths[suit] = Math.max(picture.lengths[suit], 6);
    else if (times === 1)
      picture.lengths[suit] = Math.max(picture.lengths[suit], 4);
  }

  return picture;
}

/**
 * Calls in the auction that are conventions rather than natural suit bids, so
 * that no length is inferred from them.
 */
function artificialCalls(view: View): Set<Call> {
  const artificial = new Set<Call>();
  const opening = view.opening;
  if (
    !opening ||
    opening.call.strain !== Strain.NoTrump ||
    opening.call.level > 2
  ) {
    return artificial;
  }

  const base = opening.call.level + 1;
  const openerSeat = opening.seat;

  for (let i = 1; i < view.entries.length; i += 1) {
    const entry = view.entries[i];
    if (entry.seat !== openerSeat || entry.call.kind !== "bid") continue;

    // Find the responder's call that this one answers.
    const previous = view.entries
      .slice(0, i)
      .reverse()
      .find(
        (candidate) =>
          candidate.seat === partnerOf(openerSeat) &&
          candidate.call.kind === "bid",
      );
    if (!previous) continue;

    const target = transferTarget(previous.call, base);
    if (
      target !== undefined &&
      entry.call.level === base &&
      entry.call.strain === target
    ) {
      artificial.add(entry.call);
      artificial.add(previous.call);
    }
    if (
      isStayman(previous.call, base) &&
      entry.call.level === base &&
      entry.call.strain === Strain.Diamonds
    ) {
      artificial.add(entry.call);
      artificial.add(previous.call);
    }
  }

  // Responder's first conventional call is artificial even before it is answered.
  const firstResponse = view.entries.find(
    (entry) =>
      entry.seat === partnerOf(openerSeat) && entry.call.kind === "bid",
  );
  if (
    firstResponse &&
    (isStayman(firstResponse.call, base) ||
      transferTarget(firstResponse.call, base) !== undefined)
  ) {
    artificial.add(firstResponse.call);
  }

  return artificial;
}

// --------------------------------------------------------------------------
// Openings
// --------------------------------------------------------------------------

function ruleOfTwenty(hand: HandEvaluation): boolean {
  const sorted = [...hand.lengths].sort((a, b) => b - a);
  return hand.hcp + sorted[0] + sorted[1] >= 20;
}

/** The minor to open when no five card suit and no notrump range fits. */
function betterMinor(hand: HandEvaluation): Suit {
  const { lengths } = hand;
  if (lengths[Suit.Diamonds] > lengths[Suit.Clubs]) return Suit.Diamonds;
  if (lengths[Suit.Clubs] > lengths[Suit.Diamonds]) return Suit.Clubs;
  return lengths[Suit.Clubs] >= 4 ? Suit.Diamonds : Suit.Clubs;
}

function openingSuit(hand: HandEvaluation): Suit {
  const majors = hand.longSuits.filter(isMajor);
  if (majors.length > 0) return majors[0];
  const minors = hand.longSuits.filter(isMinor);
  if (minors.length > 0) return minors[0];
  const fourMajors = hand.majors;
  if (hand.lengths[Suit.Spades] >= 5) return Suit.Spades;
  if (fourMajors.length === 0 || hand.hcp >= 12) return betterMinor(hand);
  return betterMinor(hand);
}

function openingCall(
  hand: HandEvaluation,
  cards: readonly Card[],
  view: View,
): Suggestion {
  const auction = view.auction;
  const passesBefore = view.entries.length;

  if (hand.hcp >= 22) {
    return {
      call: bid(2, Strain.Clubs),
      reason: `${hand.hcp} HCP is far too strong for a one bid, so open an artificial, game forcing 2♣.`,
    };
  }

  if (hand.balanced && hand.hcp >= 20 && hand.hcp <= 21) {
    return {
      call: bid(2, Strain.NoTrump),
      reason: `Balanced with ${hand.hcp} HCP — 2NT shows 20-21.`,
    };
  }

  if (hand.balanced && hand.hcp >= 15 && hand.hcp <= 17) {
    return {
      call: bid(1, Strain.NoTrump),
      reason: `Balanced with ${hand.hcp} HCP — a textbook 1NT opening (15-17).`,
    };
  }

  const openable =
    hand.withLength >= 13 || (hand.hcp >= 12 && ruleOfTwenty(hand));
  if (openable) {
    const suit = openingSuit(hand);
    const length = hand.lengths[suit];
    const rationale = isMajor(suit)
      ? `${length} card ${SUIT_SYMBOLS[suit]} suit`
      : length >= 5
        ? `${length} card ${SUIT_SYMBOLS[suit]} suit`
        : `no five card suit, so open the better minor`;
    return {
      call: bid(1, suit),
      reason: `${hand.hcp} HCP with ${rationale} — open 1${SUIT_SYMBOLS[suit]}.`,
    };
  }

  // Preempts. A long suit and not enough for an opening bid.
  if (hand.hcp >= 5 && hand.hcp <= 10) {
    const seven = SUITS.find((suit) => hand.lengths[suit] >= 7);
    if (seven !== undefined && suitQuality(cards, seven) >= 9) {
      const level = hand.lengths[seven] >= 8 ? 4 : 3;
      const call = at(auction, level, seven);
      if (call && (level < 4 || isMajor(seven))) {
        return {
          call,
          reason: `${hand.lengths[seven]} card ${SUIT_SYMBOLS[seven]} suit with only ${hand.hcp} HCP — preempt to take away their bidding room.`,
        };
      }
    }

    const six = SUITS.find(
      (suit) =>
        hand.lengths[suit] === 6 &&
        suit !== Suit.Clubs &&
        suitQuality(cards, suit) >= 8,
    );
    if (six !== undefined && hand.majors.every((major) => major === six)) {
      const call = at(auction, 2, six);
      if (call) {
        return {
          call,
          reason: `A good six card ${SUIT_SYMBOLS[six]} suit with ${hand.hcp} HCP — a weak two describes the hand in one bid.`,
        };
      }
    }
  }

  // Fourth seat: only open when the hand rates to be worth a plus score.
  if (passesBefore === 3 && hand.hcp + hand.lengths[Suit.Spades] >= 15) {
    const suit = openingSuit(hand);
    return {
      call: bid(1, suit),
      reason: `In fourth seat the rule of fifteen (${hand.hcp} HCP + ${hand.lengths[Suit.Spades]} spades) says this is worth opening.`,
    };
  }

  return {
    call: PASS,
    reason: `Only ${hand.hcp} HCP with no long suit to preempt — pass.`,
  };
}

// --------------------------------------------------------------------------
// Responding to partner's opening
// --------------------------------------------------------------------------

function respondToNotrump(
  hand: HandEvaluation,
  view: View,
  openingLevel: number,
): Suggestion | undefined {
  const auction = view.auction;
  const base = openingLevel === 1 ? 2 : 3;
  const longMajor = hand.majors.find((suit) => hand.lengths[suit] >= 5);
  const invitational = openingLevel === 1 ? 8 : 4;
  const gameGoing = openingLevel === 1 ? 10 : 5;

  if (longMajor !== undefined) {
    // Jacoby transfer: bid the suit below the one you hold.
    const transferStrain =
      longMajor === Suit.Hearts ? Strain.Diamonds : Strain.Hearts;
    const call = at(auction, base, transferStrain);
    if (call) {
      return {
        call,
        reason: `Transfer to ${SUIT_SYMBOLS[longMajor]}: ${base}${STRAIN_SYMBOLS[transferStrain]} asks partner to bid ${SUIT_SYMBOLS[longMajor]} so the strong hand stays hidden.`,
      };
    }
  }

  if (
    hand.hcp >= invitational &&
    hand.majors.length > 0 &&
    longMajor === undefined
  ) {
    const call = at(auction, base, Strain.Clubs);
    if (call) {
      return {
        call,
        reason: `Stayman: ${base}♣ asks for a four card major before settling on notrump.`,
      };
    }
  }

  if (hand.hcp >= SLAM_POINTS - (openingLevel === 1 ? 16 : 20)) {
    const call = at(auction, 6, Strain.NoTrump);
    if (call)
      return {
        call,
        reason: `Enough combined strength for a small slam in notrump.`,
      };
  }

  if (hand.hcp >= gameGoing) {
    const call = at(auction, 3, Strain.NoTrump);
    if (call) {
      return {
        call,
        reason: `${hand.hcp} HCP opposite a notrump opening is enough for game — bid 3NT.`,
      };
    }
  }

  if (hand.hcp >= invitational) {
    const call = at(auction, openingLevel + 1, Strain.NoTrump);
    if (call) {
      return {
        call,
        reason: `${hand.hcp} HCP is invitational — raise and let partner decide about game.`,
      };
    }
  }

  return {
    call: PASS,
    reason: `Only ${hand.hcp} HCP — there is no game, so leave partner in a good contract.`,
  };
}

function respondToSuitOpening(
  hand: HandEvaluation,
  cards: readonly Card[],
  view: View,
  opening: Call,
): Suggestion {
  const auction = view.auction;
  const openedSuit = opening.strain as Suit;
  const support = hand.lengths[openedSuit];
  const supportPoints =
    hand.hcp + (support >= 3 ? shortnessPoints(hand.lengths, openedSuit) : 0);

  if (opening.level >= 2) {
    // Partner preempted or opened a strong 2♣.
    if (opening.level === 2 && openedSuit === Suit.Clubs) {
      if (hand.hcp >= 8 && hand.longSuits.length > 0) {
        const call = cheapest(auction, hand.longSuits[0]);
        if (call)
          return {
            call,
            reason: `A positive response showing ${hand.hcp} HCP and a real suit.`,
          };
      }
      const waiting = at(auction, 2, Strain.Diamonds);
      if (waiting) {
        return {
          call: waiting,
          reason: `2♦ is the standard waiting response — it says nothing and lets partner describe.`,
        };
      }
    }

    if (support >= 3 && hand.hcp >= 15) {
      const call = cheapest(auction, openedSuit);
      const game = at(auction, isMajor(openedSuit) ? 4 : 5, openedSuit);
      if (game && hand.hcp >= 17) {
        return {
          call: game,
          reason: `${hand.hcp} HCP opposite a preempt with ${support} card support — take the shot at game.`,
        };
      }
      if (call)
        return {
          call,
          reason: `Support with extra values, so raise the preempt.`,
        };
    }
    return {
      call: PASS,
      reason: `Partner has described a weak hand with a long suit; ${hand.hcp} HCP is not enough to move.`,
    };
  }

  if (hand.hcp < 6) {
    return {
      call: PASS,
      reason: `Fewer than 6 HCP — pass and let partner play at a low level.`,
    };
  }

  // With a fit in partner's major, show it immediately.
  if (support >= 3 && isMajor(openedSuit)) {
    if (supportPoints >= 13) {
      const call = at(auction, 4, openedSuit);
      if (call) {
        return {
          call,
          reason: `${support} card support and ${supportPoints} support points — bid the game directly.`,
        };
      }
    }
    if (supportPoints >= 10) {
      const call = at(auction, 3, openedSuit);
      if (call) {
        return {
          call,
          reason: `A limit raise: ${support} card support with ${supportPoints} support points invites game.`,
        };
      }
    }
    const call = at(auction, 2, openedSuit);
    if (call) {
      return {
        call,
        reason: `${support} card support with ${supportPoints} support points — a simple raise shows 6-9.`,
      };
    }
  }

  // A new suit at the one level is cheap and keeps the auction alive.
  const oneLevel = SUITS.filter(
    (suit) =>
      suit !== openedSuit &&
      hand.lengths[suit] >= 4 &&
      at(auction, 1, suit) !== undefined,
  ).sort((a, b) => hand.lengths[b] - hand.lengths[a] || b - a);
  if (oneLevel.length > 0) {
    const suit = oneLevel[0];
    return {
      call: at(auction, 1, suit)!,
      reason: `Show the ${hand.lengths[suit]} card ${SUIT_SYMBOLS[suit]} suit at the one level — it costs nothing and may find a better fit.`,
    };
  }

  if (hand.hcp >= 12 && hand.longSuits.length > 0) {
    const suit = hand.longSuits[0];
    const call = cheapest(auction, suit);
    if (call && suit !== openedSuit) {
      return {
        call,
        reason: `${hand.hcp} HCP is worth a two level response, showing ${hand.lengths[suit]} ${SUIT_SYMBOLS[suit]}.`,
      };
    }
  }

  if (support >= 5 && isMinor(openedSuit) && hand.hcp <= 10) {
    const call = at(auction, 2, openedSuit);
    if (call)
      return {
        call,
        reason: `${support} card support for partner's minor with a weak hand — raise to show the fit.`,
      };
  }

  if (hand.hcp >= 13 && hand.balanced) {
    const call = at(auction, 3, Strain.NoTrump);
    if (call)
      return {
        call,
        reason: `${hand.hcp} HCP, balanced, no major fit — 3NT is the practical game.`,
      };
  }
  if (hand.hcp >= 11 && hand.balanced) {
    const call = at(auction, 2, Strain.NoTrump);
    if (call)
      return { call, reason: `${hand.hcp} HCP balanced — 2NT invites game.` };
  }

  const call = at(auction, 1, Strain.NoTrump);
  if (call) {
    return {
      call,
      reason: `${hand.hcp} HCP with no fit and nothing to bid at the one level — 1NT keeps the auction open.`,
    };
  }

  return { call: PASS, reason: `Nothing convenient to bid at this level.` };
}

// --------------------------------------------------------------------------
// Notrump follow-ups (Stayman and Jacoby transfers)
// --------------------------------------------------------------------------

/** The suit a transfer bid asks for, or undefined when the bid is not a transfer. */
function transferTarget(call: Call, base: number): Suit | undefined {
  if (call.kind !== "bid" || call.level !== base) return undefined;
  if (call.strain === Strain.Diamonds) return Suit.Hearts;
  if (call.strain === Strain.Hearts) return Suit.Spades;
  return undefined;
}

function isStayman(call: Call, base: number): boolean {
  return (
    call.kind === "bid" && call.level === base && call.strain === Strain.Clubs
  );
}

/** The response level opposite a 1NT or 2NT opening. */
function notrumpBase(opening: Call): number {
  return opening.level + 1;
}

/** Opener's answer to Stayman or a transfer. These calls are forced. */
function notrumpOpenerRebid(
  hand: HandEvaluation,
  view: View,
  opening: Call,
): Suggestion | undefined {
  const auction = view.auction;
  const partnerLast = lastBidOf(view.partner);
  if (!partnerLast) return undefined;
  const base = notrumpBase(opening);

  const target = transferTarget(partnerLast, base);
  if (target !== undefined) {
    const call = at(auction, base, target);
    if (call) {
      return {
        call,
        reason: `Partner transferred, so I am obliged to bid ${SUIT_SYMBOLS[target]} and let the strong hand stay concealed.`,
      };
    }
  }

  if (isStayman(partnerLast, base)) {
    const hearts = hand.lengths[Suit.Hearts] >= 4;
    const spades = hand.lengths[Suit.Spades] >= 4;
    if (hearts || spades) {
      // With both majors, bid hearts first so partner can still show spades.
      const suit = hearts ? Suit.Hearts : Suit.Spades;
      const call = at(auction, base, suit);
      if (call) {
        return {
          call,
          reason: `Answering Stayman: I do have four ${SUIT_SYMBOLS[suit]}.`,
        };
      }
    }
    const denial = at(auction, base, Strain.Diamonds);
    if (denial) {
      return {
        call: denial,
        reason: `Answering Stayman: ${base}♦ denies a four card major.`,
      };
    }
  }

  return undefined;
}

/** Responder's second call after Stayman or a transfer. */
function notrumpResponderRebid(
  hand: HandEvaluation,
  view: View,
  opening: Call,
  partner: PartnerPicture,
): Suggestion | undefined {
  const auction = view.auction;
  const base = notrumpBase(opening);
  const myBid = lastBidOf(view.mine);
  const partnerLast = lastBidOf(view.partner);
  if (!myBid || !partnerLast) return undefined;

  const invitational = opening.level === 1 ? 8 : 4;
  const gameGoing = opening.level === 1 ? 10 : 5;

  const target = transferTarget(myBid, base);
  if (target !== undefined && partnerLast.strain === target) {
    const length = hand.lengths[target];
    if (hand.hcp >= gameGoing && length >= 6) {
      const call = at(auction, 4, target);
      if (call) {
        return {
          call,
          reason: `With ${length} ${SUIT_SYMBOLS[target]} and ${hand.hcp} HCP the eight card fit is certain — bid the game.`,
        };
      }
    }
    if (hand.hcp >= gameGoing) {
      const call = at(auction, 3, Strain.NoTrump);
      if (call) {
        return {
          call,
          reason: `${hand.hcp} HCP is enough for game; 3NT lets partner choose between notrump and my five card ${SUIT_SYMBOLS[target]}.`,
        };
      }
    }
    if (hand.hcp >= invitational) {
      const call = at(auction, 2, Strain.NoTrump);
      if (call)
        return {
          call,
          reason: `${hand.hcp} HCP is invitational — 2NT asks partner to bid on with a maximum.`,
        };
    }
    return {
      call: PASS,
      reason: `Only ${hand.hcp} HCP, so stop in the ${SUIT_SYMBOLS[target]} partscore where the trump fit will take more tricks than notrump.`,
    };
  }

  if (isStayman(myBid, base)) {
    const shown =
      partnerLast.strain !== Strain.NoTrump &&
      partnerLast.strain !== Strain.Diamonds
        ? (partnerLast.strain as Suit)
        : undefined;
    if (shown !== undefined && hand.lengths[shown] >= 4) {
      if (hand.hcp >= gameGoing) {
        const call = at(auction, 4, shown);
        if (call) {
          return {
            call,
            reason: `Stayman found the ${SUIT_SYMBOLS[shown]} fit and we have the values — bid the major suit game.`,
          };
        }
      }
      const call = at(auction, 3, shown);
      if (call) {
        return {
          call,
          reason: `An eight card ${SUIT_SYMBOLS[shown]} fit with ${hand.hcp} HCP — invite game.`,
        };
      }
    }
    if (hand.hcp >= gameGoing) {
      const call = at(auction, 3, Strain.NoTrump);
      if (call)
        return {
          call,
          reason: `No major fit, but ${hand.hcp} HCP is enough for 3NT.`,
        };
    }
    if (hand.hcp >= invitational) {
      const call = at(auction, 2, Strain.NoTrump);
      if (call)
        return {
          call,
          reason: `No fit and only ${hand.hcp} HCP — invite with 2NT.`,
        };
    }
    return { call: PASS, reason: `No major fit and not enough for game.` };
  }

  void partner;
  return undefined;
}

// --------------------------------------------------------------------------
// Later rounds
// --------------------------------------------------------------------------

/** Picks the best final contract given a combined point estimate and a fit. */
function chooseContract(
  view: View,
  hand: HandEvaluation,
  partner: PartnerPicture,
  combinedMin: number,
): Suggestion | undefined {
  const auction = view.auction;
  const fit = bestFit(hand, partner.lengths);

  if (combinedMin >= GRAND_SLAM_POINTS) {
    const call = fit ? at(auction, 7, fit) : at(auction, 7, Strain.NoTrump);
    if (call)
      return {
        call,
        reason: `The partnership has at least ${combinedMin} points — enough for a grand slam.`,
      };
  }

  if (combinedMin >= SLAM_POINTS) {
    const call = fit ? at(auction, 6, fit) : at(auction, 6, Strain.NoTrump);
    if (call)
      return {
        call,
        reason: `At least ${combinedMin} combined points — bid the small slam.`,
      };
  }

  if (combinedMin >= GAME_POINTS) {
    if (fit !== undefined && isMajor(fit)) {
      const call = at(auction, 4, fit);
      if (call) {
        return {
          call,
          reason: `An eight card ${SUIT_SYMBOLS[fit]} fit with about ${combinedMin} combined points — bid the major suit game.`,
        };
      }
    }
    const notrump = at(auction, 3, Strain.NoTrump);
    if (notrump && hand.balanced) {
      return {
        call: notrump,
        reason: `About ${combinedMin} combined points with no major fit — 3NT is the cheapest game.`,
      };
    }
    if (fit !== undefined && combinedMin >= MINOR_GAME_POINTS) {
      const call = at(auction, 5, fit);
      if (call)
        return {
          call,
          reason: `A minor suit game needs eleven tricks, and ${combinedMin} combined points is enough.`,
        };
    }
    if (notrump) {
      return {
        call: notrump,
        reason: `About ${combinedMin} combined points — take the shot at 3NT.`,
      };
    }
  }

  return undefined;
}

function openerRebid(
  hand: HandEvaluation,
  view: View,
  partner: PartnerPicture,
): Suggestion {
  const auction = view.auction;
  const opening = firstBidOf(view.mine)!;
  const openedSuit =
    opening.strain !== Strain.NoTrump ? (opening.strain as Suit) : undefined;
  const partnerBid = lastBidOf(view.partner);

  if (!partnerBid) {
    return {
      call: PASS,
      reason: `Partner could not act, so there is no reason to bid again.`,
    };
  }

  if (opening.strain === Strain.NoTrump && opening.level <= 2) {
    const forced = notrumpOpenerRebid(hand, view, opening);
    if (forced) return forced;
  }

  const combinedMin = hand.hcp + partner.range.min;
  const combinedMax = hand.hcp + partner.range.max;

  // With a fit and enough combined strength, just bid the contract.
  const contract = chooseContract(view, hand, partner, combinedMin);
  if (contract) return contract;

  // Raise partner's suit when there is a fit.
  const partnerSuit =
    partnerBid.strain !== Strain.NoTrump
      ? (partnerBid.strain as Suit)
      : undefined;
  if (partnerSuit !== undefined && hand.lengths[partnerSuit] >= 4) {
    const supportPoints = hand.hcp + shortnessPoints(hand.lengths, partnerSuit);
    const levels = supportPoints >= 19 ? 2 : supportPoints >= 16 ? 1 : 0;
    const call = jump(auction, partnerSuit, levels);
    if (call && call.level <= 4) {
      return {
        call,
        reason: `${hand.lengths[partnerSuit]} card support for ${SUIT_SYMBOLS[partnerSuit]} with ${supportPoints} points — ${levels > 0 ? "jump to show the extras" : "a simple raise shows a minimum"}.`,
      };
    }
  }

  // Rebid a six card suit.
  if (openedSuit !== undefined && hand.lengths[openedSuit] >= 6) {
    const call = cheapest(auction, openedSuit);
    if (call && call.level <= 3) {
      return {
        call,
        reason: `Repeating ${SUIT_SYMBOLS[openedSuit]} shows the sixth card and a minimum opening.`,
      };
    }
  }

  // Show a second suit, but only reverse with real extras.
  const second = SUITS.filter(
    (suit) =>
      suit !== openedSuit &&
      hand.lengths[suit] >= 4 &&
      cheapest(auction, suit) !== undefined,
  ).sort((a, b) => hand.lengths[b] - hand.lengths[a]);
  if (second.length > 0) {
    const suit = second[0];
    const call = cheapest(auction, suit)!;
    const isReverse =
      openedSuit !== undefined && call.level >= 2 && suit < openedSuit;
    if (!isReverse || hand.hcp >= 17) {
      if (call.level <= 2) {
        return {
          call,
          reason: `Showing a second suit: ${hand.lengths[suit]} cards in ${SUIT_SYMBOLS[suit]}${isReverse ? ` with ${hand.hcp} HCP, enough for a reverse` : ""}.`,
        };
      }
    }
  }

  // Balanced rebids in notrump.
  if (hand.balanced) {
    if (hand.hcp >= 18) {
      const call = at(auction, 2, Strain.NoTrump);
      if (call)
        return {
          call,
          reason: `Balanced with ${hand.hcp} HCP — 2NT shows a hand too strong to open 1NT.`,
        };
    }
    const call = cheapest(auction, Strain.NoTrump);
    if (call && call.level === 1) {
      return {
        call,
        reason: `Balanced minimum with ${hand.hcp} HCP — 1NT describes it exactly.`,
      };
    }
  }

  const compete = competitiveRebid(hand, view, partner);
  if (compete) return compete;

  return {
    call: PASS,
    reason: `${hand.hcp} HCP opposite partner's ${partner.range.min}-${partner.range.max} is at most ${combinedMax} — short of game, so pass.`,
  };
}

function responderRebid(
  hand: HandEvaluation,
  view: View,
  partner: PartnerPicture,
): Suggestion {
  const opening = partner.openingCall;
  if (
    partner.opened &&
    opening &&
    opening.strain === Strain.NoTrump &&
    opening.level <= 2
  ) {
    const planned = notrumpResponderRebid(hand, view, opening, partner);
    if (planned) return planned;
  }

  const combinedMin = hand.hcp + partner.range.min;
  const contract = chooseContract(view, hand, partner, combinedMin);
  if (contract) return contract;

  const auction = view.auction;
  const partnerBid = lastBidOf(view.partner);
  const partnerSuit =
    partnerBid && partnerBid.strain !== Strain.NoTrump
      ? (partnerBid.strain as Suit)
      : undefined;

  if (
    partnerSuit !== undefined &&
    hand.lengths[partnerSuit] >= 3 &&
    hand.hcp >= 10
  ) {
    const call = cheapest(auction, partnerSuit);
    if (call && call.level <= 3) {
      return {
        call,
        reason: `${hand.lengths[partnerSuit]} card support with ${hand.hcp} HCP — raise to invite.`,
      };
    }
  }

  if (hand.hcp >= 11 && hand.balanced) {
    const call = cheapest(auction, Strain.NoTrump);
    if (call && call.level <= 2) {
      return {
        call,
        reason: `${hand.hcp} HCP balanced — invite game in notrump.`,
      };
    }
  }

  const compete = competitiveRebid(hand, view, partner);
  if (compete) return compete;

  return {
    call: PASS,
    reason: `The partnership is worth about ${combinedMin}-${hand.hcp + partner.range.max} points, which is short of game — pass.`,
  };
}

// --------------------------------------------------------------------------
// Competitive bidding
// --------------------------------------------------------------------------

function takeoutDoubleShape(hand: HandEvaluation, theirSuits: Suit[]): boolean {
  const unbid = SUITS.filter((suit) => !theirSuits.includes(suit));
  return (
    theirSuits.every((suit) => hand.lengths[suit] <= 2) &&
    unbid.filter((suit) => hand.lengths[suit] >= 3).length >=
      Math.min(3, unbid.length)
  );
}

function overcall(
  hand: HandEvaluation,
  cards: readonly Card[],
  view: View,
): Suggestion {
  const auction = view.auction;
  const theirSuits = view.opponentSuits;
  const theirSuit = theirSuits[theirSuits.length - 1];

  if (
    hand.balanced &&
    hand.hcp >= 15 &&
    hand.hcp <= 18 &&
    theirSuit !== undefined &&
    hasStopper(cards, theirSuit)
  ) {
    const call = at(auction, 1, Strain.NoTrump);
    if (call) {
      return {
        call,
        reason: `Balanced ${hand.hcp} HCP with ${SUIT_SYMBOLS[theirSuit]} stopped — 1NT overcall shows 15-18.`,
      };
    }
  }

  if (
    hand.hcp >= 12 &&
    takeoutDoubleShape(hand, theirSuits) &&
    isLegalCall(auction, DOUBLE)
  ) {
    return {
      call: DOUBLE,
      reason: `${hand.hcp} HCP, short in ${SUIT_SYMBOLS[theirSuit]} and support for the other suits — a takeout double asks partner to pick a suit.`,
    };
  }

  for (const suit of hand.longSuits) {
    if (theirSuits.includes(suit)) continue;
    const call = cheapest(auction, suit);
    if (!call) continue;
    const quality = suitQuality(cards, suit);
    const needed = call.level === 1 ? 8 : call.level === 2 ? 11 : 13;
    if (hand.hcp >= needed && quality >= 8) {
      return {
        call,
        reason: `A ${hand.lengths[suit]} card ${SUIT_SYMBOLS[suit]} suit with ${hand.hcp} HCP is worth an overcall at the ${call.level} level.`,
      };
    }
    // Preemptive jump overcall.
    if (hand.hcp <= 10 && hand.lengths[suit] >= 6 && quality >= 9) {
      const jumped = jump(auction, suit, 1);
      if (jumped && jumped.level <= 3) {
        return {
          call: jumped,
          reason: `A weak hand with ${hand.lengths[suit]} ${SUIT_SYMBOLS[suit]} — jump to crowd their auction.`,
        };
      }
    }
  }

  return {
    call: PASS,
    reason: `${hand.hcp} HCP with no good suit to show over their bidding — pass.`,
  };
}

function advance(
  hand: HandEvaluation,
  view: View,
  partner: PartnerPicture,
): Suggestion {
  const auction = view.auction;
  const partnerDoubled = view.partner.some(
    (entry) => entry.call.kind === "double",
  );
  const partnerBid = lastBidOf(view.partner);

  if (partnerDoubled && !partnerBid) {
    // A takeout double is forcing: pick the longest unbid suit.
    const unbid = SUITS.filter(
      (suit) => !view.opponentSuits.includes(suit),
    ).sort(
      (a, b) =>
        hand.lengths[b] - hand.lengths[a] ||
        (isMajor(b) ? 1 : 0) - (isMajor(a) ? 1 : 0),
    );
    const suit = unbid[0];
    const levels = hand.hcp >= 12 ? 2 : hand.hcp >= 9 ? 1 : 0;
    const call = jump(auction, suit, levels) ?? cheapest(auction, suit);
    if (call && call.level <= 4) {
      return {
        call,
        reason: `Partner's double is takeout and I must bid: ${hand.lengths[suit]} ${SUIT_SYMBOLS[suit]} with ${hand.hcp} HCP.`,
      };
    }
  }

  if (partnerBid && partnerBid.strain !== Strain.NoTrump) {
    const suit = partnerBid.strain as Suit;
    if (hand.lengths[suit] >= 3) {
      const supportPoints = hand.hcp + shortnessPoints(hand.lengths, suit);
      const levels = supportPoints >= 13 ? 2 : supportPoints >= 10 ? 1 : 0;
      const call = jump(auction, suit, levels);
      if (call && call.level <= 4) {
        return {
          call,
          reason: `${hand.lengths[suit]} card support for partner's ${SUIT_SYMBOLS[suit]} with ${supportPoints} points.`,
        };
      }
    }
  }

  const combinedMin = hand.hcp + partner.range.min;
  const contract = chooseContract(view, hand, partner, combinedMin);
  if (contract) return contract;

  return {
    call: PASS,
    reason: `Not enough to compete further with ${hand.hcp} HCP.`,
  };
}

// --------------------------------------------------------------------------
// Entry point
// --------------------------------------------------------------------------

function suggest(
  cards: readonly Card[],
  auction: Auction,
  seat: Seat,
): Suggestion {
  const hand = evaluateHand(cards);
  const view = buildView(auction, seat);
  const partner = readPartner(view);

  // Nobody has bid: this is an opening decision.
  if (!view.opening) return openingCall(hand, cards, view);

  const weOpened = isSameSide(view.opening.seat, seat);
  const iOpened = view.opening.seat === seat;
  const partnerOpened = view.opening.seat === partnerOf(seat);
  const myFirstCall = view.mine.every((entry) => entry.call.kind === "pass");

  // Never bid past game without the values for slam.
  const highest = view.highest;
  if (highest && isSameSide(highest.seat, seat) && highest.call.level! >= 4) {
    const combinedMin = hand.hcp + partner.range.min;
    if (combinedMin < SLAM_POINTS) {
      return {
        call: PASS,
        reason: `Our side is already in game and there is not enough for slam.`,
      };
    }
  }

  if (partnerOpened && myFirstCall) {
    const opening = view.opening.call;
    if (opening.strain === Strain.NoTrump && opening.level <= 2) {
      const response = respondToNotrump(hand, view, opening.level);
      if (response) return response;
    }
    return respondToSuitOpening(hand, cards, view, opening);
  }

  if (iOpened) return openerRebid(hand, view, partner);
  if (weOpened) return responderRebid(hand, view, partner);

  // The opponents opened.
  if (
    myFirstCall &&
    view.partner.every((entry) => entry.call.kind === "pass")
  ) {
    return overcall(hand, cards, view);
  }
  if (myFirstCall) return advance(hand, view, partner);

  const combinedMin = hand.hcp + partner.range.min;
  const contract = chooseContract(view, hand, partner, combinedMin);
  if (contract) return contract;

  const compete = competitiveRebid(hand, view, partner);
  if (compete) return compete;

  return {
    call: PASS,
    reason: `Partner and I have described our hands; there is nothing more to say.`,
  };
}

/**
 * Buying the contract cheaply matters: when the opponents have outbid a fit of
 * ours at a low level, the law of total tricks says an eight or nine card fit is
 * worth competing to the two or three level.
 */
function competitiveRebid(
  hand: HandEvaluation,
  view: View,
  partner: PartnerPicture,
): Suggestion | undefined {
  const highest = view.highest;
  if (!highest || isSameSide(highest.seat, view.seat)) return undefined;
  if (highest.call.level! >= 4) return undefined;

  const auction = view.auction;

  // A long suit of my own that partner has not supported is still worth a bid.
  const mySuits = SUITS.filter((suit) => hand.lengths[suit] >= 6).sort(
    (a, b) => hand.lengths[b] - hand.lengths[a],
  );
  for (const suit of mySuits) {
    if (!view.ourSuits.includes(suit)) continue;
    const call = cheapest(auction, suit);
    if (call && call.level <= hand.lengths[suit] - 4) {
      return {
        call,
        reason: `${hand.lengths[suit]} cards in ${SUIT_SYMBOLS[suit]} is too much playing strength to sell out — compete to ${call.level}${SUIT_SYMBOLS[suit]}.`,
      };
    }
  }

  // With a known fit, compete to the level of the fit.
  const fit = bestFit(hand, partner.lengths);
  if (fit !== undefined && hand.hcp + partner.range.min >= 18) {
    const fitLength = hand.lengths[fit] + partner.lengths[fit];
    const call = cheapest(auction, fit);
    if (call && call.level <= fitLength - 6 && call.level <= 3) {
      return {
        call,
        reason: `We have at least a ${fitLength} card ${SUIT_SYMBOLS[fit]} fit, which is worth competing to the ${call.level} level.`,
      };
    }
  }

  return undefined;
}

/**
 * The engine's call for `cards` in the current auction, with the reasoning
 * behind it. Always returns a legal call.
 */
export function suggestCall(
  cards: readonly Card[],
  auction: Auction,
  seat?: Seat,
): Suggestion {
  const actualSeat = seat ?? seatToCall(auction);
  let suggestion: Suggestion;
  try {
    suggestion = suggest(cards, auction, actualSeat);
  } catch {
    suggestion = { call: PASS, reason: `Nothing clear to bid.` };
  }

  if (!isLegalCall(auction, suggestion.call)) {
    return { call: PASS, reason: suggestion.reason };
  }
  return suggestion;
}

/** Convenience wrapper used by the robots. */
export function chooseCall(
  cards: readonly Card[],
  auction: Auction,
  seat?: Seat,
): Call {
  return suggestCall(cards, auction, seat).call;
}

export interface PlayerPicture {
  range: Range;
  /** Minimum length the auction promises in each suit. */
  lengths: number[];
}

/**
 * What the auction says about the hand at `seat`, read through the same system
 * the robots bid. The card play bots use this to keep their sampled layouts
 * consistent with the bidding.
 */
export function inferFromAuction(auction: Auction, seat: Seat): PlayerPicture {
  try {
    const picture = readPartner(buildView(auction, partnerOf(seat)));
    return { range: picture.range, lengths: picture.lengths };
  } catch {
    return { range: { ...UNKNOWN_RANGE }, lengths: [0, 0, 0, 0] };
  }
}
