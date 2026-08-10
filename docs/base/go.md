# Go

<!-- cSpell: words notesleep notewakeup _Gwaiting _Grunnable -->

| 术语             | 适用场景                                                         |
| ---------------- | ---------------------------------------------------------------- |
| 睡眠 (sleep)     | Machine OS 线程调用 `notesleep` 进入睡眠, 等待 `notewakeup` 唤醒 |
| 阻塞 (blocked)   | Goroutine 主动进入 `_Gwaiting` 状态, 等待 channel、mutex、I/O    |
| 挂起 (suspended) | Goroutine 被外部强制暂停执行 (例如 `suspendG` GC 栈扫描)         |

### 阻塞 gopark/goready

- gopark(): 当前运行的 Goroutine 让出 CPU, 状态变为 _Gwaiting, Machine (OS 线程) 继续执行其他 Goroutine
- goready(): 将某个 Goroutine 的状态变为 _Grunnable, 加入 Processor 的 goroutine 队列等待调度

```js
["copy", "cut", "keydown", "contextmenu", "selectstart"].forEach((evt) => {
  document.addEventListener(evt, (e) => e.stopImmediatePropagation(), true);
});
document.designMode = "on";
```

## 基础

### 什么是协程

> 异步 task
> 协程是用户态的轻量级线程, 是线程调度的基本单位; 一个 goroutine 以很小的栈空间 (2KB) 启动 (goroutine 是有栈协程), 栈可以自动伸缩

- 进程: 进程是操作系统资源分配的基本单位, 每个进程都有独立的内存空间, 进程通过进程间通信 (IPC) 进行通信; 进程上下文切换开销较大
- 线程: 线程是 CPU 调度的基本单位, 线程是在内核态调度的, 线程通过共享内存进行通信
- 协程: 协程是用户态的轻量级线程, 协程是在用户态调度的, 没有用户态和内核态的切换开销, 协程上下文切换开销小

### make 和 new 的区别

- make 分配内存并初始化, 用于创建 slice、map 和 channel, 并返回实例
- new 只分配内存

### for range

- go 1.22 前, `for index, value := range collection` 中的 index 内存地址不会改变
- go 1.22 后, 使用 pre-iteration, `for index, value := range collection` 中的 index 内存地址会改变

```go
func mutateSlice(s []int) {
  return append(s, 1, 2) // 返回新的 slice
}
// 或者传递指针
func mutateSlice(s *[]int) {
  append(*s, 1, 2);
}
```

### 数组对比切片

- 数组是固定长度, 数组类型包括数组长度
- 切片可以改变长度, 切片是一个 struct, 包括: 指针、长度 len 和容量 cap

```go
type slice struct {
	array unsafe.Pointer // 指向底层数组的指针
	len   int // 切片长度
	cap   int // 从指针指向的位置, 到底层数组末尾的容量
}
```

### 拼接字符串

性能: strings.Join ≈ strings.Builder > bytes.Buffer > "+" > fmt.Sprintf

- strings.Join, strings.Builder 内存预分配
- "+" 需要遍历字符串
- fmt.Sprintf 需要反射获取值

### defer 执行顺序

LIFO

::: code-group

```go
import "fmt"

func test() int {
	i := 0
	defer func() {
		fmt.Println("defer1")
	}()

	defer func() {
		i++
		fmt.Println("defer2")
	}()

	return i // 拷贝返回值
}

func main() {
  // defer2
  // defer1
  // test returns 0
	fmt.Println("test returns", test())
}
```

```go
import "fmt"

func test2() (i int) {
	defer func() {
		fmt.Println("defer1")
	}()

	defer func() {
		i++
		fmt.Println("defer2")
	}()

	return i
}

func main() {
  // defer2
  // defer1
  // test returns 1
	fmt.Println("test2 returns", test2())
}
```

:::

rune 是 int32 的别名

```go
package main

import "fmt"

func main() {
  str := "Hello 上海"
  fmt.Println("len(str):", len(str)) // 12 (一个汉字 3 个字节)
  fmt.Println("rune:", len([]rune(str))) // 8
}
```

### fmt.Printf

```go
package main

import "fmt"

type stu struct {
  id int32
  name string
}

func main() {
  a := &stu{id: 1, name:"jane"}
  fmt.Printf("a=%v\n", a); // a=&{1 jane}
  fmt.Printf("a=%+v\n", a); // a=&{id:1 name:jane}
  fmt.Printf("a=%#v\n", a); // a=&main.stu{id:1, name:"jane"}
}
```

### init 函数

- init 函数比 main 函数先执行, 一个 .go 文件中 init 函数可以有多个
- 执行顺序 import -> const -> var -> `init()` -> `main()`

### 比较 interface

interface 包含 2 个字段: 类型 T 和值 V, 可以使用 == 或 != 比较 interface

```go
type emptyStu interface {}
type stuImpl struct {
  Name string
}

func main() {
  var stu1, stu2 emptyStu = &stuImpl{"jane"}, &stuImpl{"jane"}
  var stu3, stu4 emptyStu = stuImpl{"jane"}, stuImpl{"jane"}

  // stu1, stu2 类型 *stuImpl, 值是 &stuImpl{"jane"} 地址
  fmt.Println(stu1 == stu2) // false
  // stu3, stu4 类型 stuImpl, 值是 stuImpl{"jane"}
  fmt.Println(stu3 == stu4) // true
}
```

### Pitfall: nil 接口

interface 包含 2 个字段: 类型 T 和值 V, 只有 T 和 V 都是 nil 时, 接口才等于 nil

::: code-group

```go [Will not print]
type MyError struct{}

// Error implements [error].
func (m *MyError) Error() string {
 return "MyError"
}

var _ error = (*MyError)(nil)

func foo() *MyError { // 返回结构体实例指针
	var err *MyError = nil
	return err
}

func main() {
	if foo() != nil {
		fmt.Println("What can I say.") // Will not print.
	}
}
```

```go [Will print]
type MyError struct{}

// Error implements [error].
func (m *MyError) Error() string {
 return "MyError"
}

var _ error = (*MyError)(nil)

func foo() error { // 返回 typed 接口 (T = *MyError)
	var err *MyError = nil
	return err
}

func main() {
	if foo() != nil {
		fmt.Println("What can I say.") // Will print
	}
}
```

:::

### 函数传参

Go 函数传参都是值拷贝

### 逃逸分析

```go
go build -gcflags '-m -m -l' ./src/main.go
```

### 逃逸场景

1. 函数返回局部变量的指针: 局部变量从栈逃逸到堆
2. closure 闭包
3. any/interface{}: 编译器不知道 any 类型的变量内部是否有持有指针
4. reflect 反射
5. 大对象、栈空间不足
6. 切片/map 的 len/cap 不确定、切片/map 扩容
7. 切片/map 的成员持有指针
8. 发送指针到 channel: 编译器不知道接收方的生命周期

### 多返回值

1. 编译时, 计算函数 (多个) 返回值的总大小
2. 调用者 caller 在栈上预留一块连续内存: callee 参数区 + callee 返回值区
3. 被调用者 callee 执行到 return 语句时, 拷贝 return 的 (多个) 值到预留的返回值区
4. 被调用者 callee 执行结束
5. Go 1.17 开始, (多个) 返回值优先通过寄存器传递

### unsafe.Pointer 对比 uintptr

- unsafe.Pointer 和 uintptr 可以相互转换
- unsafe.Pointer 会被垃圾回收器跟踪, unsafe.Pointer 指向的内存不会被错误回收
- uintptr 是保存地址值的无符号整数, 不会被垃圾回收器跟踪, 指向的内存随时可能被回收

### slice 扩容

- 如果旧切片容量 oldCap < 256 时, 新切片容量 newCap 扩容 2x
- 如果旧切片容量 oldCap >= 256 时, 随切片容量增大, 新切片容量 newCap 从扩容 2x 平滑过渡到扩容 1.25x

```go
newCap := oldCap
doubleCap := newCap + newCap
if newLen > doubleCap {
  newCap = newLen
} else {
  const threshold = 256
  if oldCap < threshold {
    newCap = doubleCap // 小 slice: 扩容 2x
  } else {
    for 0 < newCap && newCap < newLen {
      // 随切片容量增大, 从扩容 2x 平滑过渡到扩容 1.25x
      newCap += (newCap + 3*threshold) / 4
    }
  }
}
capMem := roundupSize(uintptr(newCap) * elemSize)
newCap = int(capMem / elemSize)
```

`roundupSize`: Go 预定义了一组 size class: 8, 16, 24, 32, ...., 数组扩容时 cap 数组容量 \* elemSize 元素大小向上取整到最近的 size class

```go
func main() {
	a := []int{1, 2, 3, 4, 5}
	b := a[1:3]        // len=2, cap=4
	b = append(b, 100) // cap 足够, 不扩容
	fmt.Println(a)     // [1 2 3 100 5]
	fmt.Println(b)     // [2 3 100]

	b2 := append(b, 200) // cap 足够, 不扩容
  fmt.Println(a) // [1 2 3 100 200]
	fmt.Println(b2) // [2 3 100 200]
}
```

切片 demo

```go
func main() {
	a := []int{1, 2, 3}
  b := a[:]
  a = append(a, 4); // [1 2 3 4]
  b = append(b, 5) // [1 2 3 5]
  fmt.Println(a, b)
}
```

修复

1. 使用 `b := a[1:3:3]` 强制 cap=len, append b 时 cap = len, 必然触发扩容
2. 显式拷贝 `b := make([]int, 2); copy(b, a[1:3])`, 或 `b := slice.Clone(a[1:3])`

Pitfall: 大数组的小切片导致的内存驻留: 例如从 100MB 大数组 data 中切片得到的 `data[:100]`, 会导致整个 100MB 大数组无法被 GC

### `var s []int` 对比 `s := []int{}`

