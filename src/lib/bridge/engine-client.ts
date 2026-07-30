/**
 * Main thread handle on the solver worker.
 */

import type { AnalysisRequest, BoardAnalysis } from "./analysis";
import type { PlayChoice, PlayRequest } from "./bot-play";
import type { WorkerRequest, WorkerResponse } from "./dds.worker";

interface Resolver {
  resolve: (value: never) => void;
  reject: (error: Error) => void;
}

export class BridgeEngine {
  #worker: Worker;
  #pending = new Map<number, Resolver>();
  #nextId = 1;

  constructor() {
    this.#worker = new Worker(new URL("./dds.worker.ts", import.meta.url), {
      type: "module",
    });

    this.#worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;
      const resolver = this.#pending.get(response.id);
      if (!resolver) return;
      this.#pending.delete(response.id);
      if ("error" in response) resolver.reject(new Error(response.error));
      else (resolver.resolve as (value: unknown) => void)(response.result);
    };

    this.#worker.onerror = (event) => {
      const error = new Error(event.message || "Bridge solver failed to start");
      for (const resolver of this.#pending.values()) resolver.reject(error);
      this.#pending.clear();
    };
  }

  #send<T>(build: (id: number) => WorkerRequest): Promise<T> {
    const id = this.#nextId++;
    return new Promise<T>((resolve, reject) => {
      this.#pending.set(id, {
        resolve: resolve as (value: never) => void,
        reject,
      });
      this.#worker.postMessage(build(id));
    });
  }

  /** Loads the wasm module ahead of the first robot turn. */
  warmup(): Promise<null> {
    return this.#send<null>((id) => ({ id, kind: "warmup" }));
  }

  choosePlay(payload: PlayRequest): Promise<PlayChoice> {
    return this.#send<PlayChoice>((id) => ({ id, kind: "play", payload }));
  }

  analyse(payload: AnalysisRequest): Promise<BoardAnalysis> {
    return this.#send<BoardAnalysis>((id) => ({
      id,
      kind: "analyse",
      payload,
    }));
  }

  dispose(): void {
    this.#worker.terminate();
    this.#pending.clear();
  }
}
