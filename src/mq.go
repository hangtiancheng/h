package main

import (
	"errors"
	"sync"
)

// Message is a Kafka-style message; Key decides which partition it lands in.
type Message struct {
	Key   string
	Value string
}

// partition is an append-only message log; consumers read it in offset order.
type partition struct {
	mu     sync.Mutex
	log    []Message
	notify chan struct{} // closed on append to wake up blocked consumers
}

func newPartition() *partition {
	return &partition{notify: make(chan struct{})}
}

func (p *partition) append(msg Message) {
	p.mu.Lock()
	p.log = append(p.log, msg)
	close(p.notify)
	p.notify = make(chan struct{})
	p.mu.Unlock()
}

// read fetches the message at offset; it blocks when nothing new is available
// until done is closed, in which case it returns ok=false.
func (p *partition) read(offset int64, done <-chan struct{}) (msg Message, next int64, ok bool) {
	for {
		p.mu.Lock()
		if offset < int64(len(p.log)) {
			msg = p.log[offset]
			p.mu.Unlock()
			return msg, offset + 1, true
		}
		notify := p.notify
		p.mu.Unlock()

		select {
		case <-notify:
		case <-done:
			return Message{}, 0, false
		}
	}
}

// SimpleMQ is an in-process Kafka-style message queue: topic -> multiple partitions.
type SimpleMQ struct {
	mu     sync.RWMutex
	topics map[string][]*partition
}

func NewSimpleMQ() *SimpleMQ {
	return &SimpleMQ{topics: make(map[string][]*partition)}
}

func (q *SimpleMQ) CreateTopic(name string, partitionNum int) {
	if partitionNum < 1 {
		partitionNum = 1
	}
	q.mu.Lock()
	defer q.mu.Unlock()
	if _, exists := q.topics[name]; exists {
		return
	}
	ps := make([]*partition, partitionNum)
	for i := range ps {
		ps[i] = newPartition()
	}
	q.topics[name] = ps
}

var ErrNoSuchTopic = errors.New("mq: topic does not exist")

// Produce picks a partition by hashing Key, keeping same-key messages ordered.
func (q *SimpleMQ) Produce(topic string, msg Message) error {
	q.mu.RLock()
	ps, exists := q.topics[topic]
	q.mu.RUnlock()
	if !exists {
		return ErrNoSuchTopic
	}
	idx := 0
	if msg.Key != "" && len(ps) > 1 {
		h := 0
		for _, r := range msg.Key {
			h = h*31 + int(r)
		}
		if h < 0 {
			h = -h
		}
		idx = h % len(ps)
	}
	ps[idx].append(msg)
	return nil
}

// Consume blocks until the next message of the given partition is available;
// it returns ok=false once done is closed.
func (q *SimpleMQ) Consume(topic string, idx int, offset int64, done <-chan struct{}) (Message, int64, bool) {
	q.mu.RLock()
	ps, exists := q.topics[topic]
	q.mu.RUnlock()
	if !exists || idx < 0 || idx >= len(ps) {
		return Message{}, 0, false
	}
	return ps[idx].read(offset, done)
}
