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
