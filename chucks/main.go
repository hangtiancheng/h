package main

import (
	"fmt"
	"sync"
	"time"
)

// runScheduler demonstrates the pipeline: the time wheel fires user scheduled
// tasks, each task publishes a message to the queue, and consumers execute them.
func runScheduler() {
	const topic = "user-tasks"

	mq := NewSimpleMQ()
	mq.CreateTopic(topic, 2)

	done := make(chan struct{})
	var wg sync.WaitGroup

	// one consumer per partition
	for idx := range 2 {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			var offset int64
			for {
				msg, next, ok := mq.Consume(topic, idx, offset, done)
				if !ok {
					return
				}
				offset = next
				fmt.Printf("[consumer-%d] execute task key=%s value=%s\n", idx, msg.Key, msg.Value)
			}
		}(idx)
	}

	tw := NewTimeWheel(100*time.Millisecond, 16)
	tw.Start()

	// three user scheduled tasks: one-shot and periodic
	tw.Schedule(200*time.Millisecond, 0, func() {
		_ = mq.Produce(topic, Message{Key: "backup", Value: "daily backup"})
	})
	tw.Schedule(300*time.Millisecond, 500*time.Millisecond, func() {
		_ = mq.Produce(topic, Message{Key: "heartbeat", Value: "heartbeat report"})
	})
	tw.Schedule(400*time.Millisecond, 0, func() {
		_ = mq.Produce(topic, Message{Key: "report", Value: "generate daily report"})
	})

	time.Sleep(1600 * time.Millisecond)
	tw.Stop()
	close(done)
	wg.Wait()
}

func main() {
	runScheduler()
}

func totalNumbers(digits []int) int {
	ans := 0

	var dfs func(path []int)
	var used = make([]bool, len(digits))

	dfs = func(path []int) {
		if len(path) == 3 {
			ans++
			return
		}
		seen := make(map[int]struct{})

		for i := range len(digits) {
			if used[i] {
				continue
			}

			if _, ok := seen[digits[i]]; ok {
				continue
			}

			if len(path) == 0 && digits[i] == 0 {
				continue
			}

			if len(path) == 2 && digits[i]%2 != 0 {
				continue
			}

			path = append(path, digits[i])
			seen[digits[i]] = struct{}{}
			used[i] = true

			dfs(path)

			path = path[:len(path)-1]
			// delete(seen, digits[i])
			used[i] = false
		}
	}

	path := make([]int, 0)
	dfs(path)

	return ans
}

func largestOverlap(img1 [][]int, img2 [][]int) int {

	m, n := len(img1), len(img1[0])

	overlap := func(i, j int) int {
		subImg1 := img1[:m-i][:n-j]
		fmt.Println(subImg1)
		ret := 0
		for x := range m - i {
			for y := range n - j {
				x2, y2 := x+i, y+j
				if img1[x][y] == img2[x2][y2] {
					ret++
				}
			}
		}
		return ret
	}

	ans := 0
tag:
	for i := range m {
		for j := range n {
			if (m-i)*(n-j) < ans {
				break tag
			}

			ans = max(ans, overlap(i, j))
		}
	}

  return ans;
}