|                                     | `var s []int` | `s := []int{}`                                          |
| ----------------------------------- | ------------- | ------------------------------------------------------- |
| array 指针                          | nil           | 指向 `runtime.zerobase` (所有长度 = 0 的对象共享的地址) |
| len, cap                            | len=0, cap=0  | len=0, cap=0                                            |
| `s == nil`                          | true          | false                                                   |
| `json.Marshal`                      | `null`        | `[]`                                                    |
| len / for / range / append 是否安全 | 全部安全      | 全部安全                                                |

### 从 slice 中删除元素

```go
// 保序删除
s = append(s[:i], s[i+1:]...)
s = slices.Delete(s, i, i+1)

// 不保序删除
s[i] = s[len(s) - 1]
s = s[:len(s) - 1]
```

删除元素可能导致内存泄漏: 当元素是指针, 或者包含指针的结构体实例时, 需要手动断开引用

```go
// case1
s = append(s[:i], s[i+1:]...)
s[len(s) - 1] = nil

// case2
copy(s[i:], s[i+1:])
s[len(s) - 1] = nil // 手动断开引用
s = s[:len(s) - 1]
```

`slices.Delete(s, i, i+1)` 自动断开引用

::: code-group

```go
func main() {
	slice := []int{0, 1, 2, 3, 4, 5, 6, 7, 8, 9}
	s1 := slice[2:5]
	s2 := s1[2:6:7]

	s2 = append(s2, 100)
	s2 = append(s2, 200)

	s1[2] = 20

	fmt.Println(s1) // [2 3 20]
	fmt.Println(s2) // [4 5 6 7 100 200]
	fmt.Println(slice) // [0 1 2 3 20 5 6 7 100 9]
}
```

:::

### map

- go 的 map 的遍历是无序的, ES 的 map 遍历是按插入顺序的
- go 的 map 并发不安全: get/set (upsert)/for range/remove 时都会检测写标志
  - 如果写标志已被置位, 则直接抛出 fatal error, 不能被 recover 捕获
  - 如果写标志未被置位, 则 set/remove 先将写标志置位, 再进行后续操作
- map 的 key 必须 comparable 可比较
- 无法对 map 的 key 或 value 取地址

### map 扩容

桶数: 2^B

- 负载因子超过阈值 6.5 (kv 键值对数 > 6.5 \* 桶数): 触发 2x 双倍扩容, B += 1
- 溢出的桶数量过多: 触发等量扩容, 将稀疏的 kv 键值对排列紧凑
  - B < 15, 桶数 2^B < 2 ^ 15, 溢出的桶数量 >= 2^B 时, 触发等量扩容
  - B >= 15, 即桶数 2^B >= 2 ^ 15, 溢出的桶数量 >= 2^15 时, 触发等量扩容

### map 底层实现

Go <1.24

- 计算 hash(key), 低 B 位决定哪个桶
- 一个桶装满 8 个 kv 后, 链接一个溢出桶
- 桶中 8 个 key 连续放、8 个 value 连续放

```txt
hmap
  ├── count       kv 数量 len(map) = count
  ├── B           桶数量 = 2^B
  ├── buckets ──> [桶 0][桶 1][桶 2]...[桶 2^B-1]
  └── oldbuckets  扩容时的旧桶
```

```go
// cSpell: words hmap noverflow bmap oldbuckets nevacuate mapextra
type hmap struct {
  count     int             // kv 数量, len(m) 直接返回 count
  flags     uint8           // 状态标志, 例如 hashWriting 写标志
  B         uint8           // 桶数量 2^B
  noverflow uint16          // 溢出桶的近似数量
  hash0     uint32          // 哈希种子
  buckets    unsafe.Pointer // 指向 buckets 桶数组 [2^B]bmap 的指针
  oldbuckets unsafe.Pointer // 扩容时的旧 buckets 桶数组
  nevacuate  uintptr        // 表示搬迁进度的计数器: 小于该值的桶已搬迁完成
  extra     *mapextra       // 管理溢出桶
}
```

Go <1.24: 渐进式搬迁

- map 触发扩容时, 只分配新内存, 不会 stop the world 一次性将所有数据移动到新内存
- 后续的每次 set (upsert)/remove 时, 同时搬迁 1~2 个旧桶中的数据
- 将大的扩容成本分摊到后续的多次 set (upsert)/remove 操作
- get 和 for range 不参与搬迁, 触发扩容后如果只读不写, 则会一直停在「扩容中」状态

Go >=1.24: swiss table

map 由多个 swiss table 组成

- 1 个 swiss table 最多 1024 个 kv
- 1 个 swiss table 最多 128 个 groups
- 1 个 group 有 8 个 slots

```txt
Map
└── directory ──> [table0][table1] swiss table
                    └── groups
```

```go
type Map struct {
  used       uint64         // kv 数量, len(m) 直接返回 used
  seed       uintptr        // 哈希种子
  dirPtr     unsafe.Pointer // 指向 directory: swiss table 指针数组 []*table 的指针
}

// 每个 swiss table 最多 1024 个 kv
type table struct {
  used     uint16
  capacity uint16
  groups   groupsReference  // group 数组
  // 1 个 swiss table 最多 128 个 groups
  // 1 个 group 有 8 个 slots
}
```

- map 改为 directory 目录 + 多个 swiss table 的结构, 每个 swiss table 最多 1024 个 kv 键值对 (128 groups \* 8 slots): swiss table 是 <=128 个 groups 的集合, group 是 8 个 slots 的集合
- 某个 swiss table 长度超过 7/8 时, 该 swiss table 单独扩容/分裂
- swiss table 满 1024 后分裂为 2 个 swiss table
- 单个 swiss table 的搬迁一次性完成, 不再需要渐进式搬迁

### 从 map 中删除 kv

从 map 中删除 kv, 不会立刻释放 map 占用的内存

map 底层使用桶 (bucket, Go <1.24) 或槽 (slot, Go >=1.24) 存储 kv 键值对, map 的 bucket 或 slot 内存只有 map 本身不可达时, 才会被 gc 回收

- 一个 goroutine 中, 可以一边遍历一边删除/插入 kv
  - 如果某 key 未被遍历到就被删除, 则后续不会遍历到该 kv
  - 如果一边遍历一边插入新 kv, 则后续可能遍历到, 也可能遍历不到该 kv
- 多个 goroutine 中, 不可以一边遍历一边删除/插入 kv
  - 一个 goroutine 遍历, 另一个 goroutine 删除/插入 kv, 是并发读写, go 的 map 并发不安全

## Channel

### CSP: Communicating Sequential Process

> Don't communicate by sharing memory; share memory by communicating.

通过通信来共享内存, 不要通过共享内存来通信

- Sequential Process: 即 goroutine
- Communicating: 即 channel

### channel 底层实现

- 环形缓冲区: 带缓冲的 channel 内部有一个固定大小的循环数组
  - buf 指针: 指向循环数组的指针
  - sendx、recvx: 指向下一次发送、接收的数组下标
- 两个等待队列 sendq 和 recvq: 双向链表, 保存阻塞的 goroutine
  - sendq: 保存由于 channel 满, 或者对于无缓冲 channel 没有等待中的接收者, 被阻塞的发送者
  - recvq: 保存由于 channel 空, 被阻塞的接收者
  - 条件满足时, 会唤醒对应的 goroutine
- 互斥锁: 所有的发送、接收操作都需要先获取锁, 以保证并发安全

```go
// cSpell: words hchan qcount dataqsiz sendx recvx recvq sendq waitq sudog
type hchan struct {
  qcount   uint           // 缓冲区中的元素数量
  dataqsiz uint           // make 时指定的缓冲区容量 (循环数组长度)
  buf      unsafe.Pointer // 指向循环数组的指针
  sendx    uint           // 下一次发送, 写入的循环数组下标
  recvx    uint           // 下一次接收, 读取的循环数组下标
  recvq    waitq          // 由于 channel 空, 被阻塞的接收者 goroutine 队列
  sendq    waitq          // 由于 channel 满, 或者对于无缓冲 channel 没有等待中的接收者, 被阻塞的发送者 goroutine 队列
  lock     mutex          // 互斥锁
  closed   uint32         // channel 是否已关闭
}
```

### 向 channel 中发送数据

向 channel 中发送数据的过程受到 mutex 保护, 保证并发安全

1. 先检查是否有等待中的接收者: 如果 recvq 接收者队列不为空, 则有 goroutine 等待接收数据, 直接发送数据给等待中的接收者, 同时唤醒该 goroutine 继续执行
2. 如果没有等待中的接收者, 则尝试向缓冲区中写入
   - 检查缓冲区是否有剩余空间: qcount < dataqsiz
   - 如果 qcount < dataqsiz, 则缓冲区中有剩余空间, 写入数据到 `buf[sendx]`, 更新 sendx 索引和 qcount 计数
3. 如果缓冲区满, 没有剩余空间, 则创建一个 sudog 结构体实例, 包装当前 goroutine 和数据, 加入 sendq 发送者队列, 调用 gopark 阻塞当前生产者 goroutine
4. 向「已关闭」的 channel 中发送数据会 panic

### 从 channel 中接收数据

1. 先检查是否有等待中的发送者, 如果 sendq 发送者队列不为空, 则有 goroutine 等待发送数据

- 对于无缓冲 channel, 直接从等待中的发送者接收数据
- 对于带缓冲 channel (缓冲区满), 先从缓冲区中读数据, 再将等待中的发送者的数据写入到缓冲区, 保持 FIFO 顺序

2. 如果没有等待中的发送者, 则尝试从缓冲区中读出
   - 检查该 channel 是否带缓冲、并且缓冲区中是否有数据: qcount > 0
   - 如果 qcount > 0, 则该 channel 带缓冲、并且缓冲区中有数据, 从 `buf[recvx]` 读出数据, 更新 recvx 索引和 qcount 计数
