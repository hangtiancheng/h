package downloader_sdk

import (
	"context"
	"errors"
	"slices"
	"sync"
	"testing"
	"time"
)

type chunkCall struct {
	idx     int
	ctx     context.Context
	res     chan error
	settled bool
}

type track struct {
	mu            sync.Mutex
	url           string
	meta          Meta
	calls         []*chunkCall
	maxConcurrent int
}

func newTrack(n int, url string) *track {
	tr := &track{url: url}
	gets := make([]GetFunc, n)
	for i := range gets {
		idx := i
		gets[idx] = func(ctx context.Context, _ string) error {
			tr.mu.Lock()
			c := &chunkCall{idx: idx, ctx: ctx, res: make(chan error, 1)}
			live := 1
			for _, e := range tr.calls {
				if !e.settled && e.ctx.Err() == nil {
					live++
				}
			}
			tr.maxConcurrent = max(tr.maxConcurrent, live)
			tr.calls = append(tr.calls, c)
			tr.mu.Unlock()
			var err error
			select {
			case err = <-c.res:
			case <-ctx.Done():
				err = ctx.Err()
			}
			tr.mu.Lock()
			c.settled = true
			tr.mu.Unlock()
			return err
		}
	}
	tr.meta = Meta{Gets: gets}
	return tr
}

func (tr *track) callCount() int {
	tr.mu.Lock()
	defer tr.mu.Unlock()
	return len(tr.calls)
}

func (tr *track) callsFor(idx int) int {
	tr.mu.Lock()
	defer tr.mu.Unlock()
	n := 0
	for _, c := range tr.calls {
		if c.idx == idx {
			n++
		}
	}
	return n
}

func (tr *track) lastCallFor(idx int) *chunkCall {
	tr.mu.Lock()
	defer tr.mu.Unlock()
	for i := len(tr.calls) - 1; i >= 0; i-- {
		if tr.calls[i].idx == idx {
			return tr.calls[i]
		}
	}
	return nil
}

func (tr *track) pendingIdxs() []int {
	tr.mu.Lock()
	defer tr.mu.Unlock()
	var out []int
	for _, c := range tr.calls {
		if !c.settled {
			out = append(out, c.idx)
		}
	}
	return out
}

func (tr *track) hasUnsettledCallFor(idx int) bool {
	tr.mu.Lock()
	defer tr.mu.Unlock()
	for i := len(tr.calls) - 1; i >= 0; i-- {
		if tr.calls[i].idx == idx {
			return !tr.calls[i].settled
		}
	}
	return false
}

func (tr *track) settleWith(t *testing.T, idx int, err error) {
	t.Helper()
	c := tr.lastCallFor(idx)
	if c == nil {
		t.Fatalf("no call for chunk %d to settle", idx)
	}
	c.res <- err
	// Wait until the get actually returned, so a later settle for the same
	// idx can never hit this same call again.
	waitFor(t, "call settled", func() bool {
		tr.mu.Lock()
		defer tr.mu.Unlock()
		return c.settled
	})
}

func (tr *track) resolve(t *testing.T, idx int) {
	t.Helper()
	tr.settleWith(t, idx, nil)
}

func (tr *track) reject(t *testing.T, idx int, err error) {
	t.Helper()
	tr.settleWith(t, idx, err)
}

func (tr *track) maxLiveConcurrent() int {
	tr.mu.Lock()
	defer tr.mu.Unlock()
	return tr.maxConcurrent
}

type recorder struct {
	mu   sync.Mutex
	idxs []int
}

func (r *recorder) fn(idx int) error {
	r.mu.Lock()
	r.idxs = append(r.idxs, idx)
	r.mu.Unlock()
	return nil
}

func (r *recorder) snapshot() []int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return slices.Clone(r.idxs)
}

func waitFor(t *testing.T, msg string, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatalf("timeout waiting for %s", msg)
}

func startAsync(s *SDK, url string, meta Meta) chan error {
	ch := make(chan error, 1)
	go func() { ch <- s.StartPlayback(url, meta) }()
	return ch
}

