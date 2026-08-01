package main

import (
	"context"
	"fmt"
	"sync"
	"time"

	"golang.org/x/sync/semaphore"
)

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
