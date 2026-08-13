/**
 * Presentational pieces of the bridge table.
 */

import clsx from "clsx";
import { For, Show, type Component, type JSX } from "solid-js";
import {
  bySuit,
  cardRank,
  cardSuit,
  nextSeat,
  rankLetter,
  SEAT_NAMES,
  SEATS,
  STRAIN_SYMBOLS,
  SUIT_SYMBOLS,
  SUITS,
  type Card,
  type Seat,
  type Strain,
} from "../../lib/bridge/cards";
import {
  ALL_BIDS,
  BIDDING_ORDER,
  callToString,
  DOUBLE,
  isLegalCall,
  PASS,
  REDOUBLE,
  sameCall,
  type Auction,
  type Call,
} from "../../lib/bridge/auction";

/** Hearts and diamonds are red; the other two follow the page's ink color. */
export function suitColor(suit: number): string {
  return suit === 1 || suit === 2 ? "text-red-700" : "text-stone-900";
}

/**
 * The same two colors, muted for cards you cannot play.
 *
 * A red suit has to stay red even when it is grayed back — the color is how you
 * read the hand, so desaturating it would turn hearts black.
 */
function mutedSuitColor(suit: number): string {
  return suit === 1 || suit === 2 ? "text-red-400" : "text-stone-500";
}

export const CardFace: Component<{
  card: Card;
  playable?: boolean;
  dimmed?: boolean;
  /** Armed by a first click, played by a second. */
  selected?: boolean;
  onPlay?: (card: Card) => void;
  compact?: boolean;
}> = (props) => {
  const suit = () => cardSuit(props.card);
  const label = () =>
    `${rankLetter(cardRank(props.card))} of ${["spades", "hearts", "diamonds", "clubs"][suit()]}`;

  return (
    <button
      type="button"
      disabled={!props.playable}
      aria-label={label()}
      aria-pressed={props.playable ? props.selected === true : undefined}
      onClick={() => props.onPlay?.(props.card)}
      class={clsx(
        "relative flex flex-col items-center rounded-sm border bg-white leading-none shadow-sm transition",
        props.compact
          ? "h-11 w-8 px-1 pt-1 text-xs"
          : "h-16 w-11 px-1 pt-1 text-sm sm:h-22 sm:w-16 sm:px-1.5 sm:pt-1.5",
        props.dimmed ? mutedSuitColor(suit()) : suitColor(suit()),
        props.playable
          ? "cursor-pointer border-stone-300 hover:z-10 hover:-translate-y-2 hover:shadow-lg focus-visible:z-10 focus-visible:-translate-y-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-800"
          : "cursor-default border-stone-200",
        // Recede unplayable cards with color rather than a filter, so the felt
        // never shows through and red suits stay red.
        props.dimmed && "border-stone-300 bg-stone-100",
        // A selected card lifts out of the hand until it is played.
        props.selected && "z-10 -translate-y-3 shadow-xl ring-2 ring-stone-900",
      )}
    >
      {/* The index sits in the corner so a fanned hand stays readable. */}
      <span class="flex w-full flex-col items-start leading-none">
        <span class="font-semibold">{rankLetter(cardRank(props.card))}</span>
        <span
          aria-hidden="true"
          class={props.compact ? "text-[0.6rem]" : "text-xs"}
        >
          {SUIT_SYMBOLS[suit()]}
        </span>
      </span>
      <Show when={!props.compact}>
        <span aria-hidden="true" class="mt-1 text-lg sm:text-xl">
          {SUIT_SYMBOLS[suit()]}
        </span>
      </Show>
    </button>
  );
};

export const CardBack: Component<{ compact?: boolean }> = (props) => (
  <div
    aria-hidden="true"
    class={clsx(
      "rounded-sm border border-stone-400 bg-stone-300 shadow-sm",
      props.compact ? "h-10 w-7" : "h-16 w-11 sm:h-20 sm:w-14",
    )}
    style={{
      "background-image":
        "repeating-linear-gradient(45deg, rgba(255,255,255,.45) 0 3px, transparent 3px 6px)",
    }}
  />
);

