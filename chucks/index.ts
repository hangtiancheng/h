import os from "os";
import { Worker } from "node:worker_threads";

interface NodeWorker<Ret> extends Worker {
  currentResolve: ((value: Ret | PromiseLike<Ret>) => void) | null;
  currentReject: ((err: unknown) => void) | null;
}

export interface Options {
  max?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class WorkerPool<Args extends any[], Ret> {
  private code: string;
  private max: number;
  private pool: NodeWorker<Ret>[];
  private idlePool: NodeWorker<Ret>[];
  private queue: [(worker: NodeWorker<Ret>) => void, (err: Error) => void][];

  constructor(
    fn: (...args: Args) => Ret | Promise<Ret>,
    options: Options = {},
  ) {
    this.code = genWorkerCode(fn);
    this.max = options.max || Math.max(1, os.cpus().length - 1);
    this.pool = [];
    this.idlePool = [];
    this.queue = [];
  }

  async run(...args: Args): Promise<Ret> {
    const worker = await this._getAvailableWorker();
    return new Promise<Ret>((resolve, reject) => {
      worker.currentResolve = resolve;
      worker.currentReject = reject;
      worker.postMessage(args);
    });
  }

  stop() {
    this.pool.forEach((w) => w.unref());
    this.queue.forEach(([_, _reject]) => {
      _reject(
        new Error("Main worker pool stopped before a worker was available."),
      );
    });
    this.pool = [];
    this.idlePool = [];
    this.queue = [];
  }

  private async _getAvailableWorker(): Promise<NodeWorker<Ret>> {
    // Has idle one?
    if (this.idlePool.length) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return this.idlePool.shift()!;
    }

    // Can spawn more?
    if (this.pool.length < this.max) {
      const worker = new Worker(this.code, { eval: true }) as NodeWorker<Ret>;
      // worker.currentResolve = null;
      // worker.currentReject = null;

      worker.on("message", (res: Ret | PromiseLike<Ret>) => {
        if (worker.currentResolve) {
          worker.currentResolve(res);
          worker.currentResolve = null;
          this._assignDoneWorker(worker);
        }
      });

      worker.on("error", (err: Error) => {
        if (worker.currentReject) {
          worker.currentReject(err);
          worker.currentReject = null;
        }
      });

      worker.on("exit", (exitCode: number) => {
        const i = this.pool.indexOf(worker);
        if (i > -1) {
          this.pool.splice(i, 1);
        }

        if (exitCode !== 0 && worker.currentReject) {
          worker.currentReject(
            new Error(`Worker ${i} stopped with non-0 exit code ${exitCode}`),
          );
          worker.currentReject = null;
        }
      });

      this.pool.push(worker);
      return worker;
    }

    let resolve: (worker: NodeWorker<Ret>) => void;
    let reject: (err: Error) => void;

    // No one is available, we have to wait
    const onWorkerAvailablePromise = new Promise<NodeWorker<Ret>>(
      (_resolve, _reject) => {
        resolve = _resolve;
        reject = _reject;
      },
    );
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this.queue.push([resolve!, reject!]);
    return onWorkerAvailablePromise;
  }

  private _assignDoneWorker(worker: NodeWorker<Ret>) {
    // Someone is waiting already?
    if (this.queue.length) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const [resolve] = this.queue.shift()!;
      resolve(worker);
      return;
    }

    // Take a rest
    this.idlePool.push(worker);
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
function genWorkerCode<Fn extends Function = Function>(fn: Fn) {
  return `
const doWork = ${fn.toString()};
const { parentPort } = require('worker_threads');
parentPort.on('message', async (args) => {
  const res = await doWork(...args);
  parentPort.postMessage(res);
})`;
}