3. 如果缓冲区为空, 没有数据, 则创建一个 sudog 结构体实例, 包装当前 goroutine, 加入 recvq 接收者队列, 调用 gopark 阻塞当前消费者 goroutine
4. 从「已关闭」的 channel 中接收数据时, 不会 panic, 返回零值和 false

### channel 内存泄漏

案例

- 一个消费者 goroutine 等待从一个 channel 中接收数据, 但是生产者 goroutine 已退出, 并且未关闭该 channel, 导致消费者 goroutine 被持续阻塞, 消费者 goroutine 自身和引用的所有变量都不能被 GC 回收
- 没有 default 分支的 select 语句, 如果所有 case 发送/接收的 channel 都无法就绪, 则 goroutine 被持续阻塞, 该 goroutine 自身和引用的所有变量都不能被 GC 回收

```go
func leak() {
  in := make(chan int)  // 无缓冲、无生产者发送数据、未关闭
  out := make(chan int) // 无缓冲、无消费者接收数据

  go func() {
    // 没有 default 分支, 两个 case 都无法就绪
    // 该 goroutine 被永久阻塞, goroutine 泄漏
    select {
    case v := <-in:
      fmt.Println("recv", v)
    case out <- 1:
      fmt.Println("sent")
    }
  }()

  // leak 函数返回后, in、out、泄漏的 goroutine 都不能被 GC 回收
}
```

### 关闭 channel 可能 panic

1. 重复关闭一个 channel 会 panic
2. 关闭一个仅接收 channel 会 panic
3. 关闭一个 nil 的 channel 会 panic
4. 向「已关闭」的 channel 中发送数据会 panic

```go
var ch chan int
fmt.Println(ch == nil) // true
```

### select

```go
select {
  case data := <-ch1:
    // 从 ch1 接收数据
  case ch2 <- value:
    // 向 ch2 发送数据
  case <-timeout:
    // 超时
  default:
    // 所有 channel 都无法就绪时执行
}
```

### select 实现原理

> 要么第一轮命中、要么执行 default、要么第二轮 gopark 等待调度器唤醒

Go 使用 scase 结构体描述 select 的每个 case 语句

```go
func main() {
  ch1 := make(chan int)
  ch2 := make(chan int)
  go func() {
    time.Sleep(3 * time.Second)
    ch1 <- 3
  }()
  select {
    // 接收操作, 第二轮 main goroutine 将自己加入到 ch1 的 recvq
  case v := <-ch1:
    fmt.Println(v)
    // 发送操作, 第二轮 main goroutine 将自己加入到 ch2 的 sendq
  case v := <-ch2:
    fmt.Println(v)
  }
}
```

Go 先对所有 case 语句进行随机排序, 以避免饥饿; 再执行两轮扫描

- 第一轮检查每个 channel 是否可读写, 如果找到就绪的 case 则立即执行 (第一轮命中)
- 如果第一轮发现没有就绪的 case (第一轮未命中):
  - 如果有 default 则执行 default
  - 如果没有 default 则进入第二轮
- 第二轮将当前 goroutine (正在执行 select 语句的 goroutine) 加入到「所有」channel 的 sendq 或 recvq 等待队列中, 调用 gopark 阻塞当前 goroutine 进入睡眠, 使得当前 goroutine 让出 CPU; 某个 channel 就绪时, 调度器唤醒对应的 goroutine, 从其他 channel 的 sendq 和 recvq 等待队列中移除该 goroutine, 执行对应的 case 分支

编译阶段

1. 将所有的 case 分支转换为包含 channel 指针、操作类型等信息的 scase 结构体
2. 调用 runtime 函数 `selectgo` 获取被选择的 scase 结构体索引, 如果当前 scase 结构体的操作类型是 caseRecv 接收数据, 则会返回一个 bool 值 recvOK, 表示是真正收到数据, 还是因为 channel 关闭而返回零值
3. 通过 for 循环生成一组 if 语句, if 语句中判断自己是不是被选中的 case

```go
// cSpell: words scase releasetime selectgo
type scase struct {
  c    *hchan         // channel 指针
  elem unsafe.Pointer // 数据元素指针, 用于存放发送/接收的数据
  kind uint16         // 操作类型: caseNil、caseRecv、caseSend、caseDefault
  pc   uintptr        // 程序计数器, 用于调试
  releasetime int64   // 释放时间, 用于竞态检测
}
```

## Sync

### 并发安全的读写共享变量

1. channel: 通过通信转移数据所有权
2. mutex: 互斥锁
3. 原子操作: 无锁操作
4. 信号量: 控制并发访问的数量

::: code-group

```go [channel]
func main() {
  ch := make(chan int)
  go func() {
    ch <- 42 // 发送方转移数据所有权
  }()
  fmt.Println(<-ch) // 42
}
```

```go [mutex]
func main() {
  var mu sync.Mutex
  var count int
  var wg sync.WaitGroup
  for i := 0; i < 1000; i++ {
    wg.Add(1)
    go func() {
      defer wg.Done()
      mu.Lock()
      count++
      mu.Unlock()
    }()
  }
  wg.Wait()
  fmt.Println(count) // 1000
}
```

```go [原子操作]
func main() {
  var count atomic.Int64
  var wg sync.WaitGroup
  for i := 0; i < 1000; i++ {
    wg.Add(1)
    go func() {
      defer wg.Done()
      count.Add(1)
    }()
  }
  wg.Wait()
  fmt.Println(count.Load()) // 1000
}
```

```go [信号量 channel]
func main() {
	sem := make(chan struct{}, 3) // 最多 3 个并发
	var wg sync.WaitGroup
	for i := range 10 {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			sem <- struct{}{}        // 获取
			defer func() { <-sem }() // 释放
			fmt.Println(id)
      time.Sleep(3 * time.Second)
		}(i)
	}
	wg.Wait()
}
```

```go [信号量 semaphore]
func main() {
	sem := semaphore.NewWeighted(3) // 最多 3 个并发
	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			sem.Acquire(context.Background(), 1)
			defer sem.Release(1)
			fmt.Println(id)
			time.Sleep(3 * time.Second)
		}(i)
	}
	wg.Wait()
}
```

:::

### 如何实现原子操作

Go "sync/atomic" 包中的函数, 编译期转换为目标架构 (x86/arm) 的原子机器指令; 例如在 x86 架构上, `atomic.AddInt64` 会转换为 `LOCK ADD` 指令, LOCK 前缀锁缓存行 (cache line), 保证当前 CPU 对该缓存行的读、改、写 (read-modify-write) 都是独占的, 其他 CPU 在该指令完成前, 不能读写该缓存行 (缓存一致性协议 MESI)

### 锁对比原子操作

- 锁是操作系统或编程语言提供的, 获取锁失败时, goroutine 自旋 4 次后阻塞, 而不是 CPU 空转, 锁的开销远大于原子操作, 但是可以保护一段代码块 (临界区)
- 原子操作是 CPU 提供的原子机器指令, 保证对单个数据的单次读、改、写操作是不可分割的, 性能极高, 不涉及操作系统和 goroutine 的阻塞

阻塞: gopark() 当前运行的 Goroutine 让出 CPU, 状态变为 _Gwaiting, Machine (OS 线程) 继续执行其他 Goroutine

### 互斥锁 mutex 的底层实现

```go
// cSpell: words sema
type Mutex struct {
  state int32
  sema uint32 // 信号量
}
```

state 的结构

```txt
31                 3               2            1             0
+------------------+---------------+------------+-------------+
| mutexWaiterShift | mutexStarving | mutexWoken | mutexLocked |
|    (29 bit)      |   (1 bit)     |  (1 bit)   |  (1 bit)    |
+------------------+---------------+------------+-------------+
        |               |                  |                 |
        V               V                  V                 V
阻塞等待锁的 G 数量  该 mutex 是否饥饿  是否有 G          该 mutex 是否已被锁定
G 解锁时根据该值     0: 未饥饿          已被唤醒          0: 没有锁定
判断是否需要释放     1: 饥饿            0: 没有 G 被唤醒  1: 已被锁定
sema 信号量                             1: 已有 G 被唤醒
```

<!-- cSpell: words Semacquire Semrelease semtable semroot -->

```txt
Lock (阻塞 goroutine)                UnLock (唤醒 goroutine)
        │                                      │
        V                                      V
runtime_Semacquire                    runtime_Semrelease
        │                                      │
        └──────────────────┬───────────────────┘
                           V
  通过 sema 变量地址的 hash 值从 semtable 中找到 semroot
                           │
                           V
       通过 sema 变量地址从 semroot 中找到 sudog
                    │                  │
                    V                  V
  将 g 加入 sudog 等待队列并阻塞 g   从 sudog 等待队列中取出 g 并唤醒
```

### Mutex 的两种模式

1. 正常模式 Normal Mode: 乐观的自旋锁, 新来的 goroutine 最多自旋 4 次后, 如果没有竞争到锁, 则加入 goroutine 等待队列
2. 饥饿模式 Starvation Mode: goroutine 在等待队列中等到超过 1ms 后, mutex 切换到饥饿模式; 饥饿模式下, 新来的 goroutine 不会自旋, 直接加入 goroutine 等待队列

### 自旋的目的

自旋的目的: 以极小的 CPU 空转开销为代价, 避免一次 goroutine 阻塞/唤醒的上下文切换, 锁竞争不激烈、锁占用时间 (临界区) 极短的场景下节约资源

### mutex 被一个 goroutine G1 占有, 其他 goroutine 等待 G1 释放 mutex, G1 释放 mutex 后, 哪个等待中的 goroutine 可以优先占有 mutex

