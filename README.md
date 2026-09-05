# homepage

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
