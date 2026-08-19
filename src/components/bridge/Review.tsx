/**
 * The post mortem panel: what the bidding was worth, and which cards cost tricks.
 */

import clsx from "clsx";
import { createSignal, For, Show, type Component, type JSX } from "solid-js";
import {
  cardName,
  cardSuit,
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
import type { BoardRecord } from "../../lib/bridge/share";
import type { HistoryEntry } from "../../lib/bridge/history";
import { AuctionTable, HandText, InfoTip, suitColor } from "./parts";
import { Replay } from "./Replay";
import { HistoryTable } from "./History";

/**
 * A block of the post mortem. The review is a long read, so it runs flush with
 * the page rather than sitting in boxes — headings and spacing do the dividing,
 * and the text keeps the full width instead of losing it to panel padding.
 *
 * The heading matches an h2 in `prose.css`, so the review reads like a blog
 * post. It is spelled out here rather than inherited from `.prose`, whose list
 * and table rules would take over the notes and the double dummy grid.
 */
const Section: Component<{ title?: string; children: JSX.Element }> = (
  props,
) => (
  <section>
    <Show when={props.title}>
      <h2 class="mb-1 font-serif text-2xl leading-tight font-medium text-stone-900">
        {props.title}
      </h2>
    </Show>
    {props.children}
  </section>
);

/**
 * A heading inside a section, matching an h3 in `prose.css` the way `Section`
 * matches an h2.
 */
const Subheading: Component<{ children: JSX.Element }> = (props) => (
  <h3 class="mt-5 mb-2 font-serif text-xl leading-tight font-medium text-stone-900">
    {props.children}
  </h3>
);

const DoubleDummyTable: Component<{ analysis: BoardAnalysis }> = (props) => (
  <div class="overflow-x-auto">
    {/* Five narrow columns of digits: left to itself the table would stretch
        across the page and leave the strains stranded from their declarer. */}
    <table class="w-full max-w-md min-w-[18rem] text-center text-sm">
      <caption class="mb-2 text-left text-stone-600">
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
  /** The whole board, which is what the replay walks through. */
  record?: BoardRecord;
  /** Link that reopens this exact board, deal, auction and play included. */
  shareUrl?: string;
  /** How this board got here: dealt at the table, opened from a link, or revisited. */
  origin: "dealt" | "link" | "history";
  /** Boards played in this browser, most recent first. */
  history: HistoryEntry[];
  /** The code of the board on screen, so its own row is not a link back to it. */
  currentCode?: string;
  onOpenBoard: (code: string) => void;
  onClearHistory: () => void;
  onNextBoard: () => void;
}> = (props) => {
  const bidding = () => props.analysis.bidding;
  const play = () => props.analysis.play;
  const contract = () => props.analysis.contract;
  const replayable = () => {
    const record = props.record;
    const current = contract();
    return record && current && record.trace.length > 0
      ? { record, contract: current }
      : undefined;
  };
  const [copyState, setCopyState] = createSignal<"idle" | "copied" | "failed">(
    "idle",
  );

  async function copyLink() {
    const url = props.shareUrl;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopyState("copied");
    } catch {
      // Browsers can refuse clipboard access. The link is in the field next to
      // the button either way, so there is always something to copy by hand.
      setCopyState("failed");
    }
    setTimeout(() => setCopyState("idle"), 2500);
  }

  return (
    <div class="flex flex-col gap-6">
      <Show when={props.origin !== "dealt"}>
        <p class="text-stone-600">
          {props.origin === "history"
            ? "You played this board earlier."
            : "This board came from a link."}{" "}
          The review below is the whole hand as it was played, and the replay
          walks through it card by card.
        </p>
      </Show>

      <Section title="Result">
        <p class="text-stone-700">{props.analysis.headline}</p>
        <div class="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-stone-600">
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
          <span>
            Best available{" "}
            <InfoTip label="best available">
              The par score: what the board is worth with everyone, you
              included, bidding and playing perfectly and all four hands face
              up. It is an equilibrium between two perfect sides rather than a
              ceiling on your own result, so it can be negative when the cards
              belong to the opponents, and you can beat it when a robot errs.
            </InfoTip>
            :{" "}
            <strong class="text-stone-900 tabular-nums">
              {props.analysis.parScore >= 0 ? "+" : ""}
              {props.analysis.parScore}
            </strong>
          </span>
          <span>
            <Show
              when={props.analysis.impsVsPar !== 0}
              fallback={
                <strong class="text-emerald-700">You matched par</strong>
              }
            >
              <strong
                class={clsx(
                  "tabular-nums",
                  props.analysis.impsVsPar > 0
                    ? "text-emerald-700"
                    : "text-amber-700",
                )}
              >
                {props.analysis.impsVsPar > 0 ? "+" : ""}
                {props.analysis.impsVsPar} IMPs
              </strong>{" "}
              <InfoTip label="IMPs">
                International Match Points, the scale team bridge uses to
                compare two results on the same board. It compresses the score
                difference, so a swing of 500 is worth 11 IMPs and one of 50 is
                worth 2 — a part score misjudged costs little, a game or a slam
                missed costs a lot.
              </InfoTip>{" "}
              {props.analysis.impsVsPar > 0 ? "better than" : "off"} par
            </Show>
          </span>
          <Show when={props.analysis.par.contracts.length > 0}>
            <span>
              Par{" "}
              <InfoTip label="par">
                Where the board ends when both sides bid and play perfectly.
                Level and strain come first, then who declares — a seat, or a
                side when either hand of it can — and then any tricks over or
                under what the contract needs. 3C-W+1 is West in three clubs
                taking ten tricks where nine would do; 7N-NS is North-South in
                seven no trumps, making exactly.
              </InfoTip>
              :{" "}
              <strong class="text-stone-900">
                {props.analysis.par.contracts.join(" or ")}
              </strong>
            </span>
          </Show>
          <Show when={props.analysis.contract}>
            {(contract) => (
              <span>
                {contractToString(contract())} is worth{" "}
                {props.analysis.makeable} tricks double dummy
              </span>
            )}
          </Show>
        </div>
      </Section>

      <Section title="The auction">
        <Show when={props.record}>
          {(record) => (
            <div class="mb-3 max-w-xs">
              <AuctionTable auction={record().auction} />
            </div>
          )}
        </Show>

        <p class="text-stone-700">{bidding().summary}</p>

        <Show when={bidding().best}>
          {(best) => (
            <p class="mt-2 text-stone-600">
              Best contract double dummy{" "}
              <InfoTip label="the best contract double dummy">
                The most the cards are worth with all four hands face up, not a
                spot the bidding was meant to find. Game is bid on about 25
                combined points and a small slam on about 33, so a double dummy
                contract well above what your side held says how the cards lie
                rather than that you missed a bid.
              </InfoTip>
              :{" "}
              <strong class="text-stone-900">
                {contractToString(best().contract)} by{" "}
                {SEAT_NAMES[best().contract.declarer]}
              </strong>{" "}
              — {best().tricks} tricks, worth {best().score}. Your side held{" "}
              {bidding().combinedHcp} HCP between the two hands.
            </p>
          )}
        </Show>

        <Show when={bidding().notes.length > 0}>
          <ul class="mt-3 flex flex-col gap-3">
            <For each={bidding().notes}>
              {(note) => (
                <li>
                  <div class="flex flex-wrap items-baseline gap-2">
                    <span class="font-medium text-stone-900">
                      You bid {callToString(note.call)}
                    </span>
                    <Show
                      when={!note.agreed}
                      fallback={
                        <span class="text-sm text-emerald-700">standard</span>
                      }
                    >
                      <span class="text-sm text-amber-700">
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
      </Section>

      <Section title="The play">
        <p class="text-stone-700">{play().summary}</p>
        <Show when={play().notes.length > 0}>
          <ul class="mt-3 flex flex-col gap-3">
            <For each={play().notes}>
              {(note) => (
                <li>
                  <div class="flex flex-wrap items-baseline gap-2">
                    <span class="text-sm tracking-wide text-stone-500 uppercase">
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
                    <span class="text-sm text-amber-700">
                      −{note.tricksLost} trick{note.tricksLost === 1 ? "" : "s"}
                    </span>
                    <span class="text-sm text-stone-500">
                      better: {note.best.map(cardName).join(", ")}
                    </span>
                  </div>
                  <p class="mt-0.5 text-stone-600">{note.explanation}</p>
                </li>
              )}
            </For>
          </ul>
        </Show>

        <Show when={replayable()}>
          {(board) => (
            <>
              <Subheading>Replay</Subheading>
              <Replay
                hands={board().record.hands}
                contract={board().contract}
                trace={board().record.trace}
                seat={props.seat}
                notes={play().notes}
              />
            </>
          )}
        </Show>
      </Section>

      {/* The replay lays all four hands out face up, so the deal only needs
          showing on the boards that have no replay. */}
      <Show when={!replayable()}>
        <Section title="The deal">
          <AllHands hands={props.hands} declarer={contract()?.declarer} />
          <p class="mt-3 text-stone-600">You sat {SEAT_NAMES[props.seat]}.</p>
        </Section>
      </Show>

      <Section title="Makeable contracts">
        <DoubleDummyTable analysis={props.analysis} />
      </Section>

      <Show when={props.shareUrl}>
        {(url) => (
          <Section title="Share this board">
            <p class="mb-2 text-stone-600">
              The whole board — the deal, the auction and all fifty two cards —
              packs into this link, so anyone who opens it sees exactly this
              review.
            </p>
            <div class="flex flex-wrap gap-2">
              <input
                type="text"
                readonly
                value={url()}
                aria-label="Link to this board"
                onFocus={(event) => event.currentTarget.select()}
                class="min-w-0 flex-1 border border-stone-300 bg-stone-50 px-3 py-2 font-mono text-sm text-stone-700"
              />
              <button
                type="button"
                onClick={() => void copyLink()}
                class="border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700 transition hover:border-stone-800"
              >
                {copyState() === "copied"
                  ? "Copied"
                  : copyState() === "failed"
                    ? "Select and copy"
                    : "Copy link"}
              </button>
            </div>
          </Section>
        )}
      </Show>

      <Show when={props.history.length > 1}>
        <Section title="History">
          <HistoryTable
            entries={props.history}
            currentCode={props.currentCode}
            onOpen={props.onOpenBoard}
            onClear={props.onClearHistory}
          />
        </Section>
      </Show>

      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={props.onNextBoard}
          class="bg-stone-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-700"
        >
          {props.origin === "dealt" ? "Next board" : "Play a board"}
        </button>
      </div>
    </div>
  );
};