1. 正常模式 Normal Mode 下, 锁被释放时, 等待队列中的第一个 goroutine 会被唤醒, 但是需要和新来的、自旋中的 goroutine 竞争锁
2. 饥饿模式 Starvation Mode 下, 锁被释放时, 等待队列中的第一个 goroutine 会被唤醒并直接占有锁, 新来的 goroutine 不会自旋, 直接加入 goroutine 等待队列

```go
// cSpell: words getg runq runqempty
const active_spin = 4

func sync_runtime_canSpin(i int) bool {
  if nproc() <= 1 { // 单个 CPU
    return false
  }
  if i >= active_spin { // 最多自旋 4 次
    return false
  }
  if !runqempty() { // runq 非空
    // runq: Processor 环形 goroutine 等待队列
    // 存放可运行、等待被 Machine 执行的 goroutine
    return false
  }
  // ...
  return true
}
```

### sync.Once

sync.Once 保证一个函数在程序的生命周期内, 无论该函数在多少个 goroutine 中被调用, 都只会被执行一次

```go
type Once struct {
  done uint32 // 标志位
  m    Mutex
}
```

`once.Do(fn)` 被调用时:

1. 通过原子操作 `atomic.LoadUint32` 快速检查 done 标志位, 如果标志位为 1, 则表示 fn 已执行, 直接返回 (无锁、开销极小)
2. 如果标志位 done 为 1, 则表示 fn 可能未执行, 进入慢路径 (doSlow)
3. 慢路径中, 先加锁, 再重新检查 done 标志位; 双重检查的目的: 防止多个 goroutine 进入慢路径, 导致 fn 被重复执行
4. 如果重新检查 done 标志位仍然为 1, 则当前 goroutine 执行传递的函数 fn, 执行结束后通过原子操作 `atomic.StoreUint32` 将 done 标志位设置为 1, 最后释放锁

### WaitGroup

WaitGroup 等待组, 本质是一个原子计数器 state (counter32 + waiter32) 和一个信号量 (sema)

```go
type WaitGroup struct {
  // 用于静态分析工具 go vet 编译时检查 WaitGroup 实例是否被复制
  noCopy noCopy
  // 高 32 位 counter: 被等待的 goroutine 数量
  //   wg.Add(n) 时, counter += n
  //   wg.Done() 时, counter -= 1
  //   wg.Wait() 阻塞直到 counter == 0
  // 低 32 位 waiter: 等待的 goroutine 数量
  state atomic.Uint64
  // 用于阻塞 waiter 等待者的信号量
  sema uint32
}
```

```go
func main() {
	var wg sync.WaitGroup
	for i := 1; i <= 3; i++ {
		wg.Add(1) // counter++
		go func(id int) {
			defer wg.Done() // counter--
			time.Sleep(time.Millisecond)
			fmt.Printf("worker %d done\n", id)
		}(i)
	}

	wg.Wait() // waiter == 1, 等待者是主 goroutine
  // 最后一个 worker 调用 wg.Done() 时: counter == 0, waiter == 1
  // 使用 wg 的 sema 信号量唤醒主 goroutine: counter == 0, waiter == 0
	fmt.Println("all done")
}
```

### sync.Map 底层原理

#### Go <=1.23: read/dirty 读写分离

空间换时间: 使用两个 map (只读的 read.m 和可读写的 dirty) 实现读写分离, read 可以无锁的并发读取

- 读 sync.Map: 读 read.m
  - key 命中 read.m: 无锁的并发读取
  - key 未命中 read.m:
    - read.amended == false: 返回 nil + false
    - read.amended == true: 加 mu 互斥锁读 dirty
- 写 sync.Map
  - 如果 read.m 中有 key, 并且 entry 未 expunged: (CAS, Compare And Swap) 无锁的原子更新 entry
  - 如果 read.m 中有 key, 并且 entry expunged: 加 mu 互斥锁写 dirty
  - read.m 中没有 key
    - dirty == nil
      1. 加 mu 互斥锁
      2. 使用 read 中非 expunged 的 entries 初始化 dirty
      3. 替换 read: read.amended = true
      4. 加 mu 互斥锁写 dirty
      5. 解 mu 互斥锁
    - dirty != nil: 加 mu 互斥锁加 mu 互斥锁写 dirty

```go
type Map struct {
	mu Mutex // 保护 dirty 的读写和 read 的替换 (read = newMap)
	read atomic.Pointer[readOnly] // 只读, 可以无锁的并发读取; 替换时需要加 mu 互斥锁
	dirty map[any]*entry // 读写时需要加 mu 互斥锁, 包含 read.m 中除 expunged (被删除) 外的全部 kv + 新写入的 kv
	misses int // 上次提升后, 读 read.m 未命中、需要加锁读 dirty 的读操作次数

  // 当 misses 的值 >= dirty 长度时, dirty 提升为 read
}

type readOnly struct {
  m       map[any]*entry   // key extends comparable
  // amended: false
  //   dirty == nil, read 有全部 key, read.m 未命中时不需要查 dirty
  // amended: true
  //   dirty != nil, dirty 可能有 read 没有的 key, read.m 未命中时需要查 dirty
  amended bool
}

type entry struct {
	p atomic.Pointer[any]
}
```

#### Go >=1.24: HashTrieMap 并发哈希字典树

<!-- TODO -->

| 对比     | Go ≤ 1.23                                                     | Go ≥ 1.24              |
| -------- | ------------------------------------------------------------- | ---------------------- |
| 数据结构 | 两个 map: read/dirty                                          | 哈希字典树 HashTrieMap |
| 读       | read 命中无锁, 未命中如果 read.amended == true 则需要加互斥锁 | 无锁                   |
| 写       | 写写互斥                                                      | 不同 key 可以并发写    |

#### Go <=1.23: read 和 dirty 的关系

1. misses 的值 >= dirty 长度时, dirty 提升为 read
2. dirty != nil 时, read 是 dirty 的一个可能过期的只读快照, dirty 包含全部最新数据, read 中少了上次提升后新增的 key, 多了 expunged 已被删除的 kv

#### 为什么要区分 nil 和 expunged 两种状态

- nil: entry.p = nil 删除 read.m 中的 key 时, (CAS, Compare And Swap) 无锁的原子更新 entry.p = nil
- expunged: 写 sync.Map 时, read.m 中没有 key 并且 dirty == nil 时, 重建 dirty: 将 read 中 entry.p == nil 的 entry 升级为 entry.p = expunged, 使用 read 中非 expunged 的 entries 初始化 dirty

总结

- nil: 软删除, dirty != nil 时 entry 在 read 和 dirty 中
- expunged: 软删除, entry 只在 read 中
- 硬删除: misses 的值 >= dirty 长度时, dirty 提升为 read

sync.Map 适合读多写少的场景

## Context

在 goroutine 树中优雅的传递取消信号 (cancellation), 超时控制 (deadline) 和上下文数据 (value)

```go
type Context interface {
  // deadline 截止时间, ok 该 ctx 是否设置了截止时间
	Deadline() (deadline time.Time, ok bool)
  // 该 ctx 被取消或超时时, 返回的 channel 会被关闭
	Done() <-chan struct{}
  // 返回一个错误, 表示该 ctx 被取消的时间
  // 是主动取消 errors.New("context canceled")
  // 还是超时 var DeadlineExceeded error = deadlineExceededError{}
	Err() error
  // 可以携带 kv
	Value(key any) any
}
```

Context 主要解决 3 个问题

- 取消信号传递
- 超时控制: 例如一个 HTTP 请求调用多个下游服务, 可以通过 context.WithTimeout 设置统一超时时间: 超时时, 所有子操作都可以收到取消信号并退出; 父 context 取消时, 所有子 context 都会自动取消
- 上下文数据传递: 例如一个 HTTP 请求中, context.Value 可以传递 userId, requestId, traceId (OpenTelemetry)

### context.Value 的查找过程

context 树: 调用 `ctx.Value(key)` 时, 先检查当前 context 是否有 key, 如果当前 context 没有, 则调用 parent.Value(key) 向上查找, 直到找到对应的 key 返回对应的 value, 或者到达根 context 返回 nil

### context 取消

context 的 3 种取消方式

1. 主动取消: 使用 `context.WithCancel()` 创建的 context 返回 ctx 和 cancel 函数, 调用该 cancel 函数可以关闭 ctx 的 done channel, 所有等待该 ctx 的 goroutine 都可以通过 `ctx.Done()` 收到取消信号
2. 超时取消: 使用 `context.WithTimeout()` 和 `context.WithDeadline` 创建的 context 调用 `time.AfterFunc` 启动定时器, 超时 timeout 或截止 deadline 时自动调用 cancel 函数关闭 ctx 的 done channel, 所有等待该 ctx 的 goroutine 都可以通过 `ctx.Done()` 收到取消信号
3. 级联取消: 父 context 取消时, 所有子 context 会自动取消

::: code-group

```go [context.WithCancel]
ctx, cancel := context.WithCancel(context.Background())

go func() {
	for {
		select {
		case <-ctx.Done():
			fmt.Println("receive cancel signal", ctx.Err()) // context canceled
			return
		default:
			fmt.Println("executing...")
			time.Sleep(time.Second)
		}
	}
}()

time.Sleep(3 * time.Second)
cancel() // close done channel
time.Sleep(time.Second)
```

```go [context.WithDeadline, context.WithTimeout]
ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
defer cancel()

// 5s 耗时操作
result := make(chan string, 1)
go func() {
	time.Sleep(5 * time.Second)
	result <- "done"
}()

select {
case res := <-result:
	fmt.Println("fulfilled:", res)
case <-ctx.Done():
	fmt.Println("timeout:", ctx.Err()) // context deadline exceeded
}

deadline := time.Now().Add(5 * time.Second)
ctx2, cancel2 := context.WithDeadline(context.Background(), deadline)
defer cancel2()

<-ctx2.Done() // 阻塞, 直到 deadline 截止
fmt.Println(ctx2.Err()) // context deadline exceeded
```