func seekAsync(s *SDK, url string, meta Meta, idx int) chan error {
	ch := make(chan error, 1)
	go func() { ch <- s.SeekTo(url, meta, idx) }()
	return ch
}

func preloadAsync(s *SDK, url string, meta Meta, idx int) chan error {
	ch := make(chan error, 1)
	go func() { ch <- s.Preload(url, meta, idx) }()
	return ch
}

// playUpTo resolves chunks 0..lastIdx one by one, waiting for each to play.
func playUpTo(t *testing.T, tr *track, rec *recorder, lastIdx int) {
	t.Helper()
	for i := 0; i <= lastIdx; i++ {
		waitFor(t, "chunk request", func() bool { return tr.lastCallFor(i) != nil })
		tr.resolve(t, i)
		waitFor(t, "chunk played", func() bool {
			s := rec.snapshot()
			return len(s) > 0 && s[len(s)-1] == i
		})
	}
}

func newSDK() (*SDK, *recorder) {
	s := New()
	rec := &recorder{}
	s.SetPlayback(rec.fn)
	return s, rec
}

func TestSequentialDownloadPlaysEachChunkASAP(t *testing.T) {
	s, rec := newSDK()
	tr := newTrack(3, "u")
	errCh := startAsync(s, tr.url, tr.meta)

	waitFor(t, "chunk 0 requested", func() bool { return tr.callCount() == 1 })
	if got := tr.callCount(); got != 1 {
		t.Fatalf("expected only chunk 0 requested, got %d calls", got)
	}
	tr.resolve(t, 0)
	waitFor(t, "chunk 0 played and chunk 1 requested", func() bool {
		return slices.Equal(rec.snapshot(), []int{0}) && tr.callsFor(1) == 1
	})
	tr.resolve(t, 1)
	waitFor(t, "chunk 1 played and chunk 2 requested", func() bool {
		return slices.Equal(rec.snapshot(), []int{0, 1}) && tr.callsFor(2) == 1
	})
	tr.resolve(t, 2)
	if err := <-errCh; err != nil {
		t.Fatalf("session error: %v", err)
	}
	if !slices.Equal(rec.snapshot(), []int{0, 1, 2}) {
		t.Fatalf("played %v", rec.snapshot())
	}
	if tr.maxLiveConcurrent() != 1 {
		t.Fatalf("concurrent downloads: %d", tr.maxLiveConcurrent())
	}
}

func TestSlowPlaybackDoesNotBlockDownloads(t *testing.T) {
	s, _ := newSDK()
	gate := make(chan struct{})
	var started sync.Map
	s.SetPlayback(func(idx int) error {
		started.Store(idx, true)
		<-gate
		return nil
	})
	tr := newTrack(3, "u")
	errCh := startAsync(s, tr.url, tr.meta)

	waitFor(t, "chunk 0 requested", func() bool { return tr.callsFor(0) == 1 })
	tr.resolve(t, 0)
	// playback(0) blocks on gate, but downloads must keep flowing
	waitFor(t, "chunk 1 requested while playback(0) blocked", func() bool {
		_, ok := started.Load(0)
		return ok && tr.callsFor(1) == 1
	})
	tr.resolve(t, 1)
	waitFor(t, "chunk 2 requested", func() bool { return tr.callsFor(2) == 1 })
	tr.resolve(t, 2)

	select {
	case err := <-errCh:
		t.Fatalf("session settled before playback finished: %v", err)
	case <-time.After(20 * time.Millisecond):
	}
	close(gate)
	if err := <-errCh; err != nil {
		t.Fatalf("session error: %v", err)
	}
}

func TestNothingToPlayResolvesImmediately(t *testing.T) {
	s, _ := newSDK()
	if err := s.StartPlayback("u", Meta{}); err != nil {
		t.Fatalf("empty gets: %v", err)
	}
	tr := newTrack(2, "u2")
	if err := s.StartPlayback(tr.url, Meta{Gets: tr.meta.Gets, Start: 99}); err != nil {
		t.Fatalf("start beyond length: %v", err)
	}
	if tr.callCount() != 0 {
		t.Fatalf("no chunks should be requested, got %d", tr.callCount())
	}
}

