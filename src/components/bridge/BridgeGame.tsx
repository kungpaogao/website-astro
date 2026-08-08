/**
 * The table. You sit South; the other three seats are robots.
 *
 * The game loop is written as plain async functions rather than reactive effects
 * so that the order of play is obvious: each step runs, waits for the robot or
 * for you, and then hands control on. A generation counter retires any loop that
 * is still running when you move to a new board.
 */

import clsx from "clsx";
import {
  createSignal,
  onCleanup,
  onMount,
  Show,
  type Component,
} from "solid-js";
import {
  auctionResult,
  contractToString,
  createAuction,
  isAuctionComplete,
  makeCall,
  seatToCall,
  type Auction,
  type Call,
  type Contract,
} from "../../lib/bridge/auction";
import { suggestCall } from "../../lib/bridge/bidding";
import {
  cardName,
  isSameSide,
  SEAT_NAMES,
  Seat,
  STRAIN_SYMBOLS,
  type Card,
  type Seat as SeatType,
} from "../../lib/bridge/cards";
import {
  createBoard,
  VULNERABILITY_NAMES,
  isVulnerable,
  type Board,
} from "../../lib/bridge/deal";
import { buildPlayRequest } from "../../lib/bridge/bot-play";
import { BridgeEngine } from "../../lib/bridge/engine-client";
import {
  createPlayState,
  dummySeat,
  isDummyVisible,
  isPlayComplete,
  legalPlays,
  playCard,
  playedCards,
  seatToPlay,
  trickWinner,
  trumpSuit,
  type PlayState,
} from "../../lib/bridge/play";
import type { BoardAnalysis } from "../../lib/bridge/analysis";
import { Review } from "./Review";
import {
  AuctionTable,
  BiddingBox,
  HandView,
  HiddenHand,
  Panel,
  TrickView,
  suitColor,
} from "./parts";

const HUMAN: SeatType = Seat.South;

type Phase = "loading" | "bidding" | "play" | "analysing" | "review";

