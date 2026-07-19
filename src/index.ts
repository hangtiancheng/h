export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/^(\d)/, "_$1");
}

/* eslint-disable @typescript-eslint/no-non-null-assertion */
function pathExistenceQueries(
  n: number,
  nums: number[],
  maxDiff: number,
  queries: number[][],
): boolean[] {
  const pa = new Map<number, number>(
    Array.from({ length: n }, (_, idx) => [idx, idx]),
  );

  const find = (x: number) => {
    const px = pa.get(x)!;
    if (px !== x) {
      const rt = pa.get(px)!;
      pa.set(x, rt);
      return rt;
    }
    return px;
  };

  const union = (x: number, y: number) => {
    const px = find(x);
    const py = find(y);
    if (px === py) return;
    pa.set(py, px);
  };

  const isSame = (x: number, y: number) => {
    const px = find(x);
    const py = find(y);
    return px === py;
  };

  for (let i = 1; i < nums.length; i++) {
    if (nums[i] - nums[i - 1] <= maxDiff) {
      union(i - 1, i);
    } else {
      pa.set(nums[i], nums[i]);
    }
  }

  const ans: boolean[] = [];
  for (const [a, b] of queries) {
    ans.push(isSame(a, b));
  }
  return ans;
}

// /**
//  * Definition for singly-linked list.
//  * class ListNode {
//  *     val: number
//  *     next: ListNode | null
//  *     constructor(val?: number, next?: ListNode | null) {
//  *         this.val = (val===undefined ? 0 : val)
//  *         this.next = (next===undefined ? null : next)
//  *     }
//  * }
//  */

// function deleteMiddle(head: ListNode | null): ListNode | null {

// };

class LRUCache {
  cap: number;
  kvs = new Map<number, number>();

  constructor(capacity: number) {
    this.cap = capacity;
  }

  get(key: number): number {
    if (!this.kvs.has(key)) {
      return -1;
    }
    const val = this.kvs.get(key)!;
    // Re-insert to move key to end (most recently used)
    this.kvs.delete(key);
    this.kvs.set(key, val);
    return val;
  }

  put(key: number, value: number): void {
    if (this.kvs.has(key)) {
      // Delete first so re-insert moves it to end
      this.kvs.delete(key);
    } else if (this.kvs.size >= this.cap) {
      // Evict the least recently used (first entry in insertion order)
      const [k, v] = this.kvs[Symbol.iterator]().next().value!;
      this.kvs.delete(k);
    }
    this.kvs.set(key, value);
  }
}

/**
 * Your LRUCache object will be instantiated and called as such:
 * var obj = new LRUCache(capacity)
 * var param_1 = obj.get(key)
 * obj.put(key,value)
 */

function gcdOfOddEvenSums(n: number): number {
  let sumOdd = 0,
    sumEven = 0;
  for (let i = 1; i <= 2 * n; i++) {
    if (i % 2 === 0) {
      sumEven += i;
    } else {
      sumOdd += i;
    }
  }

  // Euclid's algorithm
  const gcd = (a: number, b: number): number => {
    return b === 0 ? a : gcd(b, a % b);
  };

  const lcm = (a: number, b: number) => {
    return (a / gcd(a, b)) * b;
  };

  return gcd(sumEven, sumOdd);
}

class ListNode {
  val: number;
  next: ListNode | null;
  constructor(val?: number, next?: ListNode | null) {
    this.val = val === undefined ? 0 : val;
    this.next = next === undefined ? null : next;
  }
}

function deleteMiddle(head: ListNode | null): ListNode | null {
  if (!head!.next) {
    return null;
  }
  const vh = new ListNode(NaN, head);
  let s: ListNode | null = vh,
    ps: ListNode | null = null,
    f: ListNode | null = vh;
  while (f !== null && f.next !== null) {
    f = f.next.next;
    ps = s;
    s = s!.next;
  }
  if (f) {
    const tmp = s!.next!.next;
    s!.next!.next = null;
    s!.next = tmp;
    vh.next = null;
  } else {
    const tmp = ps!.next!.next;
    ps!.next!.next = null;
    ps!.next = tmp;
    vh.next = null;
  }
  return head;
}
function processStr(s: string): string {
  let ans: string[] = [];
  const arr = s.split("");
  let r = true;
  for (const chr of arr) {
    if (chr === "*" && arr.length) {
      if (r) {
        ans.pop();
      } else {
        ans.shift();
      }
      continue;
    }

    if (chr === "#") {
      ans = [...ans, ...ans];
      continue;
    }

    if (chr === "%") {
      r = !r;
      continue;
    }

    if (r) {
      ans.push(chr);
    } else {
      ans.unshift(chr);
    }
  }

  return r ? ans.join("") : ans.reverse().join("");
}

function shuffle(nums: number[], n: number): number[] {
  return Array.from({ length: 2 * n }, (_, idx) =>
    idx % 2 === 1 ? nums[Math.floor(idx / 2)] : nums[n + idx / 2],
  );
}

function findMaxConsecutiveOnes(nums: number[]): number {
  return nums
    .join("")
    .split(/0+/)
    .toSorted((a, b) => b.length - a.length)[0].length;
}

function findErrorNums(nums: number[]): number[] {
  const all = new Set<number>(
    Array.from({ length: nums.length }, (_, idx) => idx + 1),
  );
  const ans: number[] = [];
  for (const num of nums) {
    if (all.has(num)) all.delete(num);
    else ans.push(num);
  }
  ans.push(all.keys().next().value!);
  return ans;
}