func TestNegativeStartClamped(t *testing.T) {
	s, rec := newSDK()
	tr := newTrack(2, "u")
	errCh := startAsync(s, tr.url, Meta{Gets: tr.meta.Gets, Start: -5})
	playUpTo(t, tr, rec, 1)
	if err := <-errCh; err != nil {
		t.Fatalf("session error: %v", err)
	}
	if !slices.Equal(rec.snapshot(), []int{0, 1}) {
		t.Fatalf("played %v", rec.snapshot())
	}
}

func TestSecondStartInterruptsFirst(t *testing.T) {
	s, _ := newSDK()
	tr1 := newTrack(3, "u1")
	err1Ch := startAsync(s, tr1.url, tr1.meta)
	waitFor(t, "first session started", func() bool { return tr1.callCount() == 1 })

	tr2 := newTrack(1, "u2")
	err2Ch := startAsync(s, tr2.url, tr2.meta)
	if err := <-err1Ch; !errors.Is(err, ErrPlaybackInterrupted) {
		t.Fatalf("first session error = %v", err)
	}
	waitFor(t, "second session chunk", func() bool { return tr2.callCount() == 1 })
	tr2.resolve(t, 0)
	if err := <-err2Ch; err != nil {
		t.Fatalf("second session error: %v", err)
	}
}

func TestRetryFixedDelayRecovers(t *testing.T) {
	s, rec := newSDK()
	s.retryDelay = 2 * time.Millisecond
	tr := newTrack(1, "u")
	errCh := startAsync(s, tr.url, tr.meta)

	waitFor(t, "attempt 1", func() bool { return tr.callsFor(0) == 1 })
	tr.reject(t, 0, errors.New("flaky"))
	waitFor(t, "attempt 2 (retry)", func() bool { return tr.callsFor(0) == 2 })
	tr.reject(t, 0, errors.New("flaky"))
	waitFor(t, "attempt 3 (retry)", func() bool { return tr.callsFor(0) == 3 })
	tr.resolve(t, 0)
	if err := <-errCh; err != nil {
		t.Fatalf("session error: %v", err)
	}
	if !slices.Equal(rec.snapshot(), []int{0}) {
		t.Fatalf("played %v", rec.snapshot())
	}
}

func TestRetryGivesUpAfterMaxRetries(t *testing.T) {
	s, _ := newSDK()
	s.retryDelay = time.Millisecond
	tr := newTrack(1, "u")
	errCh := startAsync(s, tr.url, tr.meta)

	boom := errors.New("net down")
	for attempt := range 4 {
		waitFor(t, "next attempt", func() bool { return tr.callsFor(0) == attempt+1 })
		tr.reject(t, 0, boom)
	}
	if err := <-errCh; !errors.Is(err, boom) {
		t.Fatalf("session error = %v, want %v", err, boom)
	}
	time.Sleep(20 * time.Millisecond)
	if tr.callsFor(0) != 4 {
		t.Fatalf("attempts = %d, want 4 (1 + 3 retries)", tr.callsFor(0))
	}
}

func TestSeekDuringRetryDelayStopsRetry(t *testing.T) {
	s, rec := newSDK()
	s.retryDelay = 100 * time.Millisecond
	tr := newTrack(3, "u")
	err1Ch := startAsync(s, tr.url, tr.meta)

	waitFor(t, "attempt 1", func() bool { return tr.callsFor(0) == 1 })
	tr.reject(t, 0, errors.New("flaky"))

	seekCh := seekAsync(s, tr.url, tr.meta, 2)
	waitFor(t, "target chunk requested", func() bool { return tr.callsFor(2) == 1 })
	if err := <-err1Ch; !errors.Is(err, ErrPlaybackInterrupted) {
		t.Fatalf("first session error = %v", err)
	}
	tr.resolve(t, 2)
	if err := <-seekCh; err != nil {
		t.Fatalf("seek session error: %v", err)
	}
	time.Sleep(250 * time.Millisecond) // well past the retry delay
	if tr.callsFor(0) != 1 {
		t.Fatalf("chunk 0 retried after abort: %d attempts", tr.callsFor(0))
	}
	if !slices.Equal(rec.snapshot(), []int{2}) {
		t.Fatalf("played %v", rec.snapshot())
	}
}