interface DisplayTrick {
  leader: SeatType;
  cards: Card[];
  winner: SeatType;
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const BridgeGame: Component = () => {
  const [engine, setEngine] = createSignal<BridgeEngine>();
  const [phase, setPhase] = createSignal<Phase>("loading");
  const [boardNumber, setBoardNumber] = createSignal(1);
  const [board, setBoard] = createSignal<Board>();
  const [auction, setAuction] = createSignal<Auction>();
  const [state, setState] = createSignal<PlayState>();
  const [analysis, setAnalysis] = createSignal<BoardAnalysis>();
  const [status, setStatus] = createSignal("Loading the solver…");
  const [error, setError] = createSignal<string>();
  const [displayTrick, setDisplayTrick] = createSignal<DisplayTrick>();
  /** True while a robot is thinking or a finished trick is being shown. */
  const [busy, setBusy] = createSignal(false);
  /** Card armed by a first click, played by a second. */
  const [selectedCard, setSelectedCard] = createSignal<Card>();

  let generation = 0;
  /**
   * The generation whose bidding and play loops are running. These guard against
   * a second loop starting while the first is waiting on a robot or on the trick
   * display, which would otherwise let two cards be played for the same turn.
   * They are separate because the auction loop hands over to the play loop.
   */
  let auctionLoopFor = 0;
  let playLoopFor = 0;

  onMount(() => {
    const created = new BridgeEngine();
    setEngine(created);
    created
      .warmup()
      .then(() => startBoard(1))
      .catch((cause: Error) => setError(cause.message));
    onCleanup(() => created.dispose());
  });

  const contract = (): Contract | undefined => state()?.contract;
  const declarer = () => contract()?.declarer;
  const dummy = () => {
    const current = contract();
    return current ? dummySeat(current) : undefined;
  };

  /**
   * Seats whose cards you play. Declarer plays dummy's cards as well as their
   * own; when you are dummy your partner plays both hands and you just watch.
   */
  const humanControls = (seat: SeatType) => {
    const declaring = declarer();
    if (declaring === undefined) return seat === HUMAN;
    if (declaring === HUMAN) return seat === HUMAN || seat === dummy();
    if (dummy() === HUMAN) return false;
    return seat === HUMAN;
  };

  const yourTurnToPlay = () => {
    const current = state();
    if (busy()) return false;
    return (
      phase() === "play" &&
      current !== undefined &&
      humanControls(seatToPlay(current))
    );
  };

  const yourTurnToBid = () => {
    const current = auction();
    return (
      phase() === "bidding" &&
      current !== undefined &&
      seatToCall(current) === HUMAN
    );
  };

  // ------------------------------------------------------------------
  // Board lifecycle
  // ------------------------------------------------------------------

  async function startBoard(number: number) {
    generation += 1;
    const mine = generation;

    const created = createBoard(number);
    setBoardNumber(number);
    setBoard(created);
    setAuction(createAuction(created.dealer));
    setState(undefined);
    setAnalysis(undefined);
    setDisplayTrick(undefined);
    setBusy(false);
    setSelectedCard(undefined);
    setPhase("bidding");
    await runAuction(mine);
  }

  async function runAuction(mine: number) {
    if (auctionLoopFor === mine) return;
    auctionLoopFor = mine;
    try {
      await auctionLoop(mine);
    } finally {
      if (auctionLoopFor === mine) auctionLoopFor = 0;
    }
  }

  async function auctionLoop(mine: number) {
    while (generation === mine) {
      const current = auction();
      const hands = board()?.hands;
      if (!current || !hands) return;

      if (isAuctionComplete(current)) {
        await beginPlay(mine, current);
        return;
      }

      const seat = seatToCall(current);
      if (seat === HUMAN) {
        setStatus("Your call.");
        return;
      }

      setStatus(`${SEAT_NAMES[seat]} is bidding…`);
      await pause(600);
      if (generation !== mine) return;

      const call = suggestCall(hands[seat], current, seat).call;
      setAuction(makeCall(current, call));
    }
  }

  function submitCall(call: Call) {
    const current = auction();
    if (!current || seatToCall(current) !== HUMAN) return;
    setAuction(makeCall(current, call));
    void runAuction(generation);
  }

  async function beginPlay(mine: number, finished: Auction) {
    const found = auctionResult(finished);
    if (!found) {
      setStatus("Passed out.");
      await reviewBoard(mine, undefined);
      return;
    }
    const hands = board()!.hands;
    setState(createPlayState(found, hands));
    setPhase("play");
    await runPlay(mine);
  }

  async function runPlay(mine: number) {
    if (playLoopFor === mine) return;
    playLoopFor = mine;
    try {
      await playLoop(mine);
    } finally {
      if (playLoopFor === mine) playLoopFor = 0;
    }
  }

  async function playLoop(mine: number) {
    while (generation === mine) {
      const current = state();
      const currentAuction = auction();
      if (!current || !currentAuction) return;

      if (isPlayComplete(current)) {
        await reviewBoard(mine, current);
        return;
      }

      const seat = seatToPlay(current);
      setStatus(describeTurn(current));
      if (humanControls(seat)) {
        setBusy(false);
        return;
      }

      setBusy(true);
      const request = buildPlayRequest(current, currentAuction, seat);
      const started = Date.now();

      let card: Card;
      try {
        card = (await engine()!.choosePlay(request)).card;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
        return;
      }
      if (generation !== mine) return;

      // Keep a floor under the robot's thinking time so the table stays readable.
      await pause(Math.max(0, 350 - (Date.now() - started)));
      if (generation !== mine) return;

      await applyCard(mine, card);
    }
  }

  /** The prompt shown for whoever is on play. */
  function describeTurn(current: PlayState): string {
    if (isPlayComplete(current))
      return "Working out what the cards were worth…";
    const seat = seatToPlay(current);
    if (!humanControls(seat)) return `${SEAT_NAMES[seat]} is thinking…`;
    return seat === HUMAN ? "Your turn." : "Play a card from dummy.";
  }

  /** Plays a card and, when it completes a trick, holds it on screen briefly. */
  async function applyCard(mine: number, card: Card) {
    const before = state();
    if (!before) return;

    const completing = before.current.cards.length === 3;
    const trick = {
      leader: before.current.leader,
      cards: [...before.current.cards, card],
    };
    const after = playCard(before, card);
    setState(after);
    setSelectedCard(undefined);
    // Update the prompt straight away: the play loop only gets to run after the
    // trick has been left on screen, and until then the old text would be wrong.
    setStatus(describeTurn(after));

    if (completing) {
      setDisplayTrick({
        leader: trick.leader,
        cards: trick.cards,
        winner: trickWinner(trick, trumpSuit(before.contract)),
      });
      await pause(1100);
      if (generation !== mine) return;
      setDisplayTrick(undefined);
    }
  }

  /**
   * Cards take two clicks: the first lifts the card out of the hand, the second
   * plays it. It is easy to mis-tap a fanned hand, and a card once played cannot
   * be taken back.
   */
  function clickCard(card: Card) {
    const current = state();
    if (!current || busy()) return;
    const seat = seatToPlay(current);
    if (!humanControls(seat)) return;
    if (!legalPlays(current, seat).includes(card)) return;

    if (selectedCard() === card) {
      void submitPlay(card);
      return;
    }
    setSelectedCard(card);
  }

  async function submitPlay(card: Card) {
    const current = state();
    if (!current || busy()) return;
    const seat = seatToPlay(current);
    if (!humanControls(seat)) return;
    if (!legalPlays(current, seat).includes(card)) return;

    setBusy(true);
    const mine = generation;
    await applyCard(mine, card);
    if (generation !== mine) return;
    await runPlay(mine);
  }

  async function reviewBoard(mine: number, finished: PlayState | undefined) {
    const currentBoard = board();
    const currentAuction = auction();
    if (!currentBoard || !currentAuction) return;

    setPhase("analysing");
    setBusy(false);
    setStatus("Working out what the cards were worth…");

    try {
      const result = await engine()!.analyse({
        hands: currentBoard.hands,
        auction: currentAuction,
        trace: finished ? playedCards(finished) : [],
        dealer: currentBoard.dealer,
        vulnerability: currentBoard.vulnerability,
        seat: HUMAN,
        declarerTricks: finished ? finished.declarerTricks : 0,
      });
      if (generation !== mine) return;
      setAnalysis(result);
      setPhase("review");
      setStatus("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  // ------------------------------------------------------------------
  // Derived display values
  // ------------------------------------------------------------------

  /** The cards you are allowed to look at, for any seat. */
  const visibleHand = (seat: SeatType): readonly Card[] | undefined => {
    const current = state();
    const currentBoard = board();
    if (!currentBoard) return undefined;
    if (!current) return seat === HUMAN ? currentBoard.hands[seat] : undefined;
    if (seat === HUMAN) return current.hands[seat];
    if (seat === dummy() && isDummyVisible(current)) return current.hands[seat];
    return undefined;
  };

  const trickCards = () => {
    const shown = displayTrick();
    if (shown)
      return { leader: shown.leader, cards: shown.cards, winner: shown.winner };
    const current = state();
    if (!current) return undefined;
    return {
      leader: current.current.leader,
      cards: current.current.cards,
      winner: undefined,
    };
  };

  const ourTricks = () => {
    const current = state();
    if (!current) return 0;
    return isSameSide(HUMAN, current.contract.declarer)
      ? current.declarerTricks
      : current.defenderTricks;
  };

  const theirTricks = () => {
    const current = state();
    if (!current) return 0;
    return isSameSide(HUMAN, current.contract.declarer)
      ? current.defenderTricks
      : current.declarerTricks;
  };

  const playable = (card: Card) => {
    const current = state();
    if (!current || !yourTurnToPlay()) return false;
    return legalPlays(current, seatToPlay(current)).includes(card);
  };

  const seatLabel = (seat: SeatType) => {
    const parts: string[] = [SEAT_NAMES[seat]];
    if (seat === HUMAN) parts.push("(you)");
    else if (seat === dummy()) parts.push("(dummy)");
    else if (seat === declarer()) parts.push("(declarer)");
    return parts.join(" ");
  };

  /**
   * One seat at the table: face up when you are entitled to see the cards,
   * card backs otherwise. Dummy is face up for everyone once it is faced,
   * wherever dummy happens to be sitting.
   */
  const SeatHand: Component<{
    seat: SeatType;
    vertical?: boolean;
    large?: boolean;
  }> = (seatProps) => (
    <div class="flex flex-col items-center gap-1">
      <span class="text-xs tracking-wider text-emerald-100/80 uppercase">
        {seatLabel(seatProps.seat)}
      </span>
      <Show
        when={visibleHand(seatProps.seat)}
        fallback={
          <HiddenHand
            count={state()?.hands[seatProps.seat].length ?? 13}
            vertical={seatProps.vertical}
          />
        }
      >
        {(cards) => (
          <HandView
            cards={cards()}
            compact={!seatProps.large}
            playable={playable}
            dimUnplayable={
              yourTurnToPlay() && seatToPlay(state()!) === seatProps.seat
            }
            selectedCard={selectedCard()}
            onPlay={clickCard}
          />
        )}
      </Show>
    </div>
  );

  return (
    <div class="flex flex-col gap-4">
      <Show when={error()}>
        {(message) => (
          <div class="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            The bridge engine could not start: {message()}
          </div>
        )}
      </Show>

      {/* Scoreboard */}
      <div class="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-stone-200 bg-white/80 px-4 py-3 text-sm">
        <span class="text-stone-500">
          Board <strong class="text-stone-900">{boardNumber()}</strong>
        </span>
        <Show when={board()}>
          {(current) => (
            <>
              <span class="text-stone-500">
                Dealer{" "}
                <strong class="text-stone-900">
                  {SEAT_NAMES[current().dealer]}
                </strong>
              </span>
              <span class="text-stone-500">
                Vulnerable{" "}
                <strong
                  class={clsx(
                    isVulnerable(HUMAN, current().vulnerability)
                      ? "text-red-700"
                      : "text-stone-900",
                  )}
                >
                  {VULNERABILITY_NAMES[current().vulnerability]}
                </strong>
              </span>
            </>
          )}
        </Show>
        <Show when={contract()}>
          {(current) => (
            <span class="text-stone-500">
              Contract{" "}
              <strong
                class={clsx("text-stone-900", suitColor(current().strain))}
              >
                {contractToString(current())}
              </strong>{" "}
              by {SEAT_NAMES[current().declarer]}
            </span>
          )}
        </Show>
        <Show when={phase() === "play"}>
          <span class="text-stone-500 tabular-nums">
            Tricks <strong class="text-stone-900">{ourTricks()}</strong> —{" "}
            <strong class="text-stone-900">{theirTricks()}</strong>
          </span>
        </Show>
        <span class="ml-auto text-stone-500 italic">
          <Show
            when={selectedCard() !== undefined && yourTurnToPlay()}
            fallback={status()}
          >
            Click {cardName(selectedCard()!)} again to play it.
          </Show>
        </span>
      </div>

      <Show when={phase() === "review" && analysis() && board()}>
        <Review
          analysis={analysis()!}
          hands={board()!.hands}
          seat={HUMAN}
          onNextBoard={() => void startBoard(boardNumber() + 1)}
        />
      </Show>

      <Show when={phase() !== "review"}>
        <div class="grid gap-4 lg:grid-cols-[1fr_20rem]">
          {/* The table */}
          <div class="max-w-full rounded-xl bg-[#2f5d50] p-3 shadow-inner sm:p-4">
            {/*
              North and South both get the full width of the table. When you are
              declarer, North is the dummy you have to play from, so its cards
              need to be the same size and just as easy to hit as your own.
            */}
            <div class="mb-3 border-b border-white/10 pb-3">
              <SeatHand seat={Seat.North} large />
            </div>

            <div class="grid grid-cols-[2.75rem_1fr_2.75rem] items-center justify-items-center gap-1 sm:grid-cols-[7rem_1fr_7rem] sm:gap-2">
              <SeatHand seat={Seat.West} vertical />

              <div class="flex min-h-40 items-center justify-center">
                <Show
                  when={phase() === "play" && trickCards()}
                  fallback={
                    <div class="w-full max-w-xs rounded-lg bg-white/90 p-3">
                      <Show
                        when={auction()}
                        fallback={<p class="text-sm">Dealing…</p>}
                      >
                        {(current) => (
                          <AuctionTable
                            auction={current()}
                            highlightSeat={
                              isAuctionComplete(current())
                                ? undefined
                                : seatToCall(current())
                            }
                          />
                        )}
                      </Show>
                    </div>
                  }
                >
                  {(trick) => (
                    <TrickView
                      leader={trick().leader}
                      cards={trick().cards}
                      winner={trick().winner}
                    />
                  )}
                </Show>
              </div>

              <SeatHand seat={Seat.East} vertical />
            </div>

            {/* Your hand gets the full width of the table so thirteen cards fit. */}
            <div class="mt-4 border-t border-white/10 pt-3">
              <SeatHand seat={Seat.South} large />
            </div>
          </div>

          {/* Side panel */}
          <div class="flex flex-col gap-4">
            <Show when={phase() === "bidding" && auction()}>
              {(current) => (
                <Panel title="Bidding box">
                  <BiddingBox
                    auction={current()}
                    disabled={!yourTurnToBid()}
                    onCall={submitCall}
                  />
                </Panel>
              )}
            </Show>

            <Show when={phase() === "play" && auction()}>
              {(current) => (
                <Panel title="Auction">
                  <AuctionTable auction={current()} />
                  <Show when={contract()}>
                    {(final) => (
                      <p class="mt-2 text-sm text-stone-600">
                        <span class={clsx(suitColor(final().strain))}>
                          {final().level}
                          {STRAIN_SYMBOLS[final().strain]}
                        </span>{" "}
                        by {SEAT_NAMES[final().declarer]}
                        {final().doubled !== "none" && ", doubled"}
                      </p>
                    )}
                  </Show>
                </Panel>
              )}
            </Show>

            <Show when={phase() === "loading" || phase() === "analysing"}>
              <Panel>
                <p class="text-sm text-stone-600">{status()}</p>
              </Panel>
            </Show>

            <Panel title="How this works">
              <p class="text-sm leading-relaxed text-stone-600">
                You are South. The other three seats are robots that bid with a
                standard American system and choose cards by imagining deals
                consistent with what they have seen, solving each one exactly,
                and playing what wins the most tricks on average. They cannot
                see your hand. When the board is over you get a full double
                dummy review of the auction and the play.
              </p>
            </Panel>
          </div>
        </div>
      </Show>

      <Show when={phase() !== "review"}>
        <div class="flex gap-2">
          <button
            type="button"
            onClick={() => void startBoard(boardNumber() + 1)}
            class="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-700 transition hover:border-stone-800"
          >
            Skip to a new board
          </button>
        </div>
      </Show>
    </div>
  );
};

export default BridgeGame;
