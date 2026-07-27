// Package downloader_sdk is the Go equivalent of src/js/downloader-sdk.ts:
// a music player SDK that downloads files in chunks (strictly one chunk at a
// time per URL), starts playback as soon as the first chunk lands, supports
// seeking (reusing got chunks, keeping only the inflight request for the next
// needed chunk) and preloading (which always defers to an active playback).
//
// JS/Go mapping: AbortSignal -> context.Context, Promise -> blocking call
// returning error, injected playback promise -> PlaybackFunc. Unlike the JS
// version (which fires playback promises concurrently in index order),
// playback here is dispatched by a per-session goroutine strictly in order,
// which matches how an audio pipeline consumes chunks.
package downloader_sdk

import (
	"context"
	"errors"
	"sync"
	"time"
)

// GetFunc downloads one chunk of url. It must honor ctx cancellation.
type GetFunc func(ctx context.Context, url string) error

// PlaybackFunc plays one downloaded chunk.
type PlaybackFunc func(idx int) error

type Meta struct {
	Gets  []GetFunc
	Start int
}

// ErrPlaybackInterrupted settles a session that was replaced by a newer
// StartPlayback or SeekTo call.
var ErrPlaybackInterrupted = errors.New("playback interrupted")

// Fixed short retry delay (no exponential backoff): a stalled playback chunk
// is latency-critical, so fail fast and let the caller degrade instead of
// waiting out long backoffs.
const (
	defaultMaxRetries = 3
	defaultRetryDelay = 100 * time.Millisecond
)

type getter struct {
	done   chan struct{}
	err    error // written before done is closed
	cancel context.CancelFunc
	got    bool
}

type playSession struct {
	id      int
	url     string
	resCh   chan error
	playCh  chan int
	need    int
	played  int
	settled bool
}

type SDK struct {
	mu       sync.Mutex
	cond     *sync.Cond // signaled on download fires and session settles
	playback PlaybackFunc
	// Chunk cache keyed by url, then by absolute chunk index, so preloading
	// one url never corrupts the download state of another.
	cache   map[string]map[int]*getter
	session int
	current *playSession

	maxRetries int
	retryDelay time.Duration
}

func New() *SDK {
	s := &SDK{
		playback:   func(int) error { return nil },
		cache:      map[string]map[int]*getter{},
		maxRetries: defaultMaxRetries,
		retryDelay: defaultRetryDelay,
	}
	s.cond = sync.NewCond(&s.mu)
	return s
}

// SetPlayback injects the host player's chunk playback function.
func (s *SDK) SetPlayback(fn PlaybackFunc) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.playback = fn
}

func (s *SDK) chunksLocked(url string) map[int]*getter {
	m := s.cache[url]
	if m == nil {
		m = map[int]*getter{}
		s.cache[url] = m
	}
	return m
}

func (s *SDK) getWithRetry(ctx context.Context, get GetFunc, url string) error {
	for attempt := 0; ; attempt++ {
		err := get(ctx, url)
		if err == nil {
			return nil
		}
		// Aborted downloads (e.g. by a seek) must not be retried.
		if ctx.Err() != nil || attempt >= s.maxRetries {
			return err
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(s.retryDelay):
		}
	}
}

func (s *SDK) fireDownloadLocked(url string, meta Meta, idx int) *getter {
	ctx, cancel := context.WithCancel(context.Background())
	g := &getter{done: make(chan struct{}), cancel: cancel}
	s.chunksLocked(url)[idx] = g
	get := meta.Gets[idx]
	go func() {
		g.err = s.getWithRetry(ctx, get, url)
		close(g.done)
	}()
	s.cond.Broadcast()
	return g
}

func (s *SDK) markGot(g *getter) {
	s.mu.Lock()
	if !g.got {
		g.got = true
		g.cancel = nil
	}
	s.mu.Unlock()
}

func (s *SDK) settleLocked(ps *playSession, err error) {
	if ps.settled {
		return
	}
	ps.settled = true
	ps.resCh <- err // buffered, single settle: never blocks
	if s.current == ps {
		s.current = nil
	}
	s.cond.Broadcast()
}

// StartPlayback downloads url in chunks starting at meta.Start and plays each
// chunk as soon as it lands. It blocks until every chunk from Start on has
// played, a download or playback fails, or a newer session replaces this one
// (ErrPlaybackInterrupted).
func (s *SDK) StartPlayback(url string, meta Meta) error {
	s.mu.Lock()
	// Starting a new playback replaces (and interrupts) any previous session.
	if s.current != nil {
		s.settleLocked(s.current, ErrPlaybackInterrupted)
	}
	s.session++
	start := max(meta.Start, 0)
	if start >= len(meta.Gets) {
		s.mu.Unlock()
		return nil
	}
	ps := &playSession{
		id:    s.session,
		url:   url,
		resCh: make(chan error, 1),
		need:  len(meta.Gets) - start,
	}
	ps.playCh = make(chan int, ps.need)
	s.current = ps
	s.mu.Unlock()

	go s.dispatchPlayback(ps)
	go s.runSession(url, meta, start, ps)
	return <-ps.resCh
}