func TestBackwardSeekKeepsInflightAndReplays(t *testing.T) {
	s, rec := newSDK()
	tr := newTrack(15, "u")
	err1Ch := startAsync(s, tr.url, tr.meta)
	playUpTo(t, tr, rec, 6) // chunks 0-6 got, chunk 7 inflight
	waitFor(t, "chunk 7 inflight", func() bool { return tr.callsFor(7) == 1 })
	before := tr.callCount()

	seekCh := seekAsync(s, tr.url, tr.meta, 2)
	waitFor(t, "got chunks replayed", func() bool {
		return slices.Equal(rec.snapshot(), []int{0, 1, 2, 3, 4, 5, 6, 2, 3, 4, 5, 6})
	})
	if err := <-err1Ch; !errors.Is(err, ErrPlaybackInterrupted) {
		t.Fatalf("old session error = %v", err)
	}
	if tr.callCount() != before {
		t.Fatalf("re-downloaded chunks: %d calls, want %d", tr.callCount(), before)
	}
	if tr.lastCallFor(7).ctx.Err() != nil {
		t.Fatal("inflight chunk 7 was aborted, should have been kept")
	}

	tr.resolve(t, 7) // reused by the new session
	waitFor(t, "chunk 7 played, chunk 8 requested", func() bool {
		snap := rec.snapshot()
		return snap[len(snap)-1] == 7 && tr.callsFor(8) == 1
	})
	if tr.callsFor(7) != 1 {
		t.Fatalf("chunk 7 requested %d times", tr.callsFor(7))
	}
	for i := 8; i <= 14; i++ {
		waitFor(t, "chunk request", func() bool { return tr.lastCallFor(i) != nil })
		tr.resolve(t, i)
	}
	if err := <-seekCh; err != nil {
		t.Fatalf("seek session error: %v", err)
	}
	if tr.maxLiveConcurrent() != 1 {
		t.Fatalf("concurrent downloads: %d", tr.maxLiveConcurrent())
	}
}

func TestFastForwardAbortsInflight(t *testing.T) {
	s, rec := newSDK()
	tr := newTrack(15, "u")
	err1Ch := startAsync(s, tr.url, tr.meta)
	playUpTo(t, tr, rec, 6)
	waitFor(t, "chunk 7 inflight", func() bool { return tr.callsFor(7) == 1 })

	seekAsync(s, tr.url, tr.meta, 10)
	waitFor(t, "chunk 10 requested", func() bool { return tr.callsFor(10) == 1 })
	if tr.lastCallFor(7).ctx.Err() == nil {
		t.Fatal("inflight chunk 7 should have been aborted")
	}
	<-err1Ch

	tr.resolve(t, 10)
	waitFor(t, "chunk 10 played", func() bool {
		snap := rec.snapshot()
		return len(snap) > 0 && snap[len(snap)-1] == 10
	})
	if tr.maxLiveConcurrent() != 1 {
		t.Fatalf("concurrent downloads: %d", tr.maxLiveConcurrent())
	}
}

