import { createInterface } from "node:readline";

const rl = createInterface({
  input: process.stdin,
});

const iter = rl[Symbol.asyncIterator]();

const input = async () => (await iter.next()).value;

const MOD = 1_000_000_007;

// 快速幂
function qpow(x_: number, n_: number, m: number): number {
  let x = BigInt(x_) % BigInt(m);
  let n = BigInt(n_);
  const mod = BigInt(m);
  let ans = 1n;
  // 从高到低枚举 n 的二进制位
  while (n > 0n) {
    // 比特位是 1
    if (n % 2n === 1n) {
      ans = (ans * x) % mod;
    }
    x = (x * x) % mod;
    n /= 2n;
  }
  return Number(ans);
}

(async function () {
  const a = Number.parseInt(await input());

  const b = Number.parseInt(await input());

  // 加
  const res = (a + b) % MOD;
  console.log(res);

  // 减
  const res2 = (a - b + MOD) % MOD;
  console.log(res2);

  // 将任意整数 c 取模到 [0, MOD - 1] 中，无论 c 是正是负
  const c = Number.parseInt(await input());
  const res3 = ((c % MOD) + MOD) % MOD;
  console.log(res3);

  // 乘
  const res4 = (a * b) % MOD;
  console.log(res4);

  // 连续乘法需要连续取模
  const res5 = (((a * b) % MOD) * c) % MOD;
  console.log(res5);

  // 除
  const res6 = (a * qpow(b, MOD - 2, MOD)) % MOD;
  console.log(res6);

  rl.close();
})();