/** A face up hand, grouped by suit with the highest card first. */
export const HandView: Component<{
  cards: readonly Card[];
  playable?: (card: Card) => boolean;
  onPlay?: (card: Card) => void;
  compact?: boolean;
  /** Fade the cards you may not play. Only meaningful while it is your turn. */
  dimUnplayable?: boolean;
  /** The card armed for playing, if it is in this hand. */
  selectedCard?: Card;
}> = (props) => (
  <div class="flex flex-wrap items-end justify-center gap-x-3 gap-y-2">
    <For each={SUITS}>
      {(suit) => {
        const cards = () =>
          props.cards
            .filter((card) => cardSuit(card) === suit)
            .sort((a, b) => cardRank(b) - cardRank(a));
        return (
          <Show when={cards().length > 0}>
            <div class="flex">
              <For each={cards()}>
                {(card, index) => (
                  <div
                    class={clsx(
                      // Keep the overlap smaller than half a card so every card
                      // has a comfortable strip of its own to click on.
                      index() > 0 &&
                        (props.compact ? "-ml-4" : "-ml-4 sm:-ml-5"),
                    )}
                  >
                    <CardFace
                      card={card}
                      compact={props.compact}
                      playable={props.playable?.(card) ?? false}
                      dimmed={
                        props.dimUnplayable === true &&
                        !(props.playable?.(card) ?? false)
                      }
                      selected={props.selectedCard === card}
                      onPlay={props.onPlay}
                    />
                  </div>
                )}
              </For>
            </div>
          </Show>
        );
      }}
    </For>
  </div>
);

/** Compact text rendering of a hand, used in the review. */
export const HandText: Component<{ cards: readonly Card[] }> = (props) => (
  <div class="flex flex-col gap-0.5 font-mono text-sm">
    <For each={SUITS}>
      {(suit) => (
        <div class={clsx("flex gap-1", suitColor(suit))}>
          <span aria-hidden="true">{SUIT_SYMBOLS[suit]}</span>
          <span class="text-stone-800">
            {bySuit(props.cards)[suit].map(rankLetter).join("") || "—"}
          </span>
        </div>
      )}
    </For>
  </div>
);

export const HiddenHand: Component<{ count: number; vertical?: boolean }> = (
  props,
) => (
  <div class={clsx("flex", props.vertical ? "flex-col" : "flex-row")}>
    <For each={Array.from({ length: props.count })}>
      {(_, index) => (
        <div class={clsx(index() > 0 && (props.vertical ? "-mt-8" : "-ml-5"))}>
          <CardBack compact />
        </div>
      )}
    </For>
  </div>
);

/** The cards on the table for the trick in progress. */
export const TrickView: Component<{
  leader: Seat;
  cards: readonly Card[];
  winner?: Seat;
}> = (props) => {
  const cardAt = (seat: Seat) => {
    const index = props.cards.findIndex(
      (_, i) => nextSeat(props.leader, i) === seat,
    );
    return index >= 0 ? props.cards[index] : undefined;
  };

  const slot = (seat: Seat, position: string) => (
    <div class={clsx("absolute", position)}>
      <Show when={cardAt(seat)}>
        {(card) => (
          <div
            class={clsx(
              "transition",
              props.winner === seat &&
                "rounded-sm ring-2 ring-amber-400 ring-offset-2 ring-offset-transparent",
            )}
          >
            <CardFace card={card()} />
          </div>
        )}
      </Show>
    </div>
  );

  return (
    <div class="relative h-48 w-44 sm:h-52 sm:w-60">
      {slot(0, "left-1/2 top-0 -translate-x-1/2")}
      {slot(1, "right-1 top-1/2 -translate-y-1/2")}
      {slot(2, "bottom-0 left-1/2 -translate-x-1/2")}
      {slot(3, "left-1 top-1/2 -translate-y-1/2")}
    </div>
  );
};