func TestSparseSeekBackFillsGap(t *testing.T) {
	s, rec := newSDK()
	tr := newTrack(15, "u")
	err1Ch := startAsync(s, tr.url, tr.meta)
	playUpTo(t, tr, rec, 6) // 0-6 got, 7 inflight
	waitFor(t, "chunk 7 inflight", func() bool { return tr.callsFor(7) == 1 })

	seek1Ch := seekAsync(s, tr.url, tr.meta, 10)
	<-err1Ch
	waitFor(t, "chunk 10 requested", func() bool { return tr.callsFor(10) == 1 })
	tr.resolve(t, 10)
	waitFor(t, "chunk 11 requested", func() bool { return tr.callsFor(11) == 1 })
	tr.resolve(t, 11)
	waitFor(t, "chunk 12 inflight", func() bool { return tr.callsFor(12) == 1 })
	// state: got = 0-6, 10, 11; chunk 12 inflight; 7, 8, 9 missing (sparse)

	seek2Ch := seekAsync(s, tr.url, tr.meta, 6)
	<-seek1Ch
	waitFor(t, "chunk 6 replayed and gap chunk 7 requested", func() bool {
		snap := rec.snapshot()
		return len(snap) > 0 && snap[len(snap)-1] == 6 && tr.callsFor(7) == 2
	})
	if tr.lastCallFor(12).ctx.Err() == nil {
		t.Fatal("inflight chunk 12 should have been aborted")
	}

	// fill the gap: 7, 8, 9 download; 10, 11 replay; 12 re-downloads
	for _, i := range []int{7, 8, 9} {
		waitFor(t, "gap chunk request", func() bool { return tr.hasUnsettledCallFor(i) })
		tr.resolve(t, i)
		// After 9 lands, cached 10 and 11 replay in the same burst, so check
		// containment rather than the last played element.
		waitFor(t, "gap chunk played", func() bool {
			return slices.Contains(rec.snapshot(), i)
		})
	}
	waitFor(t, "chunk 12 re-requested", func() bool { return tr.callsFor(12) == 2 })
	if tr.callsFor(10) != 1 || tr.callsFor(11) != 1 {
		t.Fatalf("got chunks re-downloaded: 10=%d 11=%d", tr.callsFor(10), tr.callsFor(11))
	}
	for _, i := range []int{12, 13, 14} {
		waitFor(t, "tail chunk request", func() bool { return tr.hasUnsettledCallFor(i) })
		tr.resolve(t, i)
	}
	if err := <-seek2Ch; err != nil {
		t.Fatalf("seek session error: %v", err)
	}
	snap := rec.snapshot()
	if !slices.Equal(snap[len(snap)-9:], []int{6, 7, 8, 9, 10, 11, 12, 13, 14}) {
		t.Fatalf("tail played %v", snap)
	}
	if tr.maxLiveConcurrent() != 1 {
		t.Fatalf("concurrent downloads: %d", tr.maxLiveConcurrent())
	}
}

func TestSeekToInflightTargetReusesRequest(t *testing.T) {
	s, rec := newSDK()
	tr := newTrack(3, "u")
	err1Ch := startAsync(s, tr.url, tr.meta)
	playUpTo(t, tr, rec, 0)
	waitFor(t, "chunk 1 inflight", func() bool { return tr.callsFor(1) == 1 })

	seekCh := seekAsync(s, tr.url, tr.meta, 1)
	<-err1Ch
	time.Sleep(10 * time.Millisecond)
	if tr.callsFor(1) != 1 {
		t.Fatalf("chunk 1 requested %d times, want 1 (reused)", tr.callsFor(1))
	}
	if tr.lastCallFor(1).ctx.Err() != nil {
		t.Fatal("inflight target should not be aborted")
	}
	tr.resolve(t, 1)
	waitFor(t, "chunk 2 requested", func() bool { return tr.callsFor(2) == 1 })
	tr.resolve(t, 2)
	if err := <-seekCh; err != nil {
		t.Fatalf("seek session error: %v", err)
	}
}

