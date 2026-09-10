package main

import (
	"sync"
	"time"
)

// timedTask is a user task registered on the time wheel.
type timedTask struct {
	id       uint64
	rounds   int           // full rounds left before the task fires
	interval time.Duration // >0 marks a periodic task, re-placed after each fire
	fn       func()
}

// TimeWheel is a fixed-slot time wheel; a ticker drives the pointer forward.
type TimeWheel struct {
	mu     sync.Mutex
	tick   time.Duration
	slots  [][]*timedTask
	pos    int
	nextID uint64
	ticker *time.Ticker
	stopCh chan struct{}
}

func NewTimeWheel(tick time.Duration, slotNum int) *TimeWheel {
	if tick <= 0 || slotNum <= 0 {
		panic("timewheel: tick and slotNum must be positive")
	}
	return &TimeWheel{
		tick:   tick,
		slots:  make([][]*timedTask, slotNum),
		stopCh: make(chan struct{}),
	}
}

// Start launches a background goroutine that advances one slot per tick.
func (tw *TimeWheel) Start() {
	tw.ticker = time.NewTicker(tw.tick)
	go func() {
		for {
			select {
			case <-tw.ticker.C:
				tw.advance()
			case <-tw.stopCh:
				tw.ticker.Stop()
				return
			}
		}
	}()
}

func (tw *TimeWheel) Stop() {
	close(tw.stopCh)
}

// Schedule registers a user task: it fires after delay, and repeats every
// interval when interval > 0.
func (tw *TimeWheel) Schedule(delay, interval time.Duration, fn func()) uint64 {
	tw.mu.Lock()
	defer tw.mu.Unlock()
	tw.nextID++
	t := &timedTask{id: tw.nextID, interval: interval, fn: fn}
	tw.place(t, delay)
	return t.id
}

// place puts a task into its slot; the caller must hold the lock.
func (tw *TimeWheel) place(t *timedTask, delay time.Duration) {
	ticks := int(delay / tw.tick)
	if ticks < 1 {
		ticks = 1
	}
	t.rounds = ticks / len(tw.slots)
	idx := (tw.pos + ticks) % len(tw.slots)
	tw.slots[idx] = append(tw.slots[idx], t)
}

// advance moves the pointer forward one slot and runs due tasks.
func (tw *TimeWheel) advance() {
	tw.mu.Lock()
	tw.pos = (tw.pos + 1) % len(tw.slots)
	pending := tw.slots[tw.pos]
	tw.slots[tw.pos] = nil

	ready := make([]*timedTask, 0, len(pending))
	remain := make([]*timedTask, 0, len(pending))
	for _, t := range pending {
		if t.rounds > 0 {
			t.rounds--
			remain = append(remain, t)
		} else {
			ready = append(ready, t)
		}
	}
	tw.slots[tw.pos] = remain
	tw.mu.Unlock()

	for _, t := range ready {
		// run outside the lock so user tasks never block the wheel
		t.fn()
		if t.interval > 0 {
			tw.mu.Lock()
			tw.place(t, t.interval)
			tw.mu.Unlock()
		}
	}
}
