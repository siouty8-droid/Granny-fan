/// <reference lib="webworker" />
import { runTexJob, type TexJob } from "./families";

/** Worker de génération de textures : reçoit une tâche, renvoie les octets (transférés). */
self.onmessage = (e: MessageEvent<{ id: number; job: TexJob }>) => {
  const { id, job } = e.data;
  try {
    const t0 = performance.now();
    const enc = runTexJob(job);
    const buffers: ArrayBuffer[] = [enc.albedo.buffer];
    if (enc.normal) buffers.push(enc.normal.buffer);
    if (enc.orm) buffers.push(enc.orm.buffer);
    (self as unknown as Worker).postMessage({ id, enc, ms: performance.now() - t0 }, buffers);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) });
  }
};