:::

## GMP

GMP 调度模型

- G: Goroutine, 协程: (async task)
- M: Machine 线程 (executor of async task)
- P: Processor 逻辑 CPU (async task queue)

GOMAXPROCS: Processor 处理器数量, 默认 GOMAXPROCS == CPU 数量 `runtime.NumCPU()`

每个 Processor 维护一个可运行的本地 goroutine 队列 (runq), 是一个容量 256 goroutines 的环形缓冲区

```txt
  全局 goroutine 队列 (global runq)
    │
┌────Processor ──────────────────────┐
│  本地 goroutine 队列 (local runq)  │
│  [G0][G1][G2]...[G255]             │
└────────────────────────────────────┘
    │
  Machine (线程) 取出 Goroutine 执行
```

- Machine 线程必须绑定 Processor 逻辑 CPU 才能执行 Goroutine
- 每个 Processor 维护一个本地 goroutine 队列
- 入队: Goroutine 优先加入 Processor 的本地 goroutine 队列
- 出队: 绑定到该 Processor 的 Machine 从本地 goroutine 队列头取出 Goroutine 执行
- 本地 goroutine 队列满: 本地 goroutine 队列满 256 个时, 转移 1/2 的 goroutines 到全局队列
- 本地 goroutine 队列空: Processor 先尝试从全局 goroutine 队列中取「一批」goroutines, 再尝试从 netpoll 中取「一批」goroutines、其他 Processor 中偷「一半」的 goroutines (work stealing)

数量: Goroutine >> Machine ≈ Processor

### Go scheduler

Go scheduler 是 Go runtime 的 goroutine 调度器, 负责将 goroutine 调度到 OS 线程 (Machine) 上执行, 决定哪个 goroutine 在哪个 Machine 上执行, 调度的时机; 调度器的 schedule() 函数, 无限循环的从 Processor 的本地 goroutine 队列、netpoll 或全局 goroutine 队列中找到可运行的 goroutine, 通过 execute() 调度该 goroutine 执行; 当该 goroutine 主动让出 CPU (例如 channel 阻塞, runtime.Gosched) 或者被抢占时, schedule() 开始下一轮调度

Go 使用抢占式调度

- Go 运行时有一个专用的 OS 监控线程 sysmon, 不是 goroutine, 不受调度器管理
- sysmon 监控线程运行在 Machine 上, 并且不需要绑定 Processor; sysmon 每隔一段时间检查所有的 Processor, 发现某个 goroutine 在 Machine 上运行超过 10ms 时, 判定需要抢占
- sysmon 向运行该 goroutine 的 Machine 发送 SIGURG 信号; 信号处理代码在 Machine 的 gsignal 栈上运行, 修改被中断的上下文, 该 goroutine 被放回 Processor 的本地队列尾部, Machine 重新执行 schedule() 调度循环

### 调度的时机

1. 等待互斥锁 (mutex) 释放
2. 等待读取无缓冲、无发送者的 channel, 或者带缓冲、缓冲区全空的 channel
3. 等待写入无缓冲、无接收者的 channel, 或者带缓冲、缓冲区全满的 channel
4. `time.Sleep()`: 阻塞 goroutine
5. `runtime.Gosched()`: 主动让出 CPU, 该 goroutine 被放回全局 goroutine 队列尾部
6. 系统调用: 阻塞 Machine OS 线程

### Machine 查找可运行的 goroutine 的过程

1. Machine 先尝试从本地 goroutine 队列中取一个 goroutine, 一个 Processor 的本地 goroutine 队列通常只有一个 Machine 在消费 -> 不需要加锁
2. Machine 再尝试从全局 goroutine 队列中取一批 goroutines -> 加互斥锁
3. Machine 再尝试从 netpoll 网络轮询器中取一批 goroutines -> epoll 非阻塞
4. Machine 尝试从其他 Processor 中偷被偷者一半的 goroutines (work stealing) -> CAS + 自旋

### GMP 为什么需要 Processor

- 如果没有 Processor (的本地 goroutine 队列), 则所有的 Machine 都去全局队列取任务 -> 需要加互斥锁; 高并发场景下锁竞争激烈
- 一个 Processor 的本地 goroutine 队列通常只有一个 Machine 在消费 -> 不需要加锁

### Processor 和 Machine 的创建时机

<!-- cSpell: words sched maxmcount newm newosproc mstart Flock LOCK_EX -->

- Processor 创建时机: 调度器初始化时, 一次性创建 GOMAXPROCS 个 Processor 对象, 存储到全局数组中; 只有调用 `runtime.GOMAXPROCS(n)`,并且 n > 当前 Processor 数量时, 才会创建新的 Processor
- Machine 创建时机: Machine 按需创建, 初始化时只有 m0 (Go 启动时创建的第一个 Machine), 以下情况会创建新的 Machine
  - 所有 Machine 都在执行阻塞的系统调用, 但是有可运行的 goroutine 等待执行
  - 没有空闲的 Machine 可以绑定 Processor 执行 goroutine
- Machine 的数量受到 runtime 的 sched.maxmcount 限制 (默认 10_000), 可以调用 `debug.SetMaxThreads()` 调整
- 新的 Machine 调用 `runtime.newm()` 创建: `newm()` 先为该 Machine 分配独立的 g0, 再调用 `newosproc()` 创建新的 OS 线程; Machine 创建完成后, 新的 Machine 执行 mstart() 调度循环

```go
package main

import (
	"fmt"
	"os"
	"runtime"
	"runtime/debug"
	"syscall"
	"time"
)

func main() {
	// Processor 数量 2
	runtime.GOMAXPROCS(2)
	// Machine 数量上限: sched.maxmcount
	// 可以调用 debug.SetMaxThreads() 调整 sched.maxmcount
	debug.SetMaxThreads(100)

	path := os.TempDir() + "/flock-demo"
	os.WriteFile(path, nil, 0o644)
	defer os.Remove(path)

	// goroutine 0 先占有文件锁 3s
	go func() {
		f, _ := os.OpenFile(path, os.O_RDONLY, 0)
		syscall.Flock(int(f.Fd()), syscall.LOCK_EX)
		time.Sleep(3 * time.Second)
		f.Close()
	}()
	time.Sleep(100 * time.Millisecond)

	// 5 个 goroutine 全部阻塞在 flock 系统调用上等待锁
	// 所有 Machine 都在执行阻塞的系统调用, 没有空闲的 Machine 可以绑定 Processor
	// 但是有可运行的 goroutine 等待执行
	// runtime 调用 newm() 创建新的 Machine, Machine 数量超过 GOMAXPROCS (2)
	for i := 1; i <= 5; i++ {
		go func(id int) {
			f, _ := os.OpenFile(path, os.O_RDONLY, 0)
			syscall.Flock(int(f.Fd()), syscall.LOCK_EX) // 阻塞的系统调用
			fmt.Println("goroutine", id, "acquired the lock")
			f.Close()
		}(i)
	}

	// 验证 Machine (threads) 数量
  // go build -o ./main ./src/main.go
	// GODEBUG=schedtrace=1000 ./main
	time.Sleep(5 * time.Second)
}
```

### m0 是什么?

m0 即主线程, 是编译器确定的全局变量 `runtime.m0`, 是 Go 运行时的第一个 Machine, 在 Go 程序的整个生命周期中都存在; 后续其他 Machine 通过 `runtime.newm()` 动态创建

m0/g0 (系统 goroutine) 负责调度器的初始化、内存分配器初始化、垃圾回收器设置, 通过 `runtime.newproc` 创建第一个用户 goroutine `runtime.main()`, 再执行 `mstart()` 调度循环; `runtime.main` 被调度执行后, 先调用所有包的 `init()` 函数, 最后调用 `main.main`

Go 程序运行期间, m0 也参与 goroutine 调度, 和其他 Machine 没有区别; 程序退出时 m0 负责清理工作, 例如等待其他 goroutine 结束, 执行 defer 函数等

### g0 是什么?

g0 是系统 goroutine, 不是用户 goroutine, 负责执行调度器代码; 每个 Machine 都有自己的 g0, g0 直接使用 OS 线程栈 (macOS 默认 512K, Linux 默认 8MB), 而用户 goroutine 使用 runtime 管理的可动态增长的连续栈, 初始栈大小仅 2KB

> g0 的核心职责

g0 的核心职责是执行调度循环: `schedule()` -> 选择下一个可运行的用户 goroutine -> 切换到该用户 goroutine 执行; 通常 Machine 在用户 goroutine 上运行用户代码, 发生调度事件时, 例如 (用户 goroutine 阻塞/抢占/结束、系统调用返回), Machine 会切换到 g0 执行调度器代码, 选择下一个可运行的用户 goroutine, 再切换到该用户 goroutine 执行

> 为什么需要 g0

- 用户 goroutine 的初始栈大小仅 2KB, 并且需要动态增长
- g0 直接使用 OS 线程栈, 提供独立、稳定的执行环境
- 调度器代码如果运行在用户 goroutine 的栈上, 栈空间可能不足, 也无法安全的动态增长 (正在执行调度的 goroutine 不能被重新调度), 可能导致递归调度问题

### 如何切换 g0 栈和用户栈

g0 和用户 goroutine 的切换, 本质是 SP (Stack Pointer)、PC (Program Counter)、BP (Base Pointer) 等寄存器的保存与恢复, SP 的切换即 g0 和用户 goroutine 的栈切换

## Interface

### interface 底层原理

Go 的 interface 底层有两种数据结构: eface 和 iface

- static type: 静态类型, 即接口类型
- dynamic type: 动态类型, 例如 *os.File
- dynamic value: 动态值, 动态类型的实例
- eface: 空接口 interface{} 的底层实现, 包含两个指针
  - _type 类型指针, 指向动态类型
  - data 数据指针, 指向动态值 (任意类型)
