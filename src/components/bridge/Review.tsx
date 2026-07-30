/**
 * The post mortem panel: what the bidding was worth, and which cards cost tricks.
 */

import clsx from "clsx";
import { For, Show, type Component } from "solid-js";
import {
  cardName,
  cardSuit,
  SEAT_LETTERS,
  SEAT_NAMES,
  SEATS,
  STRAIN_SYMBOLS,
  type Seat,
} from "../../lib/bridge/cards";
import {
  BIDDING_ORDER,
  callToString,
  contractToString,
} from "../../lib/bridge/auction";
import type { BoardAnalysis } from "../../lib/bridge/analysis";
import type { Hands } from "../../lib/bridge/deal";
import { HandText, Panel, suitColor } from "./parts";

const DoubleDummyTable: Component<{ analysis: BoardAnalysis }> = (props) => (
  <div class="overflow-x-auto">
    <table class="w-full min-w-[18rem] text-center text-sm">
      <caption class="mb-2 text-left text-xs text-stone-500">
        Tricks each declarer can take with perfect play by everybody. Seven
        tricks is a contract at the one level.
      </caption>
      <thead>
        <tr class="text-xs text-stone-500">
          <th class="text-left font-medium">Declarer</th>
          <For each={BIDDING_ORDER}>
            {(strain) => (
              <th class={clsx("font-medium", suitColor(strain))}>
                {STRAIN_SYMBOLS[strain]}
              </th>
            )}
          </For>
        </tr>
      </thead>
      <tbody>
        <For each={SEATS}>
          {(seat) => (
            <tr class="border-t border-stone-100">
              <td class="py-1 text-left text-stone-600">{SEAT_NAMES[seat]}</td>
              <For each={BIDDING_ORDER}>
                {(strain) => {
                  const tricks = () => props.analysis.table[strain][seat];
                  return (
                    <td
                      class={clsx(
                        "py-1 tabular-nums",
                        tricks() >= 10
                          ? "font-semibold text-stone-900"
                          : tricks() >= 7
                            ? "text-stone-700"
                            : "text-stone-300",
                      )}
                    >
                      {tricks()}
                    </td>
                  );
                }}
              </For>
            </tr>
          )}
        </For>
      </tbody>
    </table>
  </div>
);

const AllHands: Component<{ hands: Hands; declarer?: Seat }> = (props) => (
  <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
    <For each={SEATS}>
      {(seat) => (
        <div>
          <div class="mb-1 text-xs font-medium tracking-wider text-stone-500 uppercase">
            {SEAT_NAMES[seat]}
            <Show when={props.declarer === seat}>
              <span class="ml-1 text-stone-400">(declarer)</span>
            </Show>
          </div>
          <HandText cards={props.hands[seat]} />
        </div>
      )}
    </For>
  </div>
);

export const Review: Component<{
  analysis: BoardAnalysis;
  hands: Hands;
  seat: Seat;
  onNextBoard: () => void;
}> = (props) => {
  const bidding = () => props.analysis.bidding;
  const play = () => props.analysis.play;

  return (
    <div class="flex flex-col gap-4">
      <Panel>
        <h2 class="mb-1 font-serif text-xl text-stone-900">Result</h2>
        <p class="text-stone-700">{props.analysis.headline}</p>
        <div class="mt-3 flex flex-wrap gap-4 text-sm text-stone-600">
          <span>
            Your score:{" "}
            <strong
              class={clsx(
                "tabular-nums",
                props.analysis.score >= 0 ? "text-emerald-700" : "text-red-700",
              )}
            >
              {props.analysis.score >= 0 ? "+" : ""}
              {props.analysis.score}
            </strong>
          </span>
          <Show when={props.analysis.contract}>
            {(contract) => (
              <span>
                Double dummy: {contractToString(contract())} takes{" "}
                {props.analysis.makeable} tricks
              </span>
            )}
          </Show>
        </div>
      </Panel>

      <Panel title="The auction">
        <p class="text-stone-700">{bidding().summary}</p>

        <Show when={bidding().best}>
          {(best) => (
            <p class="mt-2 text-sm text-stone-600">
              Best contract for your side:{" "}
              <strong class="text-stone-900">
                {contractToString(best().contract)} by{" "}
                {SEAT_NAMES[best().contract.declarer]}
              </strong>{" "}
              — {best().tricks} tricks, worth {best().score}.
            </p>
          )}
        </Show>

        <Show when={bidding().notes.length > 0}>
          <ul class="mt-3 flex flex-col gap-2">
            <For each={bidding().notes}>
              {(note) => (
                <li class="rounded border border-stone-100 bg-stone-50 p-2 text-sm">
                  <div class="flex items-baseline gap-2">
                    <span class="font-medium text-stone-900">
                      You bid {callToString(note.call)}
                    </span>
                    <Show
                      when={!note.agreed}
                      fallback={
                        <span class="text-xs text-emerald-700">standard</span>
                      }
                    >
                      <span class="text-xs text-amber-700">
                        standard bid: {callToString(note.suggested)}
                      </span>
                    </Show>
                  </div>
                  <p class="mt-0.5 text-stone-600">{note.reason}</p>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </Panel>

      <Panel title="The play">
        <p class="text-stone-700">{play().summary}</p>
        <Show when={play().notes.length > 0}>
          <ul class="mt-3 flex flex-col gap-2">
            <For each={play().notes}>
              {(note) => (
                <li class="rounded border border-stone-100 bg-stone-50 p-2 text-sm">
                  <div class="flex items-baseline gap-2">
                    <span class="text-xs tracking-wide text-stone-500 uppercase">
                      Trick {note.trick}
                    </span>
                    <span
                      class={clsx(
                        "font-medium",
                        suitColor(cardSuit(note.card)),
                      )}
                    >
                      {cardName(note.card)}
                    </span>
                    <span class="text-xs text-amber-700">
                      −{note.tricksLost} trick{note.tricksLost === 1 ? "" : "s"}
                    </span>
                    <span class="text-xs text-stone-500">
                      better: {note.best.map(cardName).join(", ")}
                    </span>
                  </div>
                  <p class="mt-0.5 text-stone-600">{note.explanation}</p>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </Panel>

      <Panel title="Makeable contracts">
        <DoubleDummyTable analysis={props.analysis} />
      </Panel>

      <Panel title="All four hands">
        <AllHands
          hands={props.hands}
          declarer={props.analysis.contract?.declarer}
        />
        <p class="mt-3 text-xs text-stone-500">
          You sat {SEAT_NAMES[props.seat]} ({SEAT_LETTERS[props.seat]}).
        </p>
      </Panel>

      <button
        type="button"
        onClick={props.onNextBoard}
        class="self-start rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-700"
      >
        Next board
      </button>
    </div>
  );
};
