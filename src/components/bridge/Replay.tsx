/**
 * Walking back through a finished board, one card at a time.
 *
 * The review tells you which cards cost tricks; this is where you watch them go.
 * It works from the same trace the share link carries, so a board someone sent
 * you replays exactly like one you played yourself.
 *
 * The four hands are drawn as a bridge diagram rather than as the felt table:
 * every card is face up by this point, the review reads as a column of prose,
 * and a diagram fits that column at any width the game table would not.
 */

import clsx from "clsx";
import {
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
  Show,
  type Component,
} from "solid-js";
import type { Contract } from "../../lib/bridge/auction";
import {
  cardName,
  cardSuit,
  nextSeat,
  Seat,
  SEAT_NAMES,
  type Card,
} from "../../lib/bridge/cards";
import type { Hands } from "../../lib/bridge/deal";
import {
  createPlayState,
  dummySeat,
  replayTrace,
  trickWinner,
  trumpSuit,
  type PlayState,
} from "../../lib/bridge/play";
import type { PlayNote } from "../../lib/bridge/analysis";
import { CardFace, HandText, suitColor } from "./parts";

/** Milliseconds a card stays on the table while the replay runs itself. */
const STEP_MS = 900;

const controlClass =
  "border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-700 transition enabled:hover:border-stone-800 disabled:text-stone-300";

/** The cards on the table, arranged around the compass. */
const TrickCross: Component<{
  leader: Seat;
  cards: readonly Card[];
  winner?: Seat;
  /** The card played most recently, lifted out of the rest. */
  latest?: Card;
}> = (props) => {
  const cardAt = (seat: Seat): Card | undefined => {
    const index = props.cards.findIndex(
      (_, i) => nextSeat(props.leader, i) === seat,
    );
    return index >= 0 ? props.cards[index] : undefined;
  };

  const slot = (seat: Seat, position: string) => (
    <div class={clsx("flex h-11 w-8 items-center justify-center", position)}>
      <Show when={cardAt(seat)}>
        {(card) => (
          <div
            class={clsx(
              "rounded-sm",
              props.winner === seat && "ring-2 ring-amber-400",
              props.latest === card() &&
                props.winner !== seat &&
                "ring-2 ring-stone-400",
            )}
          >
            <CardFace card={card()} compact />
          </div>
        )}
      </Show>
    </div>
  );

  return (
    <div class="grid grid-cols-3 grid-rows-3 items-center justify-items-center gap-1">
      {slot(Seat.North, "col-start-2 row-start-1")}
      {slot(Seat.East, "col-start-3 row-start-2")}
      {slot(Seat.South, "col-start-2 row-start-3")}
      {slot(Seat.West, "col-start-1 row-start-2")}
    </div>
  );
};