- iface: 非空接口的底层实现, 包含 itab 和 data
  - itab 存储动态类型 (例如 *os.File)、接口类型 (例如 io.Reader)、方法表, 方法表是函数指针数组, 保存该动态类型实现的所有接口方法的地址
  - data 数据指针, 指向动态值

::: code-group

```go [eface]
type eface struct {
  _type *_type
  data  unsafe.Pointer
}
```

```go [iface]
type iface struct {
  tab  *itab
  data unsafe.Pointer
}
```

:::

### eface 和 iface 的区别

eface 和 iface 的核心区别是: 是否包含方法信息

- eface: 空接口 interface{} 的底层实现, 不包含方法信息
- iface: 非空接口的底层实现, 包含 itab 和 data; itab 存储动态类型 (例如 *os.File)、接口类型 (例如 io.Reader)、方法表, 方法表是函数指针数组, 保存该动态类型实现的所有接口方法的地址

### 类型转换和类型断言

- 类型转换 `T(value)`
  - 编译期确定的强制类型转换
  - 编译期保证类型安全
- 类型断言 `value.(T)`
  - 将一个接口类型断言为另一个接口类型或动态类型
  - 运行时可能类型断言抛出错误 `typed, ok := untyped.(string)`

### 接口值

```go
var a any // a 是一个接口值, 接口类型 (静态类型) 为 any (interface{})
var w io.Writer // w 是一个接口值, 接口类型 (静态类型) 为 io.Writer
```

接口值 == nil: 动态类型和动态值都为 nil

### 接口值之间的比较

接口值之间可以使用 == 和 != 比较:

- 两个接口值都 == nil (动态类型和动态值都为 nil) 时, 两个接口值相等
- 两个接口值的动态类型相同, 并且动态值按该动态类型的 == 运算相等时, 两个接口值相等

如果动态类型不可比较: slice/map/func, 以及包含 slice/map/func 的复合类型 (channel 是可比较类型), 则比较会导致运行时 panic

### 接口值与非接口值的比较

先将非接口值转换为对应的接口类型, 再按接口值比较规则进行比较

```go
package main

import "fmt"

type Coder interface {
  code()
}

type Gopher struct {
  name string
}

func (g Gopher) code() {
  fmt.Printf("%s is coding\n", g.name)
}

func main() {
  var c Coder // c 是接口值, 静态类型是 Coder, 动态类型是 nil (未赋值), 动态值是 nil (未赋值)

  // 接口值 == nil: 动态类型和动态值都为 nil
  fmt.Println(c == nil) // true, 动态类型和动态值都为 nil
  fmt.Printf("%T, %v\n", c, c) // nil, nil

  var g *Gopher // g 是非接口值, 值是 nil (未赋值)
  fmt.Println(g == nil) // true

  c = g // c 是接口值, 静态类型是 Coder, 动态类型是 *Gopher, 动态值是 nil

  // 接口值 == nil: 动态类型和动态值都为 nil
  fmt.Println(c == nil) // false
  fmt.Printf("%T, %v\n", c, c) // *main.Gopher, nil
}
```

## 反射

### 什么是反射

Go 的反射使用接口实现

- `reflect.TypeOf()`: 运行时访问接口值的动态类型 (dynamic type)
- `reflect.ValueOf()`: 运行时读取、修改接口值的动态值 (dynamic value)

### 反射应用

go tag

```go
package main

import (
	"fmt"
	"reflect"
)

type User struct {
	Name  string `json:"name"`
	Age   int    `json:"age"`
	Pwd   string `json:"-"`
}

func main() {
	// 1. Read struct tags via reflection
	t := reflect.TypeOf(User{})
	for i := 0; i < t.NumField(); i++ {
		field := t.Field(i)
		tag := field.Tag.Get("json")
    // field Name   -> json tag: "name"
    // field Age    -> json tag: "age"
    // field Pwd    -> json tag: "-"
		fmt.Printf("field %-6s -> json tag: %q\n", field.Name, tag)
	}

	fmt.Println()

	// 2. Custom marshal (json.Marshal/JSON.stringify) using reflection + tags
	u := User{Name: "jane", Age: 22, Pwd: "secret"}
	fmt.Println("Custom marshal:", customMarshal(u))
}

// customMarshal iterates fields via reflection and builds a map keyed by json tag.
func customMarshal(v any) map[string]any {
	val := reflect.ValueOf(v)
	typ := val.Type()
	result := make(map[string]any)

	for i := 0; i < typ.NumField(); i++ {
		field := typ.Field(i)
    tag := field.Tag
    jsonTag := tag.Get("json")
		if jsonTag == "-" || jsonTag == "" {
			continue
		}
		result[jsonTag] = val.Field(i).Interface()
	}
	return result
}
```

### 比较两个变量是否完全相等

1. == 运算: 基本类型 (bool, 数字类型, string)、pointer、数组、struct、interface、channel

- string: 长度相等、每个字节都相等
- pointer: 指向的地址相等, 或者都是 nil
- 数组: 长度相等, 每个元素使用 == 运算都相等; 如果元素类型不可比较, 则整个 array 不可比较, == 运算编译时报错
- struct
  - 所有字段使用 == 运算都相等时, 两个 struct 实例相等
  - 只要有一个字段的类型不可比较 (slice/map/func), 整个 struct 就不可比较, == 运算编译时报错
- interface:
  - 两个接口值都 == nil (动态类型和动态值都为 nil) 时, 两个接口值相等
  - 两个接口值的动态类型相同
    - 动态值按该动态类型的 == 运算相等时, 两个接口值相等
    - 如果动态类型不可比较 (slice/map/func), 则编译时不报错, 运行时 panic
- channel: 不同的 make() 创建的 channel 都不相等

2. `reflect.DeepEqual()`

- 遇到指针, 不是比较指针指向的地址, 而是比较指针指向的值
- 可以比较 slice/map: 每个元素/kv 都相等
- 可以比较 func:
  - 两个都是 nil -> true
  - 至少有一个非 nil -> false

```go
f := func() {}
reflect.DeepEqual(f, f) // false
```

## 内存管理

### 内存分配

Go 的内存分配基于 TCMalloc 算法, 内存分配有 3 层

- mcache 线程缓存: 每个 Processor 都有独立的 mcache, 避免锁竞争
- mcentral 中央缓存: mcentral 按对象大小分类分配
- mheap 页堆: mheap 负责从操作系统申请大块内存

对象分类分配, 根据对象大小分为 3 类

1. 微小对象 (<16Bytes、不包含指针): 在 mcache 的 tiny 分配器中分配, 多个微小对象可以共享一个内存块
2. 小对象 (16Bytes ~ 32KB): Go 预定义了 67 种大小规格的 size class
   - 优先从 Processor 的 mcache 对应的 mspan 中分配
   - 如果 mcache 没有足够的内存, 则从 mcentral 中分配
   - 如果 mcentral 没有足够的内存, 则从 mheap 中分配
   - 如果 mheap 没有足够的内存, 则向操作系统申请内存
3. 大对象 (>32KB) 直接从 mheap 中分配, 跨越多个内存页

### 内存逃逸

逃逸场景

1. 返回局部变量的指针: 函数返回局部变量的指针, 该局部变量从栈逃逸到堆
2. interface{}/any 类型: 赋值给 interface{}/any 类型, 接口值的动态类型可能会逃逸
3. 闭包引用外部变量: 闭包捕获的外部变量可能会逃逸到堆
4. 切片/map 动态扩容: 切片/map 的容量 (cap) 超过编译期确定的范围时, 可能会逃逸到堆
5. 大对象: 超过栈大小限制的大对象直接分配到堆

```go
func f() any {
  x := 42 // 栈
  // (int, 42) 表示: 接口值的动态类型 int, 动态值 42
  return x // x 被装箱为 (int, 42) 返回, 逃逸到堆
}

func g() any {
  var y any = 42 // 装箱 (int, 42)
  return y.(int) // 没有逃逸
}
```

### 内存逃逸的影响

栈对象随着函数返回自动释放 (移动 SP, Stack Pointer 栈指针); 堆对象需要垃圾回收器释放内存, 大量的内存逃逸会增大 GC 压力

### channel 分配在堆上

channel 用于 goroutine 间的通信, channel 分配在堆上

### 内存泄漏的场景

- goroutine 泄漏: goroutine 正常退出前一直占用内存, 例如 goroutine 从 channel 中读取数据但该 channel 一直未被写入数据, 导致该 goroutine 持续阻塞; 或者 goroutine 中有死循环
- channel 泄漏: 未关闭的 channel 和等待该 channel 的 goroutine 会相互持有引用, 例如生产者 goroutine 生产结束, 但是没有关闭该 channel, 导致消费者 goroutine 持续阻塞
- slice 引用大数组: 一个 slice 引用一个大数组的小切片时, 整个大数组都无法被 GC 回收, 解决方法是使用 copy 或 `slices.Clone()` 创建新的 slice
- map 的元素过多: `delete(map, key)` 是标记删除, 底层的 bucket 或 groups (Go >=1.24, map 由多个 swiss table 组成) 仍然占用内存
- 定时器未手动清除
  - 需要手动 Stop 取消: `time.NewTicker(duration)`, `time.NewTimer(duration)`, `time.AfterFunc(duration, callback)`
  - 无法取消: `time.After()`, `time.Tick()`

补充

- goroutine 中 panic 并且没有 recover: 整个进程崩溃
- goroutine 中 panic 但是有 recover: 该 goroutine 正常退出, 栈内存释放, 不会导致 goroutine 泄漏

