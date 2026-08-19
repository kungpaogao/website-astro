/**
 * The boards you have played in this browser, as a scoresheet.
 *
 * Each row links back to its own review by board code, which is the same link
 * the share box hands out — so a row opens the full hand, replay included,
 * whether it is clicked here or pasted into another browser.
 */

import clsx from "clsx";
import { format } from "date-fns";
import { For, Show, type Component } from "solid-js";
import type { HistoryEntry } from "../../lib/bridge/history";

const signed = (score: number) => `${score >= 0 ? "+" : ""}${score}`;

export const HistoryTable: Component<{
  entries: HistoryEntry[];
  /** The board on screen, marked rather than linked. */
  currentCode?: string;
  /** Opens a board in place. The row is still a real link for new tabs. */
  onOpen: (code: string) => void;
  onClear: () => void;
}> = (props) => {
  const total = () =>
    props.entries.reduce((sum, entry) => sum + entry.score, 0);

  return (
    <>
      <div class="overflow-x-auto">
        <table class="w-full min-w-[18rem] text-left text-sm">
          <caption class="mb-2 text-left text-xs text-stone-500">
            Kept in this browser only. {props.entries.length} boards, net{" "}
            <span class="tabular-nums">{signed(total())}</span>.
          </caption>
          <thead>
            <tr class="text-xs tracking-wide text-stone-500 uppercase">
              <th class="pb-1 font-medium">Board</th>
              <th class="pb-1 font-medium">Contract</th>
              <th class="pb-1 text-right font-medium">Score</th>
              <th class="pb-1 text-right font-medium">Played</th>
            </tr>
          </thead>
          <tbody>
            <For each={props.entries}>
              {(entry) => {
                const current = () => entry.code === props.currentCode;
                return (
                  <tr class="border-t border-stone-100">
                    <td class="py-1 text-stone-500 tabular-nums">
                      {entry.boardNumber}
                    </td>
                    {/*
                      The contract carries the link rather than the board number:
                      it is the wider target, and it reads as a board rather than
                      as a digit when a screen reader lists the links.
                    */}
                    <td class="py-1 text-stone-700">
                      <Show
                        when={!current()}
                        fallback={
                          <>
                            {entry.contract}
                            <span class="ml-2 text-xs text-stone-400">
                              on screen
                            </span>
                          </>
                        }
                      >
                        <a
                          href={`?b=${entry.code}`}
                          onClick={(event) => {
                            // Leave the modified clicks to the browser, so a
                            // board can still be opened in its own tab.
                            if (
                              event.metaKey ||
                              event.ctrlKey ||
                              event.shiftKey ||
                              event.altKey ||
                              event.button !== 0
                            )
                              return;
                            event.preventDefault();
                            props.onOpen(entry.code);
                          }}
                          class="text-stone-900 underline decoration-stone-300 underline-offset-2 hover:decoration-stone-800"
                        >
                          {entry.contract}
                        </a>
                      </Show>
                    </td>
                    <td
                      class={clsx(
                        "py-1 text-right tabular-nums",
                        entry.score >= 0 ? "text-emerald-700" : "text-red-700",
                      )}
                    >
                      {signed(entry.score)}
                    </td>
                    {/* The clock is the first thing to go when the table has
                        to fit a phone; the rows are in order anyway. */}
                    <td class="py-1 text-right text-xs whitespace-nowrap text-stone-500">
                      <span class="sm:hidden">
                        {format(new Date(entry.playedAt), "d MMM")}
                      </span>
                      <span class="hidden sm:inline">
                        {format(new Date(entry.playedAt), "d MMM, HH:mm")}
                      </span>
                    </td>
                  </tr>
                );
              }}
            </For>
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={props.onClear}
        class="mt-3 self-start border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-700 transition hover:border-stone-800"
      >
        Clear history
      </button>
    </>
  );
};
