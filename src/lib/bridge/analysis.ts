/**
 * Post mortem: what the auction should have reached, and which cards cost tricks.
 *
 * Everything here is derived from the double dummy solver rather than guessed at,
 * so the numbers are exact. The prose around them is heuristic — it names the
 * pattern that fits the position and falls back to stating the plain facts.
 */

import type { Dds } from "bridge-dds";
import {
  auctionResult,
  callToString,
  contractToString,
  createAuction,
  makeCall,
  type Auction,
  type Call,
  type Contract,
} from "./auction";
import {
  cardName,
  cardRank,
  cardSuit,
  isSameSide,
  nextSeat,
  partnerOf,
  SEAT_NAMES,
  SEATS,
  STRAIN_SYMBOLS,
  Strain,
  STRAINS,
  Seat,
  SUIT_SYMBOLS,
  type Card,
  type Suit,
} from "./cards";
import {
  isVulnerable,
  VULNERABILITY_NAMES,
  type Hands,
  type Vulnerability,
} from "./deal";
import {
  analysePlay,
  doubleDummyTable,
  parContracts,
  solvePosition,
  type DoubleDummyTable,
} from "./dds-solver";
import { createPlayState, playCard, trumpSuit, type PlayState } from "./play";
import { imps, scoreContract } from "./scoring";
import { suggestCall } from "./bidding";

export interface BiddingNote {
  index: number;
  seat: Seat;
  call: Call;
  /** What the reference bidder would have called with the same cards. */
  suggested: Call;
  reason: string;
  agreed: boolean;
}

export interface ContractOption {
  contract: Contract;
  tricks: number;
  score: number;
}

export interface BiddingReview {
  notes: BiddingNote[];
  /** Highest scoring contract available to your side, ignoring competition. */
  best?: ContractOption;
  /** The contract actually reached. */
  actual?: ContractOption;
  par: { score: number; contracts: string[] };
  /** Score difference between the best available contract and the one reached. */
  costImps: number;
  summary: string;
}

export interface PlayNote {
  trick: number;
  ply: number;
  seat: Seat;
  card: Card;
  /** Cards that would have been at least as good, double dummy. */
  best: Card[];
  tricksLost: number;
  explanation: string;
}

export interface PlayReview {
  notes: PlayNote[];
  totalTricksLost: number;
  /** Declaring side's double dummy trick count after each card played. */
  values: number[];
  openingLead?: PlayNote;
  summary: string;
}

export interface BoardAnalysis {
  table: DoubleDummyTable;
  /** Par as the solver reports it: score is from North-South's point of view. */
  par: { score: number; contracts: string[] };
  contract?: Contract;
  declarerTricks: number;
  /** What you actually scored, positive when it went your way. */
  score: number;
  /**
   * The best score available to you had both sides bid and played perfectly.
   *
   * This is par, not the value of your best contract: par is an equilibrium
   * between two perfect sides, so it already accounts for the opponents bidding
   * on or sacrificing over anything you might have reached. It can therefore be
   * negative — on some deals the cards belong to them and the best you can do is
   * hold the damage down.
   */
  parScore: number;
  /** How far the result sat from par, in IMPs. Zero means you matched par. */
  impsVsPar: number;
  makeable: number;
  bidding: BiddingReview;
  play: PlayReview;
  headline: string;
}

// --------------------------------------------------------------------------
// Contracts available from the double dummy table
// --------------------------------------------------------------------------

function optionFor(
  table: DoubleDummyTable,
  strain: Strain,
  declarer: Seat,
  vulnerability: Vulnerability,
): ContractOption | undefined {
  const tricks = table[strain][declarer];
  if (tricks < 7) return undefined;
  const contract: Contract = {
    level: tricks - 6,
    strain,
    declarer,
    doubled: "none",
  };
  const { score } = scoreContract(
    contract,
    tricks,
    isVulnerable(declarer, vulnerability),
  );
  return { contract, tricks, score };
}

/** The best contract the given side can make, scored from their point of view. */
export function bestContractFor(
  table: DoubleDummyTable,
  side: Seat,
  vulnerability: Vulnerability,
): ContractOption | undefined {
  const seats = [side, partnerOf(side)];
  let best: ContractOption | undefined;

  for (const strain of STRAINS) {
    for (const declarer of seats) {
      const option = optionFor(table, strain, declarer, vulnerability);
      if (!option) continue;
      // Prefer the cheaper game or partscore when the score ties, and prefer
      // notrump and majors over minors at equal value.
      if (
        !best ||
        option.score > best.score ||
        (option.score === best.score &&
          option.contract.level < best.contract.level)
      ) {
        best = option;
      }
    }
  }

  return best;
}