func TestRapidSeeksKeepSingleInflight(t *testing.T) {
	s, rec := newSDK()
	tr := newTrack(10, "u")
	err0Ch := startAsync(s, tr.url, tr.meta)
	waitFor(t, "chunk 0 inflight", func() bool { return tr.callsFor(0) == 1 })

	seek1Ch := seekAsync(s, tr.url, tr.meta, 5)
	waitFor(t, "chunk 5 inflight", func() bool { return tr.callsFor(5) == 1 })
	seek2Ch := seekAsync(s, tr.url, tr.meta, 1)
	waitFor(t, "chunk 1 inflight", func() bool { return tr.callsFor(1) == 1 })
	seek3Ch := seekAsync(s, tr.url, tr.meta, 7)
	waitFor(t, "chunk 7 inflight", func() bool { return tr.callsFor(7) == 1 })

	for _, ch := range []chan error{err0Ch, seek1Ch, seek2Ch} {
		if err := <-ch; !errors.Is(err, ErrPlaybackInterrupted) {
			t.Fatalf("replaced session error = %v", err)
		}
	}
	for _, i := range []int{0, 5, 1} {
		if tr.lastCallFor(i).ctx.Err() == nil {
			t.Fatalf("chunk %d should have been aborted", i)
		}
	}
	waitFor(t, "only chunk 7 pending", func() bool {
		return slices.Equal(tr.pendingIdxs(), []int{7})
	})
	for _, i := range []int{7, 8, 9} {
		waitFor(t, "chunk request", func() bool { return tr.lastCallFor(i) != nil })
		tr.resolve(t, i)
	}
	if err := <-seek3Ch; err != nil {
		t.Fatalf("last seek error: %v", err)
	}
	if !slices.Equal(rec.snapshot(), []int{7, 8, 9}) {
		t.Fatalf("played %v", rec.snapshot())
	}
	if tr.maxLiveConcurrent() != 1 {
		t.Fatalf("concurrent downloads: %d", tr.maxLiveConcurrent())
	}
}

func TestOutOfRangeSeekAndPreloadNoop(t *testing.T) {
	s, rec := newSDK()
	tr := newTrack(3, "u")
	errCh := startAsync(s, tr.url, tr.meta)
	waitFor(t, "chunk 0 inflight", func() bool { return tr.callsFor(0) == 1 })

	if err := s.SeekTo(tr.url, tr.meta, 99); err != nil {
		t.Fatalf("out-of-range seek: %v", err)
	}
	if err := s.SeekTo(tr.url, tr.meta, -1); err != nil {
		t.Fatalf("negative seek: %v", err)
	}
	if err := s.Preload(tr.url, tr.meta, 99); err != nil {
		t.Fatalf("out-of-range preload: %v", err)
	}
	if tr.lastCallFor(0).ctx.Err() != nil {
		t.Fatal("running session should not be disturbed")
	}
	playUpTo(t, tr, rec, 2)
	if err := <-errCh; err != nil {
		t.Fatalf("session error: %v", err)
	}
}

func TestPreloadThenPlaybackUsesCache(t *testing.T) {
	s, rec := newSDK()
	tr := newTrack(3, "u")
	preCh := preloadAsync(s, tr.url, tr.meta, 0)
	for i := range 3 {
		waitFor(t, "preload chunk request", func() bool { return tr.callsFor(i) == 1 })
		tr.resolve(t, i)
	}
	if err := <-preCh; err != nil {
		t.Fatalf("preload error: %v", err)
	}
	if tr.callCount() != 3 {
		t.Fatalf("preload calls = %d", tr.callCount())
	}

	if err := s.StartPlayback(tr.url, tr.meta); err != nil {
		t.Fatalf("playback error: %v", err)
	}
	if tr.callCount() != 3 {
		t.Fatalf("playback re-downloaded: %d calls", tr.callCount())
	}
	if !slices.Equal(rec.snapshot(), []int{0, 1, 2}) {
		t.Fatalf("played %v", rec.snapshot())
	}
}

func TestPreloadDefersToActivePlayback(t *testing.T) {
	s, _ := newSDK()
	tr := newTrack(4, "u")
	errCh := startAsync(s, tr.url, tr.meta)
	waitFor(t, "chunk 0 inflight", func() bool { return tr.callsFor(0) == 1 })

	preCh := preloadAsync(s, tr.url, tr.meta, 2)
	time.Sleep(20 * time.Millisecond)
	if tr.callCount() != 1 {
		t.Fatalf("preload fired while playback inflight: %d calls", tr.callCount())
	}

	for resolved := 0; resolved < 4; resolved++ {
		var idx int
		waitFor(t, "exactly one pending download", func() bool {
			p := tr.pendingIdxs()
			if len(p) == 1 {
				idx = p[0]
				return true
			}
			return false
		})
		tr.resolve(t, idx)
	}
	if err := <-errCh; err != nil {
		t.Fatalf("session error: %v", err)
	}
	if err := <-preCh; err != nil {
		t.Fatalf("preload error: %v", err)
	}
	for i := range 4 {
		if tr.callsFor(i) != 1 {
			t.Fatalf("chunk %d downloaded %d times", i, tr.callsFor(i))
		}
	}
	if tr.maxLiveConcurrent() != 1 {
		t.Fatalf("concurrent downloads: %d", tr.maxLiveConcurrent())
	}
}

