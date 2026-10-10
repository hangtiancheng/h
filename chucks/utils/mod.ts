import { createInterface } from "node:readline";

const rl = createInterface({
  input: process.stdin,
});

const iter = rl[Symbol.asyncIterator]();

const input = async () => (await iter.next()).value;

const MOD = 1_000_000_007;

function qpow(x_: number, n_: number, m: number): number {
  let x = BigInt(x_) % BigInt(m);
  let n = BigInt(n_);
  const mod = BigInt(m);
  let ans = 1n;
  while (n > 0n) {
    if (n % 2n === 1n) {
      ans = (ans * x) % mod;
    }
    x = (x * x) % mod;
    n /= 2n;
  }
  return Number(ans);
}

(async function () {
  const a = Number.parseInt((await input()) ?? "");

  const b = Number.parseInt((await input()) ?? "");

  const res = (a + b) % MOD;
  console.log(res);

  const res2 = (a - b + MOD) % MOD;
  console.log(res2);

  const c = Number.parseInt((await input()) ?? "");
  const res3 = ((c % MOD) + MOD) % MOD;
  console.log(res3);

  const res4 = (a * b) % MOD;
  console.log(res4);

  const res5 = (((a * b) % MOD) * c) % MOD;
  console.log(res5);

  const res6 = (a * qpow(b, MOD - 2, MOD)) % MOD;
  console.log(res6);

  rl.close();
})();