export const Replay: Component<{
  hands: Hands;
  contract: Contract;
  trace: readonly Card[];
  /** The seat you sat in. */
  seat: Seat;
  /** Play review notes, keyed by ply, shown as their card comes up. */
  notes?: PlayNote[];
}> = (props) => {
  /** Cards played so far. Zero is the position before the opening lead. */
  const [ply, setPly] = createSignal(0);
  const [running, setRunning] = createSignal(false);

  /**
   * Every position of the hand. A trace only belongs to the deal and contract it
   * was played with, so a mismatched set of props would throw on the first card
   * that could not be played — the position before the opening lead is always
   * safe, and a replay stuck at card zero beats a review that will not render.
   */
  const states = createMemo(() => {
    try {
      return replayTrace(props.contract, props.hands, props.trace);
    } catch {
      return [createPlayState(props.contract, props.hands)];
    }
  });
  const last = () => states().length - 1;
  const state = (): PlayState => states()[Math.min(ply(), last())];

  // A new board arrives as new props rather than a new component, so the
  // position has to be rewound explicitly.
  createEffect(
    on(
      () => props.trace,
      () => {
        setPly(0);
        setRunning(false);
      },
      { defer: true },
    ),
  );

  const step = (to: number) => setPly(Math.max(0, Math.min(last(), to)));

  createEffect(() => {
    if (!running()) return;
    const timer = setInterval(() => {
      setPly((current) => {
        if (current >= last()) {
          setRunning(false);
          return current;
        }
        return current + 1;
      });
    }, STEP_MS);
    onCleanup(() => clearInterval(timer));
  });

  /**
   * What to show on the table. A trick that has just been completed stays up
   * until the next card is played, so the thirteenth trick is not swallowed and
   * you can see who won each one.
   */
  const shown = () => {
    const current = state();
    if (current.current.cards.length > 0) {
      return {
        leader: current.current.leader,
        cards: current.current.cards,
        winner: undefined,
      };
    }
    const completed = current.tricks[current.tricks.length - 1];
    if (!completed || ply() === 0) {
      return { leader: current.current.leader, cards: [], winner: undefined };
    }
    return {
      leader: completed.leader,
      cards: completed.cards,
      winner: trickWinner(completed, trumpSuit(props.contract)),
    };
  };

  const latestCard = () => (ply() > 0 ? props.trace[ply() - 1] : undefined);

  const trickNumber = () => Math.min(13, state().tricks.length + 1);

  const seatLabel = (seat: Seat) => {
    const parts: string[] = [SEAT_NAMES[seat]];
    if (seat === props.seat) parts.push("(you)");
    if (seat === props.contract.declarer) parts.push("(declarer)");
    else if (seat === dummySeat(props.contract)) parts.push("(dummy)");
    return parts.join(" ");
  };

  /** Whose turn it is, or how the board finished once the cards run out. */
  const caption = () => {
    if (ply() === 0) return `Opening lead to come.`;
    if (ply() === last()) {
      const declaring = state().declarerTricks;
      return `All thirteen tricks played: ${declaring} to declarer, ${13 - declaring} to the defense.`;
    }
    const seat = nextSeat(state().current.leader, state().current.cards.length);
    return `${SEAT_NAMES[seat]} to play.`;
  };

  /** The note on the card just played, if the review had something to say. */
  const note = () =>
    ply() > 0
      ? props.notes?.find((entry) => entry.ply === ply() - 1)
      : undefined;

  const SeatHand: Component<{ seat: Seat }> = (seatProps) => (
    <div class="w-24 sm:w-28">
      <div class="mb-1 text-xs font-medium tracking-wider text-stone-500 uppercase">
        {seatLabel(seatProps.seat)}
      </div>
      <HandText cards={state().hands[seatProps.seat]} />
    </div>
  );

  return (
    <div
      role="group"
      aria-label="Replay the play"
      tabindex="0"
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") step(ply() + 1);
        else if (event.key === "ArrowLeft") step(ply() - 1);
        else if (event.key === "Home") step(0);
        else if (event.key === "End") step(last());
        else return;
        event.preventDefault();
        setRunning(false);
      }}
      class="flex flex-col gap-3 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-stone-800"
    >
      {/*
        The compass, with the trick in the middle of it. Every cell names its own
        row and column: left to flow, a three by three grid with five things in
        it puts West beside North.
      */}
      <div class="overflow-x-auto">
        <div class="mx-auto grid w-fit grid-cols-[6rem_auto_6rem] items-center justify-items-center gap-x-2 gap-y-4 sm:grid-cols-[7rem_auto_7rem] sm:gap-x-4">
          <div class="col-start-2 row-start-1">
            <SeatHand seat={Seat.North} />
          </div>
          <div class="col-start-1 row-start-2">
            <SeatHand seat={Seat.West} />
          </div>
          <div class="col-start-2 row-start-2">
            <TrickCross
              leader={shown().leader}
              cards={shown().cards}
              winner={shown().winner}
              latest={latestCard()}
            />
          </div>
          <div class="col-start-3 row-start-2">
            <SeatHand seat={Seat.East} />
          </div>
          <div class="col-start-2 row-start-3">
            <SeatHand seat={Seat.South} />
          </div>
        </div>
      </div>

      <p class="text-sm text-stone-600">
        <span class="tabular-nums">
          Trick {trickNumber()} of 13 · card {ply()} of {last()}
        </span>{" "}
        · declarer {state().declarerTricks} — defense {state().defenderTricks} ·{" "}
        {caption()}
        <Show when={latestCard()}>
          {(card) => (
            <>
              {" "}
              Last card:{" "}
              <strong class={clsx("font-medium", suitColor(cardSuit(card())))}>
                {cardName(card())}
              </strong>
              .
            </>
          )}
        </Show>
      </p>

      <Show when={note()}>
        {(entry) => (
          <p class="border-l-2 border-amber-300 pl-3 text-sm text-amber-800">
            {entry().explanation}
          </p>
        )}
      </Show>

      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          class={controlClass}
          disabled={ply() === 0}
          onClick={() => {
            setRunning(false);
            step(0);
          }}
        >
          ⏮ Start
        </button>
        <button
          type="button"
          class={controlClass}
          disabled={ply() === 0}
          onClick={() => {
            setRunning(false);
            step(ply() - 1);
          }}
        >
          ◀ Back
        </button>
        <button
          type="button"
          class={clsx(controlClass, "min-w-24")}
          disabled={ply() === last()}
          onClick={() => setRunning(!running())}
        >
          {running() ? "❙❙ Pause" : "▶ Play"}
        </button>
        <button
          type="button"
          class={controlClass}
          disabled={ply() === last()}
          onClick={() => {
            setRunning(false);
            step(ply() + 1);
          }}
        >
          Next ▶
        </button>
        <button
          type="button"
          class={controlClass}
          disabled={ply() === last()}
          onClick={() => {
            setRunning(false);
            step(last());
          }}
        >
          End ⏭
        </button>
      </div>

      <label class="flex items-center gap-3 text-xs text-stone-500">
        <span class="sr-only">Card played</span>
        <input
          type="range"
          min={0}
          max={last()}
          step={1}
          value={ply()}
          aria-label="Cards played"
          aria-valuetext={`Card ${ply()} of ${last()}`}
          onInput={(event) => {
            setRunning(false);
            step(event.currentTarget.valueAsNumber);
          }}
          class="w-full accent-stone-800"
        />
      </label>

      <p class="text-xs text-stone-500">
        Arrow keys step through the cards once the replay has focus.
      </p>
    </div>
  );
};
