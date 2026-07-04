package heap

import "container/heap"
import "sort"

type hp struct {
	sort.IntSlice // Len, Less, Swap, Sort
}

// Pop implements [heap.Interface].
func (h *hp) Pop() any {
	tail := h.IntSlice[len(h.IntSlice)-1]
	h.IntSlice = h.IntSlice[:len(h.IntSlice)-1]
	return tail
}

// Push implements [heap.Interface].
func (h *hp) Push(x any) {
	h.IntSlice = append(h.IntSlice, x.(int))
}

var _ heap.Interface = (*hp)(nil)

var primes = []int{2, 3, 5}

func nthUglyNumber(n int) int {
	h := &hp{
		IntSlice: []int{1},
	}

	seen := map[int]struct{}{1: struct{}{}}

	for i := 1; ; i++ {
		x := heap.Pop(h).(int)
		if i == n {
			return x
		}

		for _, p := range primes {
			y := x * p
			if _, ok := seen[y]; !ok {
				seen[y] = struct{}{}
				heap.Push(h, y)
			}
		}
	}
}