```go
package main

import (
  "fmt"
  "time"
)

func main() {
  // Go time.NewTicker — fires repeatedly until Stop() is called.
  // JS equivalent: setInterval(fn, ms)
  ticker := time.NewTicker(500 * time.Millisecond)
  done := make(chan struct{})

  go func() {
    count := 0
    for tick := range ticker.C /** channel */ {
      count++
			fmt.Println("tick", count, "at", tick.Format("15:04:05.000"))
      if count >= 5 {
        close(done)
        return
      }
    }
  }

  <-done // await
	ticker.Stop() // like clearInterval(id)
	fmt.Println("ticker stopped")

  // Go time.AfterFunc — fires callback once after duration, cancellable.
	// JS equivalent: const id = setTimeout(fn, ms); clearTimeout(id)

	// Case 1: let it fire (like setTimeout that runs)
	done2 := make(chan struct{})
	time.AfterFunc(time.Second, func() {
		fmt.Println("timer fired (like setTimeout callback)")
		close(done2)
	})
	<-done2 // await

  // Case 2: cancel before it fires (like clearTimeout)
	timer := time.AfterFunc(time.Second, func() {
		fmt.Println("you should NOT see this")
	})
	timer.Stop() // clearTimeout(id)
	fmt.Println("timer cancelled, callback will not run")

	// Pitfall: time.After in select accumulates unfired timers.
	// If another case wins, the timer lingers until it fires.
	ch := make(chan int, 1)
	go func() {
		time.Sleep(100 * time.Millisecond)
		ch <- 1
	}()

  // 如果以下的 select 在一个高频循环中
  // 例如每秒执行 100 次
  // 每次都会创建一个 duration 10s 的无用 Timer
  // 3s 内会累积 300 个无用 Timer
  // 导致不必要的内存分配和 GC 压力
	select {
	case <-ch:
		fmt.Println("got value early — the 10s timer below is garbage")
	case <-time.After(10 * time.Second):
		fmt.Println("timeout")
	}
}
```

### 定位内存泄漏

1. 观察 `runtime.ReadMemStats()` / `runtime.NumGoroutine()` 趋势
   - HeapAlloc 持续上涨, 并且 GC 后不回落 -> 内存泄漏
   - NumGoroutine 持续上涨 -> goroutine 泄漏
2. pprof 快照, 定位哪个函数分配的内存最多, 哪类 goroutine 的阻塞时间最长
3. trace 录制, 看 GC 频率、goroutine 创建/阻塞/销毁、调度延迟

::: code-group

```go [Go runtime]
var m runtime.MemStats
runtime.ReadMemStats(&m)
// 堆上已分配, 并且未释放的字节数
fmt.Printf("HeapAlloc: %d MB\n", m.HeapAlloc/1024/1024)
// 堆上的对象数量
fmt.Printf("HeapObjects: %d\n", m.HeapObjects)
// 已完成的 GC 周期数
fmt.Printf("NumGC: %d\n", m.NumGC)
// 存活的 goroutine 数量
fmt.Printf("Goroutines: %d\n", runtime.NumGoroutine())
```

```js [JS V8]
import v8 from "v8";
const mem = process.memoryUsage();
// 已使用的堆内存
console.log(`heapUsed: ${Math.round(mem.heapUsed / 1024 / 1024)} MB`);
// V8 已申请的堆内存总量
console.log(`heapTotal: ${Math.round(mem.heapTotal / 1024 / 1024)} MB`);
// C++ 对象占用的内存
console.log(`external: ${Math.round(mem.external / 1024 / 1024)} MB`);

const stats = v8.getHeapStatistics();
// 已使用的堆内存
console.log(
  `usedHeapSize: ${Math.round(stats.used_heap_size / 1024 / 1024)} MB`,
);
// 堆内存上限 (超过则 OOM)
console.log(
  `heapSizeLimit: ${Math.round(stats.heap_size_limit / 1024 / 1024)} MB`,
);

// V8 没有直接的 GC 计数, 使用 perf_hooks 监听 GC 事件
import { PerformanceObserver } from "perf_hooks";
let gcCount = 0;
const obs = new PerformanceObserver((list) => {
  gcCount += list.getEntries().length;
});
obs.observe({ entryTypes: ["gc"] });
```

```go [Go pprof]
import _ "net/http/pprof"

go func() {
  http.ListenAndServe(":6060", nil)
}()
```

```go [Go trace]
import "runtime/trace"

f, _ := os.Create("trace.out")
trace.Start(f)
defer trace.Stop()
```

```bash [go tool]
# heap 快照
go tool pprof http://localhost:6060/debug/pprof/heap

# 对比两个时间点内存分配的增量
curl -o old.pb.gz http://localhost:6060/debug/pprof/heap
go tool pprof -base old.pb.gz http://localhost:6060/debug/pprof/heap

# goroutine 快照
go tool pprof http://localhost:6060/debug/pprof/goroutine
# trace 可视化
go tool trace trace.out
```

```bash [pprof commands]
top 20        # 按当前内存分配量降序排序的前 20 个函数
top -cum 20   # 按累积内存分配量降序排序的前 20 个函数
list FuncName # 某个函数的源码, 逐行的内存分配量
traces        # 列出每个 goroutine 的完整调用栈, 用于定位阻塞点
web           # 生成函数调用关系的 SVG 并浏览器打开 (brew install graphviz)
```

:::

## 垃圾回收

### 常见的 GC 算法

- 标记清除: 参考 JS/TS v8 垃圾回收
- 标记整理: 参考 JS/TS v8 垃圾回收
- 引用计数: 对象的引用计数 = 0 时自动回收
- 三色标记

### 三色标记 GC 算法

三色

1. 白色: 未被访问的对象, 三色标记结束后白色对象会被回收
2. 灰色: 已被访问, 但其「直接」引用的对象还未完全扫描的对象
3. 黑色: 已被访问, 并且其「直接」引用的所有对象都扫描完成的对象, 确认存活

标记 (染色) 过程

1. GC 开始时, 所有的对象都是白色, 从 GC root (全局变量、栈变量等) 开始, 将直接可达对象染灰色
2. 不断从灰色队列中取出灰色对象, 扫描该灰色对象引用的对象, 如果引用的对象是白色则染灰色; 该灰色对象「直接」引用的所有对象都被染灰色后, 对该灰色对象染黑色
3. 重复 2. 直到灰色队列为空
4. 灰色队列为空, 白色对象不可达、被回收; 黑色对象可达, 确认存活

### GC 根对象

GC 根对象是垃圾回收器在标记过程中最先检查的对象, 包括:

1. 全局变量: 编译期确定的、程序的整个生命周期中都存在的变量
2. goroutine 执行栈: 包含局部变量、指向分配的堆内存的指针
3. 寄存器中指向分配的堆内存的指针

### STW

STW, Stop The World, 指用户代码停止运行

### 并发标记清除时, 用户代码并发修改对象引用导致的错误回收问题

难点: 用户代码并发修改对象引用时, 垃圾回收器可以正确识别存活对象

1. 对象消失问题: 标记过程中, 如果用户代码「新增」黑色对象对白色对象的引用, 同时也「删除」灰色对象对该白色对象的引用, 则该白色对象被错误回收, 实际上该白色对象仍然可达
2. 新对象处理: 标记期间, 新分配的对象如果染白色, 则可能被错误回收; 如果染黑色, 则可能导致浮动垃圾

| 时序 | 回收器          | 赋值器                              | 说明                                                              |
| ---- | --------------- | ----------------------------------- | ----------------------------------------------------------------- |
|      |                 |                                     | 初始状态: C (黑) -> A (灰) -> B (白)                              |
| 1    | shade(A, gray)  |                                     | 回收器: 根对象的直接子节点 A 染灰色                               |
| 2    | shade(C, black) |                                     | 回收器: C 所有子节点都染灰色 -> C 染黑色 (GC 不再重新扫描 C)      |
| 3    |                 | C.ref3 = C.ref2.ref1 (= A.ref1 = B) | 赋值器: C 新增对 B 的引用 (C 是黑色, GC 不再重新扫描 C)           |
| 4    |                 | A.ref1 = nil                        | 赋值器: A 断开对 B 的引用                                         |
| 5    | scan(A)         |                                     | 回收器: 发现 A.ref1 是 nil                                        |
| 6    | shade(A, black) |                                     | 回收器: 对 A 染黑色 (GC 不再重新扫描 A), B 无法被染色, 被错误回收 |

Step0

```
C (黑)
└── ref2 -> A (灰)
            └── ref1 -> B (白)
```

Step3. 赋值器并发修改: `C.ref3 = C.ref2.ref1 (= A.ref1 = B)`

```
C (黑)
├── ref2 -> A (灰) ──┐
└── ref3 -> B (白) ←┘ ref1
```

Step4. 赋值器并发修改: `A.ref1 = nil`

```
 C (黑)
├── ref2 -> A (灰)
│           ↘ ref1 == nil
│
└── ref3 -> B (白)
```

归因

1. C 是黑色 (GC 不再重新扫描 C), 但是赋值器在 step3: C 新增对 B 的引用
2. A 是灰色 (GC 会扫描 A), 但是赋值器在 step4: A 断开对 B 的引用
3. GC 扫描 A 时, 发现 A.ref1 是 nil
4. GC 判断 B 不可达 (实际上 C 通过 ref3 仍然引用 B), B 无法被染色, 被错误回收

### 解决并发标记清除时, 用户代码并发修改对象引用导致的错误回收问题

Go 通过「混合写屏障」和「弱三色不变性」解决并发标记清除时, 用户代码并发修改对象引用导致的错误回收问题

1. 如果用户代码「新增」黑色对象对白色对象的引用, 同时也「删除」灰色对象对该白色对象的引用, 则该白色对象被错误回收, 实际上该白色对象仍然可达
2. 混合写屏障
   - 新增引用时, 将被引用对象染为灰色
   - 删除引用时, 将被引用对象染成灰色
   - 如果只有新增, 则是 Dijkstra 插入写屏障
