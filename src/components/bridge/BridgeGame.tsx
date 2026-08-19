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
  batch,
  createEffect,
  createSignal,
  onCleanup,
  onMount,
  Show,
  type Component,
} from "solid-js";
import {
  auctionResult,
  callToString,
  contractToString,
  createAuction,
  isAuctionComplete,
  isLegalCall,
  makeCall,
  sameCall,
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
  controlledSeats,
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
import {
  decodeBoard,
  encodeBoard,
  replayRecord,
  type BoardRecord,
} from "../../lib/bridge/share";
import {
  clearHistory,
  loadHistory,
  saveBoard,
  type HistoryEntry,
} from "../../lib/bridge/history";
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

/**
 * The page's standfirst, which the game hides once a board is under review.
 *
 * It introduces the table, and the review is long enough without a paragraph
 * about robots at the top of it. The paragraph lives in `bridge.astro` so that
 * it is server rendered with the title, which leaves reaching for it by id as
 * the way to put it away.
 */
const INTRO_ID = "bridge-intro";

type Phase = "loading" | "bidding" | "play" | "analysing" | "review";

/** Where the board under review came from, which is all the review says about it. */
type Origin = "dealt" | "link" | "history";

interface DisplayTrick {
  leader: SeatType;
  cards: Card[];
  winner: SeatType;
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** How a board reads on a scoresheet: `4♠ by South =`, `3NT by West −2`. */
function contractLabel(analysis: BoardAnalysis): string {
  const played = analysis.contract;
  if (!played) return "Passed out";
  const over = analysis.declarerTricks - (played.level + 6);
  const result = over === 0 ? "=" : over > 0 ? `+${over}` : `−${-over}`;
  return `${contractToString(played)} by ${SEAT_NAMES[played.declarer]} ${result}`;
}

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
  /** Call armed by a first click, made by a second. */
  const [selectedCall, setSelectedCall] = createSignal<Call>();
  /** Link to the board under review, once there is something to share. */
  const [shareUrl, setShareUrl] = createSignal<string>();
  /** The board under review, packed, which is also its identity in the history. */
  const [code, setCode] = createSignal<string>();
  /** The whole board, which is what the replay in the review walks through. */
  const [record, setRecord] = createSignal<BoardRecord>();
  /** How the board under review got here. */
  const [origin, setOrigin] = createSignal<Origin>("dealt");
  /** Boards finished in this browser, most recent first. */
  const [history, setHistory] = createSignal<HistoryEntry[]>([]);

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
    setHistory(loadHistory());

    const shared = new URLSearchParams(window.location.search).get("b");
    created
      .warmup()
      .then(() => (shared ? openBoardCode(shared) : startBoard(1)))
      .catch((cause: Error) => setError(cause.message));
    onCleanup(() => created.dispose());
  });

  createEffect(() => {
    const intro = document.getElementById(INTRO_ID);
    if (intro) intro.hidden = phase() === "review";
  });

  const contract = (): Contract | undefined => state()?.contract;
  const declarer = () => contract()?.declarer;
  const dummy = () => {
    const current = contract();
    return current ? dummySeat(current) : undefined;
  };

  /**
   * Seats whose cards you play. Declarer plays dummy's cards as well as their
   * own, and when the auction makes you dummy you take over declarer's hand
   * across the table rather than watching a robot play the board out: either
   * way, if your side is declaring you turn both hands.
   */
  const humanControls = (seat: SeatType) => {
    const current = contract();
    if (!current) return seat === HUMAN;
    return controlledSeats(current, HUMAN).includes(seat);
  };

  /** True when the auction made you dummy, so you are playing partner's hand. */
  const playingForPartner = () => dummy() === HUMAN;

  const yourTurnToPlay = () => {
    const current = state();
    if (busy()) return false;
    return (
      phase() === "play" &&
      current !== undefined &&
      humanControls(seatToPlay(current))
    );
  };

  /**
   * The bidding box is the only panel beside the table, so once the auction is
   * over the table takes the full width.
   */
  const sidePanel = () => phase() === "bidding";

  const yourTurnToBid = () => {
    const current = auction();
    return (
      phase() === "bidding" &&
      current !== undefined &&
      seatToCall(current) === HUMAN
    );
  };

  /** What an armed card or call is waiting for, shown in place of the status. */
  const confirmPrompt = (): string | undefined => {
    const card = selectedCard();
    if (card !== undefined && yourTurnToPlay())
      return `Click ${cardName(card)} again to play it.`;
    const call = selectedCall();
    if (call !== undefined && yourTurnToBid())
      return `Click ${callToString(call)} again to bid it.`;
    return undefined;
  };

  // ------------------------------------------------------------------
  // Board lifecycle
  // ------------------------------------------------------------------

  async function startBoard(number: number) {
    generation += 1;
    const mine = generation;

    const created = createBoard(number);
    // Batched, so the review never renders half of one board and half of the
    // next: the analysis on screen belongs to the deal it was made from, and a
    // replay handed one board's cards and another's contract cannot be played.
    batch(() => {
      setBoardNumber(number);
      setBoard(created);
      setAuction(createAuction(created.dealer));
      setState(undefined);
      setAnalysis(undefined);
      setDisplayTrick(undefined);
      setBusy(false);
      setSelectedCard(undefined);
      setSelectedCall(undefined);
      setShareUrl(undefined);
      setCode(undefined);
      setRecord(undefined);
      setOrigin("dealt");
      setPhase("bidding");
    });
    // A dealt board is not the shared one any more, so stop advertising it.
    if (new URLSearchParams(window.location.search).has("b")) {
      window.history.replaceState(null, "", window.location.pathname);
    }
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

  /**
   * Calls take two clicks for the same reason cards do: the bidding box is a
   * dense grid, and a call once made cannot be taken back.
   */
  function clickCall(call: Call) {
    const current = auction();
    if (!current || !yourTurnToBid()) return;
    if (!isLegalCall(current, call)) return;

    const armed = selectedCall();
    if (armed && sameCall(armed, call)) {
      submitCall(call);
      return;
    }
    setSelectedCall(call);
  }

  function submitCall(call: Call) {
    const current = auction();
    if (!current || seatToCall(current) !== HUMAN) return;
    if (!isLegalCall(current, call)) return;
    setSelectedCall(undefined);
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
    return seat === dummy() ? "Play a card from dummy." : "Your turn.";
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

    const trace = finished ? playedCards(finished) : [];

    try {
      const result = await engine()!.analyse({
        hands: currentBoard.hands,
        auction: currentAuction,
        trace,
        dealer: currentBoard.dealer,
        vulnerability: currentBoard.vulnerability,
        seat: HUMAN,
        declarerTricks: finished ? finished.declarerTricks : 0,
      });
      if (generation !== mine) return;
      const played: BoardRecord = {
        boardNumber: boardNumber(),
        dealer: currentBoard.dealer,
        vulnerability: currentBoard.vulnerability,
        hands: currentBoard.hands,
        auction: currentAuction,
        trace,
      };
      batch(() => {
        setAnalysis(result);
        setRecord(played);
        const packed = publishShareUrl(played);
        if (packed) {
          setHistory(
            saveBoard({
              code: packed,
              boardNumber: played.boardNumber,
              contract: contractLabel(result),
              score: result.score,
              playedAt: Date.now(),
            }),
          );
        }
        setPhase("review");
        setStatus("");
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  /** Builds the link for the board just reviewed, and returns its code. */
  function publishShareUrl(played: BoardRecord): string | undefined {
    try {
      const packed = encodeBoard(played);
      const { origin: host, pathname } = window.location;
      setCode(packed);
      setShareUrl(`${host}${pathname}?b=${packed}`);
      return packed;
    } catch {
      // A board that will not encode simply cannot be shared; the review is
      // still perfectly usable, so there is nothing to report.
      setCode(undefined);
      setShareUrl(undefined);
      return undefined;
    }
  }

  /**
   * Opens a packed board straight into its review — someone else's link, or one
   * of your own boards picked out of the history.
   */
  async function openBoardCode(packed: string) {
    generation += 1;
    const mine = generation;

    let opened: BoardRecord;
    try {
      opened = decodeBoard(packed);
    } catch {
      setStatus("That link did not describe a board, so here is a fresh one.");
      window.history.replaceState(null, "", window.location.pathname);
      await startBoard(1);
      return;
    }

    // Replaying the trace gives the scoreboard its contract and trick count, so
    // a shared review reads exactly like one you played yourself.
    const finished = replayRecord(opened);
    // As in `startBoard`: one board goes on screen at a time, so the review of
    // the board you are leaving is never shown the incoming board's cards.
    batch(() => {
      // Your own boards are in the history under the code they are shared by,
      // so a row you click is a board you played rather than one you were sent.
      setOrigin(
        history().some((entry) => entry.code === packed) ? "history" : "link",
      );
      setBoardNumber(opened.boardNumber);
      setBoard({
        number: opened.boardNumber,
        dealer: opened.dealer,
        vulnerability: opened.vulnerability,
        hands: opened.hands,
      });
      setAuction(opened.auction);
      setRecord(opened);
      setCode(packed);
      setShareUrl(undefined);
      setAnalysis(undefined);
      setSelectedCard(undefined);
      setSelectedCall(undefined);
      setDisplayTrick(undefined);
      setBusy(false);
      setState(finished);
      setPhase("analysing");
      setStatus("Working out what the cards were worth…");
    });

    try {
      const result = await engine()!.analyse({
        hands: opened.hands,
        auction: opened.auction,
        trace: opened.trace,
        dealer: opened.dealer,
        vulnerability: opened.vulnerability,
        seat: HUMAN,
        declarerTricks: finished ? finished.declarerTricks : 0,
      });
      if (generation !== mine) return;
      setAnalysis(result);
      const { origin: host, pathname } = window.location;
      setShareUrl(`${host}${pathname}?b=${packed}`);
      setPhase("review");
      setStatus("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  /** Opens a board from the history table without leaving the page. */
  function openFromHistory(packed: string) {
    // Replaced rather than pushed: the history table is on screen in every
    // review, so it is the way back rather than the browser's back button.
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?b=${packed}`,
    );
    void openBoardCode(packed);
  }

  /**
   * The board to deal next. Playing on from a board you opened rather than
   * dealt carries on from the highest board you have played, so the numbering
   * keeps moving forward instead of restarting.
   */
  function nextBoardNumber(): number {
    if (origin() === "dealt") return boardNumber() + 1;
    return (
      history().reduce((highest, entry) => {
        return Math.max(highest, entry.boardNumber);
      }, 0) + 1
    );
  }

  // ------------------------------------------------------------------
  // Derived display values
  // ------------------------------------------------------------------

  /**
   * The cards you are allowed to look at, for any seat. Hands you play are face
   * up from the first card — when you are dummy that includes declarer's, which
   * is the hand you are now playing from — and dummy is face up for everyone
   * once the opening lead has been made.
   */
  const visibleHand = (seat: SeatType): readonly Card[] | undefined => {
    const current = state();
    const currentBoard = board();
    if (!currentBoard) return undefined;
    if (!current) return seat === HUMAN ? currentBoard.hands[seat] : undefined;
    if (humanControls(seat)) return current.hands[seat];
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

  /**
   * Seat name plus whatever the seat is on this board. The roles stack because
   * they answer different questions — "(you, dummy)" says the hand in front of
   * you is the one being played on the table, and "(declarer, you play)" says
   * the hand across from you is yours to turn.
   */
  const seatLabel = (seat: SeatType) => {
    const roles: string[] = [];
    if (seat === HUMAN) roles.push("you");
    if (seat === declarer()) roles.push("declarer");
    else if (seat === dummy()) roles.push("dummy");
    if (seat !== HUMAN && humanControls(seat) && playingForPartner())
      roles.push("you play");
    return roles.length === 0
      ? SEAT_NAMES[seat]
      : `${SEAT_NAMES[seat]} (${roles.join(", ")})`;
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
    /*
      The page is a blog column so the review reads like a post. The table needs
      more than that, so while a board is live the game breaks out of the column
      and centers itself on the viewport instead.
    */
    <div
      class={clsx(
        "flex flex-col gap-4",
        phase() !== "review" &&
          "relative left-1/2 w-[min(64rem,100vw-2.5rem)] -translate-x-1/2",
      )}
    >
      <Show when={error()}>
        {(message) => (
          <div class="border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            The bridge engine could not start: {message()}
          </div>
        )}
      </Show>

      {/* Scoreboard */}
      <div class="flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-stone-200 py-2 text-sm">
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
          {confirmPrompt() ?? status()}
        </span>
      </div>

      <Show when={phase() === "review" && analysis() && board()}>
        <Review
          analysis={analysis()!}
          hands={board()!.hands}
          seat={HUMAN}
          record={record()}
          shareUrl={shareUrl()}
          origin={origin()}
          history={history()}
          currentCode={code()}
          onOpenBoard={openFromHistory}
          onClearHistory={() => setHistory(clearHistory())}
          onNextBoard={() => void startBoard(nextBoardNumber())}
        />
      </Show>

      <Show when={phase() !== "review"}>
        <div
          class={clsx("grid gap-4", sidePanel() && "lg:grid-cols-[1fr_20rem]")}
        >
          {/* The table */}
          {/*
            The felt breaks out of the page's mobile gutter — on a phone every
            pixel of width is a wider card, and the table reads better as a
            band across the screen than as a green rectangle with a margin.
            The gutter is only there below md, so the breakout stops there too.
          */}
          <div class="-mx-5 bg-[#2f5d50] p-3 shadow-inner sm:p-4 md:mx-0 md:max-w-full">
            {/*
              The felt spans the page, but the seats stay within a comfortable
              width and centered, so widening the table does not just open up a
              gap between the players.
            */}
            <div class="mx-auto w-full max-w-3xl">
              {/*
                North and South both get the full width of the table. Whenever
                your side is declaring you play North's cards too — as the dummy
                opposite when you are declarer, and as the declarer opposite when
                the auction makes you dummy — so they need to be the same size
                and just as easy to hit as your own.
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
                      <div class="w-full max-w-xs bg-white/90 p-3">
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

              {/* Your hand gets the full width so thirteen cards fit. */}
              <div class="mt-4 border-t border-white/10 pt-3">
                <SeatHand seat={Seat.South} large />
              </div>
            </div>
          </div>

          {/* The bidding box, which is the only thing that needs a side panel. */}
          <Show when={sidePanel() && auction()}>
            {(current) => (
              <Panel title="Bidding box" class="self-start">
                <BiddingBox
                  auction={current()}
                  disabled={!yourTurnToBid()}
                  selectedCall={selectedCall()}
                  onCall={clickCall}
                />
              </Panel>
            )}
          </Show>
        </div>
      </Show>

      <Show when={phase() !== "review"}>
        <div class="flex gap-2">
          <button
            type="button"
            onClick={() => void startBoard(boardNumber() + 1)}
            class="border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-700 transition hover:border-stone-800"
          >
            Skip to a new board
          </button>
        </div>
      </Show>
    </div>
  );
};

export default BridgeGame;
