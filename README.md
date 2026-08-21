# homepage

JavaScript 常常被戏称为一门偶然成功的玩具语言

而实际上, 她出身名门, 更是成长在聚光灯之下

纵观历史, 有资格被标准化的编程语言甚少, 她因此成为多方角力的战场, 却也有幸同时得到业界与学界先驱的亲传

时至今日, 我们甚至难言是她背负了太多妥协, 还是这些妥协才成就了她呢

以史为鉴, 或许你会有自己的答案

- [字符串 (KMP/Z函数/Manacher/字符串哈希/AC自动机/后缀数组)](https://leetcode.cn/discuss/post/3144832/fen-xiang-gun-ti-dan-zi-fu-chuan-kmpzhan-ugt4/)
- [链表、二叉树与回溯 (前后指针/快慢指针/DFS/BFS/直径/LCA/一般树)](https://leetcode.cn/discuss/post/3142882/fen-xiang-gun-ti-dan-lian-biao-er-cha-sh-6srp/)
- [贪心算法 (基本贪心策略/反悔/区间/字典序/数学/思维/构造)](https://leetcode.cn/discuss/post/3091107/fen-xiang-gun-ti-dan-tan-xin-ji-ben-tan-k58yb/)
- [数学算法 (数论/组合/概率期望/博弈/计算几何/随机算法)](https://leetcode.cn/discuss/post/3584388/fen-xiang-gun-ti-dan-shu-xue-suan-fa-shu-gcai/)
- [常用数据结构 (前缀和/栈/队列/堆/字典树/并查集/树状数组/线段树)](https://leetcode.cn/discuss/post/3583665/fen-xiang-gun-ti-dan-chang-yong-shu-ju-j-bvmv/)
- [动态规划 (入门/背包/划分/状态机/区间/状压/数位/树形/优化)](https://leetcode.cn/discuss/post/3581838/fen-xiang-gun-ti-dan-dong-tai-gui-hua-ru-007o/)
- [图论算法 (DFS/BFS/拓扑排序/基环树/最短路/最小生成树/网络流)](https://leetcode.cn/discuss/post/3581143/fen-xiang-gun-ti-dan-tu-lun-suan-fa-dfsb-qyux/)
- [位运算 (基础/性质/拆位/试填/恒等式/思维)](https://leetcode.cn/discuss/post/3580371/fen-xiang-gun-ti-dan-wei-yun-suan-ji-chu-nth4/)
- [网格图 (DFS/BFS/综合应用)](https://leetcode.cn/discuss/post/3580195/fen-xiang-gun-ti-dan-wang-ge-tu-dfsbfszo-l3pa/)
- [单调栈 (矩形面积/贡献法/最小字典序)](https://leetcode.cn/discuss/post/3579480/ti-dan-dan-diao-zhan-ju-xing-xi-lie-zi-d-u4hk/)
- [二分算法 (二分答案/最小化最大值/最大化最小值/第K小)](https://leetcode.cn/discuss/post/3579164/ti-dan-er-fen-suan-fa-er-fen-da-an-zui-x-3rqn/)
- [滑动窗口与双指针 (定长/不定长/单序列/双序列/三指针/分组循环)](https://leetcode.cn/discuss/post/3578981/ti-dan-hua-dong-chuang-kou-ding-chang-bu-rzz7/)

## ACM 模式

JS/TS

```ts
import { createInterface } from "readline";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

let lineno = 0;

rl.on("line", (line: string) => {
  console.log(line);
  lineno++;

  if (lineno === 3) {
    rl.close();
  }
});
```

```ts
import { createInterface } from "node:readline";
const rl = createInterface({
  input: process.stdin,
});

const iter = rl[Symbol.asyncIterator]();
const input = async () => String((await iter.next()).value);

(async function () {
  const line = await input();
  console.log(line);
})();
```

### Go

```go
package main

import (
	"bufio"
	"fmt"
	"os"
)

func main() {
	in := bufio.NewScanner(os.Stdin)
	in.Split(bufio.ScanWords)

	for in.Scan() {
		fmt.Println(in.Text())
	}
}
```

```go
package main

import (
	"bufio"
	"os"
	"strconv"
)

var in = bufio.NewScanner(os.Stdin)

func nextInt() int {
	in.Scan()
	n, _ := strconv.Atoi(in.Text())
	return n
}

func main() {
	in.Split(bufio.ScanWords)
	n := nextInt()
	_ = n
}
```