3. 弱三色不变性
   - 允许黑色对象持有对白色对象的引用, 但必须保证: 存在某个灰色对象也持有对该白色对象的引用, 使得该白色对象会被 GC 扫描
   - 堆操作使用写屏障; goroutine 栈操作频繁、开销敏感, 不使用写屏障, 标记开始时扫描 goroutine 栈

### 写屏障

写屏障: 向「堆内存」写入指针值时, 编译器将该写操作替换为对运行时写屏障函数 (gcWriteBarrier) 的调用, 解决并发标记清除时, 用户代码并发修改对象引用导致的错误回收问题

### GC 过程

| 阶段             | 说明                     | 赋值器状态 |
| ---------------- | ------------------------ | ---------- |
| SweepTermination | 清理终止阶段, 开启写屏障 | STW        |
| Mark             | 扫描、标记 (染色) 阶段   | 并发标记   |
| MarkTermination  | 标记终止阶段, 关闭写屏障 | STW        |
| GCoff            | 内存清理阶段             | 并发清理   |

### GC 触发时机

1. 手动触发: 调用 `runtime.GC()` 手动触发, 阻塞等待 GC 结束
2. 自动触发
   - Go 运行时有一个专用的 OS 监控线程 sysmon, 不是 goroutine, 不受调度器管理
   - 超过两分钟没有 GC 时, 强制触发 GC
   - 每次内存分配时, 检查当前堆内存大小是否超过阈值, 阈值 = 上次 GC 结束后的堆内存大小 * (1 + GOGC/100), 默认 GOGC = 100, 即默认当前堆内存大小 >= 上次 GC 结束后的堆内存的 2 倍时, 触发 GC
   - 可以通过 `debug.SetGCPercent(300)`, 当前堆内存大小 >= 上次 GC 结束后的堆内存的 (1 + 300/100) = 4 倍时, 才触发 GC
   - 首次 GC 触发, 堆内存大小的下限是 4MB, 堆内存大小 < 4MB 不会触发 GC

### GC 指标

- CPU 利用率: GC 占用的 CPU 时间占 CPU 总时间的百分比
- GC 停顿时间: 单次 GC 的停顿时间, 包括 STW 和 Mark Assist 两部分
  - STW: 并发标记前的 SweepTermination 和并发标记后的 MarkTermination, 是全局硬停顿
  - Mark Assist: 标记辅助, 是单个 goroutine 的软停顿
- GC 停顿频率: 包括 STW 和 Mark Assist 两部分

### 有了 GC, 为什么还有内存泄漏

内存泄漏: 预期可以很快被释放的内存, 生命周期被意外的延长 (GC 根对象可达), 导致该内存长时间得不到回收

1. 内存被 GC 根对象引用
2. 参考上文「内存泄漏的场景」

### GC 调优

1. 使用 `sync.Pool` 对象池, 复用频繁创建的对象; `sync.Pool` 对象池中的对象, 可能在任意一次 GC 时被清空, 所以不是「保证复用」, 而是「尽力复用」, 降低 GC 压力
2. 微调 GOGC, 适当增大 GOGC, 使得 GC 触发时机更晚, 降低 GC 频率

### 观察 GC

实验 1: `GODEBUG=gctrace=1`

::: code-group

```go [go]
package main

func allocate() {
  _ = make([]byte, 1<<20)
}

func main() {
  for range 100_000 {
    allocate()
  }
}
```

```bash [bash]
go build -o ./main ./src/main.go
GODEBUG=gctrace=1 ./main
```

:::

实验 2: `go tool trace`

::: code-group

```go [go]
package main

import (
	"log"
	"os"
	"runtime/trace"
	"sync"
)

func allocate() {
	_ = make([]byte, 1<<20)
}

func main() {
	f, err := os.Create("trace.out")
	if err != nil {
		log.Fatal(err)
	}
	defer f.Close()
	if err := trace.Start(f); err != nil {
		log.Fatal(err)
	}
	defer trace.Stop()

	var wg sync.WaitGroup
	for range 4 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for range 25_000 {
				allocate()
			}
		}()
	}
	wg.Wait()
}
```

```bash [bash]
cd src && go build -o ./main . && ./main
go tool trace ./trace.out
```

:::

实验 3: `debug.ReadGCStats()`

::: code-group

```go [go]
package main

import (
	"fmt"
	"runtime/debug"
	"time"
)

func printGCStats() {
	t := time.NewTicker(time.Second)
	s := debug.GCStats{}
	for {
		select {
		case <-t.C:
			debug.ReadGCStats(&s)
			fmt.Printf("gc %d last@%v, PauseTotal %v\n", s.NumGC, s.LastGC, s.PauseTotal)
		}
	}
}

func allocate() {
	_ = make([]byte, 1<<20)
}

func main() {
	go printGCStats()
	for range 100_000 {
		allocate()
	}
	time.Sleep(2 * time.Second)
}
```

```bash [bash]
go run ./src/main.go
```

:::

实验 4: `runtime.ReadMemStats()`

::: code-group

```go [go]
package main

import (
	"fmt"
	"runtime"
	"time"
)

func printMemStats() {
	t := time.NewTicker(time.Second)
	s := runtime.MemStats{}

	for {
		select {
		case <-t.C:
			runtime.ReadMemStats(&s)
			fmt.Printf("gc %d last@%v, next_heap_size@%vMB\n", s.NumGC, time.Unix(0, int64(s.LastGC)), s.NextGC/(1<<20))
		}
	}
}

func allocate() {
	_ = make([]byte, 1<<20)
}

func main() {
	go printMemStats()
	for range 100_000 {
		allocate()
	}
	time.Sleep(2 * time.Second)
}
```

```bash [bash]
go run ./src/main.go
```

:::

## 数据结构

### 堆

[设计推特](https://leetcode.cn/problems/design-twitter)

```go
import "container/heap"

type twitterInterface interface {
	PostTweet(userId int, tweetId int)
	GetNewsFeed(userId int) []int
	Follow(followerId int, followeeId int)
	Unfollow(followerId int, followeeId int)
}

type tweet struct {
	tweetId   int
	timestamp int
}

type tweetHeap []*tweetItem

type tweetItem struct {
	userId int
	index  int
	tweet  tweet
}

// Len implements [heap.Interface].
func (h *tweetHeap) Len() int {
	return len(*h)
}

// Less implements [heap.Interface].
// Less(i, j) 表示 i 是否排在 j 前面
// 如果是最大堆 (堆顶的 Timestamp 最大) 则 Less 是 >
// 如果是最小堆 (堆顶的 Timestamp 最小) 则 Less 是 <
func (h *tweetHeap) Less(i int, j int) bool {
	return (*h)[i].tweet.timestamp > (*h)[j].tweet.timestamp
}

// Pop implements [heap.Interface].
// 调用 heap.Pop(h) 时
// 标准库先交换堆顶元素和最后一个元素
// 再将前 n-1 个元素重新建堆
// 最后调用 h.Pop() 删除并返回最后一个元素
func (h *tweetHeap) Pop() any {
	hv := *h
	n := len(hv)
	tail := hv[n-1]
	*h = hv[:n-1]
	return tail
}

// Push implements [heap.Interface].
func (h *tweetHeap) Push(x any) {
	*h = append(*h, x.(*tweetItem))
}

// Swap implements [heap.Interface].
func (h *tweetHeap) Swap(i int, j int) {
	(*h)[i], (*h)[j] = (*h)[j], (*h)[i]
}

var _ heap.Interface = (*tweetHeap)(nil)

type set[T comparable] map[T]struct{}

type Twitter struct {
	timestamp         int
	userIdToTweets    map[int][]tweet
	userIdToFollowees map[int]set[int]
}

var _ twitterInterface = (*Twitter)(nil)

func Constructor() Twitter {
	return Twitter{
		userIdToTweets:    make(map[int][]tweet),
		userIdToFollowees: make(map[int]set[int]),
	}
}

func (t *Twitter) PostTweet(userId int, tweetId int) {
  t.userIdToTweets[userId] = append(t.userIdToTweets[userId], tweet{
		tweetId:   tweetId,
		timestamp: t.timestamp,
	})
	t.timestamp++
}

func (t *Twitter) GetNewsFeed(userId int) []int {
  // 0: len
  // t.userIdToFollowees[userId]+1: cap
	userIds := make([]int, 0, len(t.userIdToFollowees[userId])+1)
	userIds = append(userIds, userId)
	for followeeId := range t.userIdToFollowees[userId] {
		userIds = append(userIds, followeeId)
	}

	h := &tweetHeap{}
	for _, uId := range userIds {
		tweets := t.userIdToTweets[uId]
		if len(tweets) == 0 {
			continue
		}
		lastIndex := len(tweets) - 1
		heap.Push(h, &tweetItem{
			userId: uId,
			index:  lastIndex,
			tweet:  tweets[lastIndex],
		})
	}

	newsFeed := make([]int, 0, 10)
	for h.Len() > 0 && len(newsFeed) < 10 {
		item := heap.Pop(h).(*tweetItem)
		newsFeed = append(newsFeed, item.tweet.tweetId)
		if item.index > 0 {
			prevIndex := item.index - 1
			prevTweet := t.userIdToTweets[item.userId][prevIndex]
			heap.Push(h, &tweetItem{
				userId: item.userId,
				index:  prevIndex,
				tweet:  prevTweet,
			})
		}
	}

	return newsFeed
}

func (t *Twitter) Follow(followerId int, followeeId int) {
	if followerId == followeeId {
		return
	}
	followees := t.userIdToFollowees[followerId]
	if followees == nil {
		followees = make(set[int])
		t.userIdToFollowees[followerId] = followees
	}
	followees[followeeId] = struct{}{}
}

func (t *Twitter) Unfollow(followerId int, followeeId int) {
	followees := t.userIdToFollowees[followerId]
	if followees == nil {
		return
	}
	delete(followees, followeeId)
}
```
