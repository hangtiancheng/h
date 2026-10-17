// Go port of chucks/index.ts: the Node worker_threads pool becomes a goroutine
// pool. Worker "processes" are goroutines, postMessage is a send on the
// worker's job channel, and the "message"/"error" events are the task's result
// channel.
package main

import (
	"context"
	"errors"
	"fmt"
	"runtime"
	"sync"
	"time"
)

// ErrPoolStopped is what Run reports once Stop has been called, mirroring the
// rejection of queued tasks in WorkerPool.stop().
var ErrPoolStopped = errors.New("main worker pool stopped before a worker was available")

// Options mirrors the JS Options.
type Options struct {
	// Max caps the number of workers. Zero or negative means
	// max(1, runtime.NumCPU()-1), like Math.max(1, os.cpus().length - 1).
	Max int
}

// outcome is one worker reply: the resolved value or the "error" event.
type outcome[Ret any] struct {
	result Ret
	err    error
}

// task is a single Run call. done is buffered so a worker can always deliver
// its result without blocking, even when Run has already given up.
type task[Args any, Ret any] struct {
	args Args
	done chan outcome[Ret]
}

// worker replaces NodeWorker: a goroutine consuming tasks from jobs.
type worker[Args any, Ret any] struct {
	id   int
	jobs chan *task[Args, Ret]
}

func (w *worker[Args, Ret]) run(p *WorkerPool[Args, Ret]) {
	for {
		select {
		case t := <-w.jobs:
			// fn may block as long as it likes; the JS version awaited the
			// returned promise here.
			t.done <- p.execute(w, t.args)
			p.release(w)
		case <-p.stopped:
			// Stop() replaces Worker.unref(): goroutines never keep the
			// program alive, so letting them exit is enough.
			return
		}
	}
}

// WorkerPool runs fn on at most Options.Max goroutines. Args is the argument
// tuple the JS pool spread into fn(...args).
type WorkerPool[Args any, Ret any] struct {
	fn  func(Args) Ret
	max int

	// idle is the JS idlePool, buffered to max so release never blocks. Runs
	// waiting to receive from it are the JS queue.
	idle chan *worker[Args, Ret]

	mu       sync.Mutex
	spawned  int
	stopOnce sync.Once
	stopped  chan struct{}
}

func NewWorkerPool[Args any, Ret any](fn func(Args) Ret, options Options) *WorkerPool[Args, Ret] {
	maxWorkers := options.Max
	if maxWorkers <= 0 {
		maxWorkers = max(1, runtime.NumCPU()-1)
	}

	return &WorkerPool[Args, Ret]{
		fn:      fn,
		max:     maxWorkers,
		idle:    make(chan *worker[Args, Ret], maxWorkers),
		stopped: make(chan struct{}),
	}
}

// Run hands args to an available worker and waits for its reply, like
// WorkerPool.run(...args). ctx only cancels the wait: a worker already inside
// fn runs to completion and its result is dropped, and a Stop while a task is
// in flight reports ErrPoolStopped instead of leaving the caller hanging.
func (p *WorkerPool[Args, Ret]) Run(ctx context.Context, args Args) (Ret, error) {
	var zero Ret

	w, err := p.acquire(ctx)
	if err != nil {
		return zero, err
	}

	t := &task[Args, Ret]{args: args, done: make(chan outcome[Ret], 1)}
	select {
	case w.jobs <- t:
	case <-ctx.Done():
		p.release(w)
		return zero, ctx.Err()
	case <-p.stopped:
		return zero, ErrPoolStopped
	}

	select {
	case o := <-t.done:
		return o.result, o.err
	case <-ctx.Done():
		return zero, ctx.Err()
	case <-p.stopped:
		return zero, ErrPoolStopped
	}
}

// Stop shuts the pool down. Waiting and later Runs fail with ErrPoolStopped;
// workers exit on their own.
func (p *WorkerPool[Args, Ret]) Stop() {
	p.stopOnce.Do(func() { close(p.stopped) })
}

// acquire mirrors _getAvailableWorker: take an idle worker, spawn one while
// below max, otherwise wait for a release.
func (p *WorkerPool[Args, Ret]) acquire(ctx context.Context) (*worker[Args, Ret], error) {
	select {
	case w := <-p.idle:
		return w, nil
	default:
	}

	p.mu.Lock()
	if p.spawned < p.max {
		p.spawned++
		w := &worker[Args, Ret]{id: p.spawned, jobs: make(chan *task[Args, Ret])}
		go w.run(p)
		p.mu.Unlock()
		return w, nil
	}
	p.mu.Unlock()

	select {
	case w := <-p.idle:
		return w, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-p.stopped:
		return nil, ErrPoolStopped
	}
}

// release mirrors _assignDoneWorker: the worker wakes a Run blocked in acquire
// (the JS queue) or goes back to the idle pool.
func (p *WorkerPool[Args, Ret]) release(w *worker[Args, Ret]) {
	p.idle <- w
}

// execute turns a panic in fn into the task's error, the way a worker "error"
// event did in the JS version.
func (p *WorkerPool[Args, Ret]) execute(w *worker[Args, Ret], args Args) (o outcome[Ret]) {
	defer func() {
		if r := recover(); r != nil {
			o = outcome[Ret]{err: fmt.Errorf("worker %d panicked: %v", w.id, r)}
		}
	}()

	return outcome[Ret]{result: p.fn(args)}
}

type job struct {
	n int
}

func main() {
	pool := NewWorkerPool(func(j job) int {
		time.Sleep(30 * time.Millisecond) // stand-in for CPU-bound work
		return j.n * j.n
	}, Options{Max: 3})

	var wg sync.WaitGroup
	for i := range 9 {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			square, err := pool.Run(context.Background(), job{n: i})
			if err != nil {
				fmt.Printf("job %d failed: %v\n", i, err)
				return
			}
			fmt.Printf("job %d => %d\n", i, square)
		}(i)
	}

	// More runs than workers: this one gives up while the pool stays busy.
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Millisecond)
	defer cancel()
	if _, err := pool.Run(ctx, job{n: 7}); err != nil {
		fmt.Printf("cancelled run: %v\n", err)
	}

	// A panicking fn surfaces as an error instead of taking the program down.
	boom := NewWorkerPool(func(job) int { panic("boom") }, Options{Max: 1})
	if _, err := boom.Run(context.Background(), job{}); err != nil {
		fmt.Printf("panicking run: %v\n", err)
	}
	boom.Stop()

	wg.Wait()
	pool.Stop()

	if _, err := pool.Run(context.Background(), job{n: 1}); err != nil {
		fmt.Printf("run after stop: %v\n", err)
	}
}