// dispatchPlayback plays chunks strictly in the order they were downloaded,
// without ever blocking the download loop.
func (s *SDK) dispatchPlayback(ps *playSession) {
	for idx := range ps.playCh {
		s.mu.Lock()
		fn := s.playback
		stale := ps.settled || ps.id != s.session
		s.mu.Unlock()
		if stale {
			return
		}
		err := fn(idx)
		s.mu.Lock()
		if ps.settled || ps.id != s.session {
			s.mu.Unlock()
			return
		}
		if err != nil {
			s.settleLocked(ps, err)
			s.mu.Unlock()
			return
		}
		ps.played++
		if ps.played == ps.need {
			s.settleLocked(ps, nil)
		}
		s.mu.Unlock()
	}
}

func (s *SDK) runSession(url string, meta Meta, start int, ps *playSession) {
	defer close(ps.playCh)
	for idx := start; idx < len(meta.Gets); idx++ {
		s.mu.Lock()
		if ps.settled || ps.id != s.session {
			s.mu.Unlock()
			return
		}
		chunks := s.chunksLocked(url)
		g := chunks[idx]
		if g == nil {
			// The session's next chunk has priority: cancel any other
			// inflight download (e.g. a preload further ahead) so only one
			// chunk downloads at a time.
			for i, other := range chunks {
				if !other.got && i != idx {
					if other.cancel != nil {
						other.cancel()
					}
					delete(chunks, i)
				}
			}
			g = s.fireDownloadLocked(url, meta, idx)
		}
		got := g.got
		s.mu.Unlock()
		if !got {
			<-g.done
			s.mu.Lock()
			if ps.settled || ps.id != s.session {
				// A seek replaced this session while we were downloading; a
				// stale session must not touch shared cache entries.
				s.mu.Unlock()
				return
			}
			if g.err != nil {
				if chunks[idx] == g {
					delete(chunks, idx)
				}
				s.settleLocked(ps, g.err)
				s.mu.Unlock()
				return
			}
			g.got = true
			g.cancel = nil
			s.mu.Unlock()
		}
		ps.playCh <- idx
	}
}

// SeekTo restarts playback of url at chunk idx. Got chunks replay instantly
// without re-downloading. Among inflight requests, only the one for the first
// chunk at or after idx that still needs downloading is kept (and reused);
// every other inflight request is aborted so that chunk can start
// immediately. Like StartPlayback, it blocks until the new session settles.
func (s *SDK) SeekTo(url string, meta Meta, idx int) error {
	if idx < 0 || idx >= len(meta.Gets) {
		return nil
	}
	s.mu.Lock()
	chunks := s.chunksLocked(url)

	// Got chunks may be sparse (earlier seeks/preloads), so scan for the
	// first chunk at or after idx that still needs downloading.
	nextNeeded := idx
	for nextNeeded < len(meta.Gets) {
		g := chunks[nextNeeded]
		if g == nil || !g.got {
			break
		}
		nextNeeded++
	}

	for i, g := range chunks {
		if !g.got && i != nextNeeded {
			if g.cancel != nil {
				g.cancel()
			}
			// Drop the aborted entry so a later session re-downloads it.
			delete(chunks, i)
		}
	}
	s.mu.Unlock()

	m := meta
	m.Start = idx
	return s.StartPlayback(url, m)
}

func findInflightLocked(chunks map[int]*getter) *getter {
	for _, g := range chunks {
		if !g.got {
			return g
		}
	}
	return nil
}

// Preload downloads chunks of url sequentially starting at idx. It always
// defers to any inflight download (e.g. an active playback session) so only
// one chunk downloads at a time, and backs off (returning the error) when a
// download it depends on fails or is aborted by a seek.
func (s *SDK) Preload(url string, meta Meta, idx int) error {
	i := max(idx, 0)
	for {
		s.mu.Lock()
		if i >= len(meta.Gets) {
			s.mu.Unlock()
			return nil
		}
		chunks := s.chunksLocked(url)
		if g := chunks[i]; g != nil {
			if g.got {
				i++
				s.mu.Unlock()
				continue
			}
			// Someone else (playback or an earlier preload) is downloading it.
			s.mu.Unlock()
			<-g.done
			if g.err != nil {
				return g.err
			}
			s.markGot(g)
			i++
			continue
		}
		if inf := findInflightLocked(chunks); inf != nil {
			// Defer to the other inflight download, then re-check chunk i
			// since the state may have changed while waiting.
			s.mu.Unlock()
			<-inf.done
			if inf.err != nil {
				return inf.err
			}
			s.markGot(inf)
			continue
		}
		if cur := s.current; cur != nil && !cur.settled && cur.url == url {
			// An active playback session owns this url's download slot and
			// will fire its next chunk momentarily; wait instead of racing
			// it (it would cancel our request anyway).
			s.cond.Wait()
			s.mu.Unlock()
			continue
		}
		g := s.fireDownloadLocked(url, meta, i)
		s.mu.Unlock()
		<-g.done
		s.mu.Lock()
		if g.err != nil {
			if chunks[i] == g {
				delete(chunks, i)
			}
			s.mu.Unlock()
			return g.err
		}
		g.got = true
		g.cancel = nil
		s.mu.Unlock()
		i++
	}
}