// --------------------------------------------------------------------------
// Bidding review
// --------------------------------------------------------------------------

function reviewBidding(
  auction: Auction,
  hands: Hands,
  seat: Seat,
  table: DoubleDummyTable,
  vulnerability: Vulnerability,
  par: { score: number; contracts: string[] },
  contract: Contract | undefined,
  declarerTricks: number,
): BiddingReview {
  const notes: BiddingNote[] = [];
  let replay = createAuction(auction.dealer);

  auction.entries.forEach((entry, index) => {
    if (entry.seat === seat) {
      const suggestion = suggestCall(hands[seat], replay, seat);
      const agreed =
        suggestion.call.kind === entry.call.kind &&
        suggestion.call.level === entry.call.level &&
        suggestion.call.strain === entry.call.strain;
      notes.push({
        index,
        seat,
        call: entry.call,
        suggested: suggestion.call,
        reason: suggestion.reason,
        agreed,
      });
    }
    replay = makeCall(replay, entry.call);
  });

  const best = bestContractFor(table, seat, vulnerability);
  let actual: ContractOption | undefined;
  if (contract) {
    const tricks = table[contract.strain][contract.declarer];
    const { score } = scoreContract(
      contract,
      declarerTricks,
      isVulnerable(contract.declarer, vulnerability),
    );
    actual = {
      contract,
      tricks,
      score: isSameSide(contract.declarer, seat) ? score : -score,
    };
  }

  const summary = biddingSummary(best, actual, contract, seat, par);
  const costImps = best && actual ? imps(best.score - actual.score) : 0;

  return { notes, best, actual, par, costImps, summary };
}

function biddingSummary(
  best: ContractOption | undefined,
  actual: ContractOption | undefined,
  contract: Contract | undefined,
  seat: Seat,
  par: { score: number; contracts: string[] },
): string {
  const parText = par.contracts.length
    ? `Par on this board is ${par.contracts.join(" or ")} for ${par.score >= 0 ? "+" : ""}${par.score} to North-South.`
    : "";

  if (!contract) {
    if (best) {
      return `The board was passed out. ${contractToString(best.contract)} was there for the taking — worth ${best.score} points. ${parText}`;
    }
    return `The board was passed out, and neither side could make anything. ${parText}`;
  }

  if (!best) {
    return `Your side had no making contract on this deal, so defending was the right idea. ${parText}`;
  }

  const ours = isSameSide(contract.declarer, seat);
  const reached = contractToString(contract);
  const target = contractToString(best.contract);

  if (ours && reached === target) {
    return `The auction landed on ${reached}, which is exactly the best contract available to your side. ${parText}`;
  }

  if (!ours) {
    return `The opponents played ${reached}. Your side could have made ${target} for ${best.score}. ${parText}`;
  }

  const gap = actual ? best.score - actual.score : 0;
  if (gap <= 0) {
    return `You played ${reached} and did at least as well as the ${target} the cards were worth. ${parText}`;
  }
  return `You played ${reached}; ${target} was the better spot, worth ${gap} more points (${imps(gap)} IMPs). ${parText}`;
}

// --------------------------------------------------------------------------
// Play review
// --------------------------------------------------------------------------

/** Rebuilds the position before every card of the trace. */
function replayStates(
  contract: Contract,
  hands: Hands,
  trace: readonly Card[],
): PlayState[] {
  const states: PlayState[] = [];
  let state = createPlayState(contract, hands);
  for (const card of trace) {
    states.push(state);
    state = playCard(state, card);
  }
  states.push(state);
  return states;
}

/** Where in the trick a card was played, which drives most of the advice. */
function positionInTrick(
  state: PlayState,
): "lead" | "second" | "third" | "fourth" {
  return (["lead", "second", "third", "fourth"] as const)[
    state.current.cards.length
  ];
}

