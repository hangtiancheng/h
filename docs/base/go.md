# Go

## 什么是协程

协程是用户态的轻量级线程, 是线程调度的基本单位; 一个 goroutine 以很小的栈空间 (2KB) 启动, 栈可以自动扩缩容

- 进程: 进程是操作系统资源分配的基本单位, 每个进程都有独立的内存空间, 进程通过进程间通信 (IPC) 进行通信; 进程上下文切换开销较大
- 线程: 线程是 CPU 调度的基本单位, 线程是在内核态调度的, 线程通过共享内存进行通信
- 协程: 协程是用户态的轻量级线程, 协程是在用户态调度的, 没有用户态和内核态的切换开销, 协程上下文切换开销小

## make 和 new 的区别

- make 分配内存并初始化, 创建 slice、map 和 channel, 返回实例
- new 只分配内存

## 数组对比切片

- 数组是固定长度, 数组类型包括数组长度
- 切片可以改变长度, 切片是一个 struct, 包括: 指针、长度 len 和容量 cap

```go
type slice struct {
	array unsafe.Pointer // 指向底层数组的指针
	len   int // 切片长度
	cap   int // 从指针指向的位置, 到底层数组末尾的容量
}
```

## 数组 append 扩容

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
      // 随 slice 增大, 从扩容 2x 平滑过渡到扩容 1.25x
      newCap += (newCap + 3*threshold) / 4
    }
  }
}
capMem := roundupSize(uintptr(newCap) * elemSize)
newCap = int(capMem / elemSize)
```

`roundupSize`: Go 预定义了一组 size class: 8, 16, 24, 32, ...., 数组扩容时 cap 数组容量 * elemSize 元素大小向上取整到最近的 size class

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

修复

1. 使用 `b := a[1:3:3]` 强制 cap=len, append b 时 cap = len, 必然触发扩容
2. 显式拷贝 `b := make([]int, 2); copy(b, a[1:3])`, 或 `b := slice.Clone(a[1:3])`

Pitfall: 大数组的小切片导致的内存驻留: 例如从 100MB 大数组 data 中切片得到的 `data[:100]`, 会导致整个 100MB 大数组无法被 GC

## 对比 `var nilSlice []int` 和 `emptySlice := []int{}`

|                                     | `var nilSlice []int` | `emptySlice := []int{}`                                 |
| ----------------------------------- | -------------------- | ------------------------------------------------------- |
| array 指针                          | nil                  | 指向 `runtime.zerobase` (所有长度 = 0 的对象共享的地址) |
| len, cap                            | len=0, cap=0         | len=0, cap=0                                            |
| `s == nil`                          | true                 | false                                                   |
| `json.Marshal`                      | `null`               | `[]`                                                    |
| len / for / range / append 是否安全 | 全部安全             | 全部安全                                                |

## 从 slice 中删除元素

```go
// 保序删除
s = append(s[:i], s[i+1:]...)
s = slices.Delete(s, i, i+1)

// 不保序删除
s[i] = s[len(s) - 1]
s = s[:len(s) - 1]
```

删除元素可能导致内存泄漏: 当元素是指针, 或者包含指针的结构体时, 需要手动断开引用

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

## for range

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

## 字符串拼接

字符串拼接方法: +、fmt.Sprintf、strings.Builder、bytes.Buffer、strings.Join

## 堆

[LeetCode 设计推特](https://leetcode.cn/problems/design-twitter)

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
// 如果是最大堆（堆顶的 Timestamp 最大）则 Less 是 >
// 如果是最小堆（堆顶的 Timestamp 最小）则 Less 是 <
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

## 限流器

```ts
import Koa from "koa";
import Router from "@koa/router";
import ratelimit from "koa-ratelimit";
import LRU from "lru-cache";

const app = new Koa();
const router = new Router();
const db = new LRU({ max: 10_000 });

const limiter = ratelimit({
  driver: "memory",
  db,
  duration: 60_000, // 1 分钟
  max: 60, // 最多 60 次
  id: (ctx) => ctx.ip,
  // 限流时的响应体
  errorMessage: { error: "Too Many Requests" },
  // 限流时的响应头
  headers: {
    remaining: "RateLimit-Remaining",
    reset: "RateLimit-Reset",
    total: "RateLimit-Limit",
  },
});
// 全局限流
app.use(limiter);
// 限流指定接口
router.post("/login", limiter, (ctx) => {
  ctx.body = { ok: true };
});

app.use(router.routes());
app.use(router.allowedMethods());
app.listen(3000, "0.0.0.0");
```
