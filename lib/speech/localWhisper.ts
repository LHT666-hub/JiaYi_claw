import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import path from "node:path";

type WorkerReply =
  | { type: "ready"; baseModel: string; adapterModel: string; device: string }
  | { type: "result"; id: string; text: string }
  | { type: "error"; id: string; error: string };

type PendingRequest = {
  resolve: (value: SpeechResult) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

export type SpeechResult = {
  text: string;
  provider: "whisper-wu-local";
  model: string;
  device: string;
};

class WhisperWorker {
  private process: ChildProcessWithoutNullStreams | null = null;
  private pending = new Map<string, PendingRequest>();
  private ready: Promise<void> | null = null;
  private model = "openai/whisper-small + whisper-wu";
  private device = "cpu";

  private start() {
    if (this.ready) return this.ready;

    this.ready = new Promise<void>((resolve, reject) => {
      const root = process.cwd();
      const python = process.env.ASR_PYTHON_PATH || path.join(root, ".venv-whisper-wu", "Scripts", "python.exe");
      const worker = path.join(root, "scripts", "whisper-wu", "worker.py");
      const child = spawn(python, ["-u", worker], {
        cwd: root,
        env: {
          ...process.env,
          HF_HUB_OFFLINE: process.env.HF_HUB_OFFLINE ?? "1",
          TRANSFORMERS_OFFLINE: process.env.TRANSFORMERS_OFFLINE ?? "1",
        },
        windowsHide: true,
      });
      this.process = child;

      const startupTimeout = setTimeout(() => {
        child.kill();
        reject(new Error("ASR_WORKER_START_TIMEOUT"));
      }, Number(process.env.ASR_START_TIMEOUT_MS ?? 120_000));

      const lines = createInterface({ input: child.stdout });
      lines.on("line", (line) => {
        let reply: WorkerReply;
        try {
          reply = JSON.parse(line) as WorkerReply;
        } catch {
          return;
        }

        if (reply.type === "ready") {
          clearTimeout(startupTimeout);
          const adapter = path.isAbsolute(reply.adapterModel) ? "kaiwang0574/whisper-wu" : reply.adapterModel;
          this.model = `${reply.baseModel} + ${adapter}`;
          this.device = reply.device;
          resolve();
          return;
        }

        const pending = this.pending.get(reply.id);
        if (!pending) return;
        clearTimeout(pending.timeout);
        this.pending.delete(reply.id);
        if (reply.type === "result") {
          pending.resolve({ text: reply.text, provider: "whisper-wu-local", model: this.model, device: this.device });
        } else {
          pending.reject(new Error(reply.error));
        }
      });

      child.stderr.on("data", () => {
        // Model warnings stay server-side and never leak into resident responses.
      });
      child.on("error", (error) => {
        clearTimeout(startupTimeout);
        reject(error);
      });
      child.on("exit", () => {
        clearTimeout(startupTimeout);
        reject(new Error("ASR_WORKER_EXITED"));
        for (const pending of this.pending.values()) {
          clearTimeout(pending.timeout);
          pending.reject(new Error("ASR_WORKER_EXITED"));
        }
        this.pending.clear();
        this.process = null;
        this.ready = null;
      });
    });

    return this.ready;
  }

  async transcribe(audioPath: string) {
    await this.start();
    if (!this.process?.stdin.writable) throw new Error("ASR_WORKER_UNAVAILABLE");

    return new Promise<SpeechResult>((resolve, reject) => {
      const id = crypto.randomUUID();
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("ASR_TRANSCRIBE_TIMEOUT"));
      }, Number(process.env.ASR_TRANSCRIBE_TIMEOUT_MS ?? 60_000));
      this.pending.set(id, { resolve, reject, timeout });
      this.process!.stdin.write(`${JSON.stringify({ id, audioPath })}\n`);
    });
  }
}

declare global {
  var __jiayiWhisperWorker: WhisperWorker | undefined;
}

const worker = globalThis.__jiayiWhisperWorker ?? new WhisperWorker();
if (process.env.NODE_ENV !== "production") globalThis.__jiayiWhisperWorker = worker;

export function transcribeLocalAudio(audioPath: string) {
  return worker.transcribe(audioPath);
}
