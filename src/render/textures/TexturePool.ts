import type { EncodedTextures } from "./TexCanvas";
import { runTexJob, type TexJob } from "./families";

interface Reply {
  id: number;
  enc?: EncodedTextures;
  error?: string;
  ms?: number;
}

type OnResult = (job: TexJob, enc: EncodedTextures, ms: number) => Promise<void> | void;

/**
 * Pool de Web Workers pour générer les textures procédurales en parallèle (un worker par
 * cœur disponible, 6 max). Repli automatique sur le thread principal si les workers sont
 * indisponibles ou échouent (ex. page ouverte en file://).
 */
export class TexturePool {
  /**
   * Exécute les tâches ; `onResult` est appelé sur le thread principal au fil des résultats,
   * l'un après l'autre. Mettre les tâches les plus lourdes en tête de liste.
   */
  static async run(jobs: TexJob[], onResult: OnResult): Promise<void> {
    const local = await TexturePool.runWorkers(jobs, onResult);
    for (const job of local) {
      const t0 = performance.now();
      const enc = runTexJob(job);
      await onResult(job, enc, performance.now() - t0);
    }
  }

  /** Renvoie les tâches non traitées (à faire en local). */
  private static runWorkers(jobs: TexJob[], onResult: OnResult): Promise<TexJob[]> {
    const n = Math.max(0, Math.min(6, (navigator.hardwareConcurrency || 4) - 1, jobs.length));
    const workers: Worker[] = [];
    try {
      for (let i = 0; i < n; i++) workers.push(new Worker(new URL("./texture.worker.ts", import.meta.url), { type: "module" }));
    } catch {
      for (const w of workers) w.terminate();
      return Promise.resolve(jobs);
    }
    if (!workers.length) return Promise.resolve(jobs);

    return new Promise<TexJob[]>((resolve) => {
      const failed: TexJob[] = [];
      const inFlight = new Map<Worker, number>();
      let next = 0;
      let done = 0;
      let alive = workers.length;
      let chain: Promise<void> = Promise.resolve();
      const complete = (): void => {
        if (done < jobs.length) return;
        for (const w of workers) w.terminate();
        void chain.then(() => resolve(failed));
      };
      const feed = (w: Worker): void => {
        if (next >= jobs.length) return;
        const id = next++;
        inFlight.set(w, id);
        w.postMessage({ id, job: jobs[id] });
      };
      for (const w of workers) {
        w.onmessage = (e: MessageEvent<Reply>) => {
          const r = e.data;
          inFlight.delete(w);
          const job = jobs[r.id]!;
          if (r.enc) {
            const enc = r.enc;
            chain = chain.then(() => onResult(job, enc, r.ms ?? 0));
          } else failed.push(job);
          done++;
          feed(w);
          complete();
        };
        w.onerror = (ev) => {
          ev.preventDefault();
          w.onmessage = null;
          w.onerror = null;
          w.terminate();
          alive--;
          const id = inFlight.get(w);
          inFlight.delete(w);
          if (id !== undefined) {
            failed.push(jobs[id]!);
            done++;
          }
          if (alive === 0) {
            // plus aucun worker : le reste passe en local
            while (next < jobs.length) {
              failed.push(jobs[next++]!);
              done++;
            }
          }
          complete();
        };
        feed(w);
      }
    });
  }
}