func TestPreloadBacksOffOnSeekAbort(t *testing.T) {
	s, _ := newSDK()
	tr := newTrack(6, "u")
	err1Ch := startAsync(s, tr.url, tr.meta)
	waitFor(t, "chunk 0 inflight", func() bool { return tr.callsFor(0) == 1 })

	preCh := preloadAsync(s, tr.url, tr.meta, 4)
	time.Sleep(10 * time.Millisecond) // preload is now waiting on chunk 0

	seekCh := seekAsync(s, tr.url, tr.meta, 3)
	<-err1Ch
	if err := <-preCh; !errors.Is(err, context.Canceled) {
		t.Fatalf("preload should back off with the abort error, got %v", err)
	}
	waitFor(t, "chunk 3 requested", func() bool { return tr.callsFor(3) == 1 })
	if tr.callsFor(4) != 0 {
		t.Fatal("preload raced the new session and requested chunk 4")
	}

	for _, i := range []int{3, 4, 5} {
		waitFor(t, "chunk request", func() bool { return tr.lastCallFor(i) != nil })
		tr.resolve(t, i)
	}
	if err := <-seekCh; err != nil {
		t.Fatalf("seek session error: %v", err)
	}
	if tr.maxLiveConcurrent() != 1 {
		t.Fatalf("concurrent downloads: %d", tr.maxLiveConcurrent())
	}
}

func TestPreloadOtherURLIndependent(t *testing.T) {
	s, rec := newSDK()
	a := newTrack(2, "a")
	b := newTrack(2, "b")

	errCh := startAsync(s, a.url, a.meta)
	preCh := preloadAsync(s, b.url, b.meta, 0)

	// caches are independent per url: both may download concurrently
	waitFor(t, "a0 and b0 inflight", func() bool {
		return a.callsFor(0) == 1 && b.callsFor(0) == 1
	})
	playUpTo(t, a, rec, 1)
	if err := <-errCh; err != nil {
		t.Fatalf("session error: %v", err)
	}

	b.resolve(t, 0)
	waitFor(t, "b1 requested", func() bool { return b.callsFor(1) == 1 })
	b.resolve(t, 1)
	if err := <-preCh; err != nil {
		t.Fatalf("preload error: %v", err)
	}

	if err := s.StartPlayback(b.url, b.meta); err != nil {
		t.Fatalf("playback of b: %v", err)
	}
	if b.callCount() != 2 {
		t.Fatalf("b re-downloaded: %d calls", b.callCount())
	}
}

func TestPlaybackErrorStopsSession(t *testing.T) {
	s, _ := newSDK()
	boom := errors.New("decoder blew up")
	s.SetPlayback(func(idx int) error {
		if idx == 0 {
			return boom
		}
		return nil
	})
	tr := newTrack(3, "u")
	errCh := startAsync(s, tr.url, tr.meta)

	waitFor(t, "chunk 0 inflight", func() bool { return tr.callsFor(0) == 1 })
	tr.resolve(t, 0)
	if err := <-errCh; !errors.Is(err, boom) {
		t.Fatalf("session error = %v, want %v", err, boom)
	}

	// chunk 1 may already be inflight; once it settles, the dead session
	// must not request chunk 2
	if tr.callsFor(1) == 1 {
		tr.resolve(t, 1)
	}
	time.Sleep(20 * time.Millisecond)
	if tr.callsFor(2) != 0 {
		t.Fatal("dead session kept downloading after playback error")
	}
}
