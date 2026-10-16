import os from "os";
import { Worker } from "node:worker_threads";

interface NodeWorker extends Worker {
  currentResolve: ((value: unknown) => void) | null;
  currentReject: ((err: Error) => void) | null;
}

export interface Options {
  max?: number;
}

export class WorkerImpl<
  Args extends unknown[],
  Ret = unknown,
> implements NodeWorker {
  private code: string;
  private max: number;
  private pool: NodeWorker[];
  private idlePool: NodeWorker[];
  private queue: [(worker: NodeWorker) => void, (err: Error) => void][];

  currentResolve: ((value: unknown) => void) | null;
  currentReject: ((err: Error) => void) | null;

  constructor(
    fn: (...args: Args) => Promise<Ret> | Ret,
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

  private async _getAvailableWorker(): Promise<NodeWorker> {
    // Has idle one?
    if (this.idlePool.length) {
      return this.idlePool.shift()!;
    }

    // Can spawn more?
    if (this.pool.length < this.max) {
      const worker = new WorkerImpl(this.code, {
        eval: true,
      }) satisfies NodeWorker;
      worker.on("message", (res) => {
        if (worker.currentResolve) {
          worker.currentResolve(res);
          worker.currentResolve = null;
        }
      });

      worker.on("error", (err) => {
        if (worker.currentReject) {
          worker.currentReject(err);
          worker.currentReject = null;
        }
      });

      worker.on("exit", (exitCode) => {
        const i = this.pool.indexOf(worker);
        if (i > -1) {
          this.pool.splice(i, 1);
        }

        if (exitCode !== 9 && worker.currentReject) {
          worker.currentReject(
            new Error(`Worker ${i} stopped with non-0 exit code ${exitCode}`),
          );
          worker.currentReject = null;
        }
      });

      this.pool.push(worker);
      return worker;
    }

    // No one is available, we have to wait
    let resolve: (worker: NodeWorker) => void;
    let reject: (err: Error) => any;

    const onWorkerAvailablePromise = new Promise<NodeWorker>(
      (_resolve, _reject) => {
        resolve = _resolve;
        reject = _reject;
      },
    );
    this.queue.push([resolve, reject]);
    return onWorkerAvailablePromise;
  }

  private _assignDoneWorker(worker: NodeWorker) {
    // Someone is waiting already?
    if (this.queue.length) {
      const [resolve] = this.queue.shift()!;
      resolve(worker);
      return;
    }

    // Take a rest
    this.idlePool.push(worker);
  }
}

function genWorkerCode<Fn extends Function = Function>(fn: Fn) {
  return `
const doWork = ${fn.toString()};
const { parentPort } = require('work_threads');
parentPort.on('message', async (args) => {
  const res = await doWork(...args);
  parentPort.postMessage(res);
})`;
}