function explainCard(
  state: PlayState,
  card: Card,
  best: Card[],
  tricksLost: number,
  contract: Contract,
  /** How to name the player, e.g. "You" or "You, from dummy,". */
  who: string,
): string {
  const seat = nextSeat(state.current.leader, state.current.cards.length);
  const trump = trumpSuit(contract);
  const where = positionInTrick(state);
  const played = cardName(card);
  const alternatives = best.map(cardName).join(" or ");
  const cost = tricksLost === 1 ? "a trick" : `${tricksLost} tricks`;
  const sameSuit = best.filter((option) => cardSuit(option) === cardSuit(card));
  const declaring = isSameSide(seat, contract.declarer);

  const detail = (() => {
    if (where === "lead") {
      if (sameSuit.length > 0) {
        const higher = cardRank(sameSuit[0]) > cardRank(card);
        return higher
          ? `From this holding the right card to lead is the ${cardName(sameSuit[0])} — leading low lets the defense win a trick cheaply.`
          : `Leading the ${cardName(sameSuit[0])} keeps the suit under control; the ${played} burns a high card that was worth a trick on its own.`;
      }
      const suit = cardSuit(best[0]);
      if (trump !== undefined && suit === trump) {
        return `A trump lead was the winner here — it cuts down the ruffs ${declaring ? "the defense" : "declarer"} was relying on.`;
      }
      return `${SUIT_SYMBOLS[suit]} was the suit to attack; switching there sets up the tricks before ${declaring ? "the defense" : "declarer"} can get organized.`;
    }

    if (where === "second") {
      if (sameSuit.length > 0 && cardRank(sameSuit[0]) < cardRank(card)) {
        return `Second hand normally plays low — the ${played} was going to be beaten anyway, and playing it early gave up a guard.`;
      }
      if (sameSuit.length > 0) {
        return `This is the position to rise with the ${cardName(sameSuit[0])} rather than duck.`;
      }
    }

    if (where === "third") {
      if (sameSuit.length > 0 && cardRank(sameSuit[0]) > cardRank(card)) {
        return `Third hand high: the ${cardName(sameSuit[0])} is needed to force out the higher card and promote partner's holding.`;
      }
    }

    if (
      trump !== undefined &&
      cardSuit(card) === trump &&
      !best.some((option) => cardSuit(option) === trump)
    ) {
      return `Ruffing here was wasted — that trump was a natural trick, and discarding keeps it.`;
    }
    if (
      trump !== undefined &&
      best.some((option) => cardSuit(option) === trump) &&
      cardSuit(card) !== trump
    ) {
      return `Ruffing with the ${cardName(best.find((option) => cardSuit(option) === trump)!)} wins the trick outright.`;
    }
    if (cardSuit(card) !== cardSuit(state.current.cards[0] ?? card)) {
      return `The discard is the problem: that card was a winner later, and there was a spare one to throw instead.`;
    }
    if (sameSuit.length > 0 && cardRank(sameSuit[0]) < cardRank(card)) {
      return `Keeping the ${played} and playing the ${cardName(sameSuit[0])} costs nothing now and leaves the higher card guarding the suit.`;
    }
    return `The ${alternatives} keeps the position intact.`;
  })();

  return `${who} played ${played} — ${alternatives} was worth ${cost} more. ${detail}`;
}