/** The running auction, four calls to a row starting from the dealer. */
export const AuctionTable: Component<{
  auction: Auction;
  highlightSeat?: Seat;
}> = (props) => {
  const cells = () => {
    const values: { seat: Seat; call?: Call }[] = [];
    for (let i = 0; i < props.auction.dealer; i += 1) {
      values.push({ seat: i as Seat });
    }
    for (const entry of props.auction.entries)
      values.push({ seat: entry.seat, call: entry.call });
    return values;
  };

  return (
    <table class="w-full table-fixed text-center text-sm">
      <thead>
        <tr class="text-xs tracking-wide text-stone-500 uppercase">
          <For each={SEATS}>
            {(seat) => (
              <th
                class={clsx(
                  "pb-1 font-medium",
                  props.highlightSeat === seat &&
                    "text-stone-900 underline decoration-2",
                )}
              >
                {SEAT_NAMES[seat]}
              </th>
            )}
          </For>
        </tr>
      </thead>
      <tbody>
        <For
          each={Array.from({
            length: Math.max(1, Math.ceil(cells().length / 4)),
          })}
        >
          {(_, row) => (
            <tr>
              <For each={[0, 1, 2, 3]}>
                {(column) => {
                  const cell = () => cells()[row() * 4 + column];
                  return (
                    <td class="py-0.5">
                      <Show
                        when={cell()?.call}
                        fallback={<span class="text-stone-300">·</span>}
                      >
                        {(call) => <CallChip call={call()} />}
                      </Show>
                    </td>
                  );
                }}
              </For>
            </tr>
          )}
        </For>
      </tbody>
    </table>
  );
};

export const CallChip: Component<{ call: Call }> = (props) => {
  const strainColor = () =>
    props.call.kind === "bid" && props.call.strain !== undefined
      ? suitColor(props.call.strain)
      : "text-stone-700";
  return (
    <span class={clsx("font-medium", strainColor())}>
      {callToString(props.call)}
    </span>
  );
};

/**
 * The bidding box. Illegal calls are shown but disabled, as at a real table.
 *
 * Like the cards, a call takes two clicks: the first arms it, the second makes
 * it. A bid cannot be taken back either, and the bids sit in a dense grid where
 * a mis-tap is easy.
 */
export const BiddingBox: Component<{
  auction: Auction;
  onCall: (call: Call) => void;
  disabled?: boolean;
  /** The call armed by a first click, if any. */
  selectedCall?: Call;
}> = (props) => {
  const allowed = (call: Call) =>
    !props.disabled && isLegalCall(props.auction, call);

  const armed = (call: Call) =>
    props.selectedCall !== undefined && sameCall(props.selectedCall, call);

  return (
    <div class="flex flex-col gap-2">
      <div class="flex gap-2">
        <For each={[PASS, DOUBLE, REDOUBLE]}>
          {(call) => (
            <button
              type="button"
              disabled={!allowed(call)}
              aria-pressed={allowed(call) ? armed(call) : undefined}
              onClick={() => props.onCall(call)}
              class={clsx(
                "flex-1 border px-3 py-2 text-sm font-medium transition",
                allowed(call)
                  ? "border-stone-300 bg-white text-stone-800 hover:border-stone-800 hover:bg-stone-50"
                  : "border-stone-200 bg-stone-100 text-stone-300",
                armed(call) &&
                  "border-stone-900 bg-stone-100 ring-2 ring-stone-900",
              )}
            >
              {callToString(call)}
            </button>
          )}
        </For>
      </div>

      <div class="grid grid-cols-5 gap-1">
        <For each={ALL_BIDS}>
          {(call) => (
            <button
              type="button"
              disabled={!allowed(call)}
              aria-pressed={allowed(call) ? armed(call) : undefined}
              onClick={() => props.onCall(call)}
              class={clsx(
                "border py-1.5 text-sm transition",
                allowed(call)
                  ? "cursor-pointer border-stone-300 bg-white hover:border-stone-800 hover:bg-stone-50"
                  : "border-stone-200 bg-stone-100 opacity-40",
                suitColor(call.strain as number),
                armed(call) &&
                  "border-stone-900 bg-stone-100 ring-2 ring-stone-900",
              )}
            >
              <span class="text-stone-900">{call.level}</span>
              <span aria-hidden="true">
                {STRAIN_SYMBOLS[call.strain as Strain]}
              </span>
            </button>
          )}
        </For>
      </div>
    </div>
  );
};

export const Panel: Component<{
  title?: string;
  children: JSX.Element;
  class?: string;
}> = (props) => (
  <section class={clsx("border border-stone-200 bg-white/80 p-4", props.class)}>
    <Show when={props.title}>
      <h2 class="mb-2 text-xs font-medium tracking-wider text-stone-500 uppercase">
        {props.title}
      </h2>
    </Show>
    {props.children}
  </section>
);
