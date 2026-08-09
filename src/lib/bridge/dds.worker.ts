/// <reference lib="webworker" />

/**
 * Background thread for everything that needs the solver.
 *
 * The wasm module is a few hundred kilobytes and its calls are synchronous, so
 * keeping it off the main thread is what stops the table from freezing while a
 * robot thinks.
 */

import {
  analyseBoard,
  type AnalysisRequest,
  type BoardAnalysis,
} from "./analysis";
import { chooseCard, type PlayChoice, type PlayRequest } from "./bot-play";
import { getSolver } from "./dds-solver";

export type WorkerRequest =
  | { id: number; kind: "warmup" }
  | { id: number; kind: "play"; payload: PlayRequest }
  | { id: number; kind: "analyse"; payload: AnalysisRequest };

export type WorkerResponse =
  | { id: number; ok: true; kind: "warmup"; result: null }
  | { id: number; ok: true; kind: "play"; result: PlayChoice }
  | { id: number; ok: true; kind: "analyse"; result: BoardAnalysis }
  | { id: number; ok: false; error: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    const dds = await getSolver();
    switch (request.kind) {
      case "warmup":
        scope.postMessage({
          id: request.id,
          ok: true,
          kind: "warmup",
          result: null,
        });
        return;
      case "play":
        scope.postMessage({
          id: request.id,
          ok: true,
          kind: "play",
          result: chooseCard(dds, request.payload),
        });
        return;
      case "analyse":
        scope.postMessage({
          id: request.id,
          ok: true,
          kind: "analyse",
          result: analyseBoard(dds, request.payload),
        });
        return;
    }
  } catch (error) {
    scope.postMessage({
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