function reviewPlay(
  dds: Dds,
  contract: Contract,
  hands: Hands,
  trace: readonly Card[],
  seat: Seat,
): PlayReview {
  const openingLeader = nextSeat(contract.declarer);
  const values = analysePlay(dds, hands, contract.strain, openingLeader, trace);
  const states = replayStates(contract, hands, trace);
  const declaring = isSameSide(seat, contract.declarer);
  const dummy = partnerOf(contract.declarer);

  const notes: PlayNote[] = [];
  let totalTricksLost = 0;

  for (let ply = 0; ply < trace.length; ply += 1) {
    const state = states[ply];
    const player = nextSeat(state.current.leader, state.current.cards.length);

    // Review the cards the human was responsible for, including dummy's when
    // they were declarer.
    const mine =
      player === seat || (seat === contract.declarer && player === dummy);
    if (!mine) continue;

    const before = values[ply];
    const after = values[ply + 1];
    if (before === undefined || after === undefined) continue;

    // `values` counts tricks for the declaring side, so a defender's error
    // shows up as an increase.
    const lost = declaring ? before - after : after - before;
    if (lost <= 0) continue;

    let best: Card[] = [];
    try {
      const scores = solvePosition(dds, {
        hands: state.hands,
        strain: contract.strain,
        leader: state.current.leader,
        currentTrick: state.current.cards,
      });
      const top = Math.max(...scores.map((score) => score.tricks));
      best = scores
        .filter((score) => score.tricks === top)
        .map((score) => score.card)
        .sort((a, b) => cardSuit(a) - cardSuit(b) || cardRank(b) - cardRank(a))
        .slice(0, 3);
    } catch {
      best = [];
    }

    if (best.length === 0) continue;

    totalTricksLost += lost;
    notes.push({
      trick: state.tricks.length + 1,
      ply,
      seat: player,
      card: trace[ply],
      best,
      tricksLost: lost,
      explanation: explainCard(
        state,
        trace[ply],
        best,
        lost,
        contract,
        player === seat ? "You" : "You, from dummy,",
      ),
    });
  }

  const openingLead =
    openingLeader === seat ? notes.find((note) => note.ply === 0) : undefined;

  const summary =
    totalTricksLost === 0
      ? `Flawless: every card you played held the double dummy value of the hand.`
      : `You gave up ${totalTricksLost} trick${totalTricksLost === 1 ? "" : "s"} across ${notes.length} card${notes.length === 1 ? "" : "s"} compared with perfect play.`;

  return { notes, totalTricksLost, values, openingLead, summary };
}

// --------------------------------------------------------------------------
// Entry point
// --------------------------------------------------------------------------

export interface AnalysisRequest {
  hands: Hands;
  auction: Auction;
  /** Cards in the order played. Empty when the board was passed out. */
  trace: Card[];
  dealer: Seat;
  vulnerability: Vulnerability;
  /** The seat the human occupied. */
  seat: Seat;
  declarerTricks: number;
}

export function analyseBoard(
  dds: Dds,
  request: AnalysisRequest,
): BoardAnalysis {
  const { hands, auction, trace, dealer, vulnerability, seat, declarerTricks } =
    request;

  const table = doubleDummyTable(dds, hands);
  const par = parContracts(dds, table, dealer, vulnerability);
  const contract = auctionResult(auction);

  const bidding = reviewBidding(
    auction,
    hands,
    seat,
    table,
    vulnerability,
    par,
    contract,
    declarerTricks,
  );

  const play: PlayReview = contract
    ? reviewPlay(dds, contract, hands, trace, seat)
    : {
        notes: [],
        totalTricksLost: 0,
        values: [],
        summary: `Nobody bid, so there were no cards to review.`,
      };

  let score = 0;
  let makeable = 0;
  if (contract) {
    makeable = table[contract.strain][contract.declarer];
    const raw = scoreContract(
      contract,
      declarerTricks,
      isVulnerable(contract.declarer, vulnerability),
    );
    score = isSameSide(contract.declarer, seat) ? raw.score : -raw.score;
  }

  const parScore = isSameSide(seat, Seat.North) ? par.score : -par.score;

  return {
    table,
    par,
    contract,
    declarerTricks,
    score,
    parScore,
    impsVsPar: imps(score - parScore),
    makeable,
    bidding,
    play,
    headline: headlineFor(
      contract,
      declarerTricks,
      makeable,
      score,
      seat,
      vulnerability,
    ),
  };
}

function headlineFor(
  contract: Contract | undefined,
  declarerTricks: number,
  makeable: number,
  score: number,
  seat: Seat,
  vulnerability: Vulnerability,
): string {
  if (!contract) return "Passed out — no contract was reached.";

  const ours = isSameSide(contract.declarer, seat);
  const needed = contract.level + 6;
  const result = declarerTricks - needed;
  const outcome =
    result === 0
      ? "made exactly"
      : result > 0
        ? `made with ${result} overtrick${result === 1 ? "" : "s"}`
        : `went down ${-result}`;

  const perfect =
    makeable === declarerTricks
      ? "which is exactly what the cards were worth"
      : makeable > declarerTricks
        ? `though ${makeable} tricks were available`
        : `${declarerTricks - makeable} more than double dummy defense would allow`;

  void ours;
  return `${contractToString(contract)} by ${SEAT_NAMES[contract.declarer]} ${outcome} (${perfect}). Your side scored ${score >= 0 ? "+" : ""}${score}, vulnerability ${VULNERABILITY_NAMES[vulnerability]}.`;
}
