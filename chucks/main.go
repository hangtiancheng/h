package main

import (
	"fmt"
	"slices"
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

	return ans
}

func lexicographicallySmallestArray2(nums []int, limit int) []int {
	n := len(nums)

	pos := make([]int, n)
	for i := range pos {
		pos[i] = i
	}

	// 排序后, nums[pos[i]] 递增
	slices.SortFunc(pos, func(i, j int) int {
		return nums[i] - nums[j]
	})

	ans := make([]int, n)
	start := 0
	for i, p := range pos {
		if i == n-1 || nums[pos[i+1]]-nums[p] > limit {
			subPos := slices.Clone(pos[start : i+1])
			slices.Sort(subPos)
			for j, q := range subPos {
				ans[q] = nums[pos[start+j]]
			}
			start = i + 1
		}
	}
	return ans
}


func minimumDeletions(nums []int) int {
  if (len(nums) <= 1) {
    return len(nums);
  }
  minIdx, maxIdx := 0, 0
  for i := range nums {
    if nums[i] < nums[minIdx] {
      minIdx = i
    } else if nums[i] > nums[maxIdx] {
      maxIdx = i;
    }
  }
  if (minIdx == maxIdx) {
    return 1;
  }
  return min(
    max(minIdx, maxIdx) +1,
    max(len(nums) - minIdx, len(nums) - maxIdx),
    minIdx + len(nums) - maxIdx + 1,
    maxIdx + len(nums) - minIdx + 1,
  )
}
