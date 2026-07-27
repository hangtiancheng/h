package main

import (
	"container/heap"
	"fmt"
	"math"
)

func init() {

	fmt.Println("initA")
}

func init() {
	fmt.Println("initB")
}

type minHeapNode struct {
	x int
	y int
	d int
}

type minHeap []minHeapNode

// Len implements [heap.Interface].
func (m minHeap) Len() int {
	return len(m)

}

// Less implements [heap.Interface].
func (m minHeap) Less(i int, j int) bool {
	return m[i].d < m[j].d
}

// Pop implements [heap.Interface].
func (m *minHeap) Pop() any {
	t := (*m)[len(*m)-1]
	*m = (*m)[:len(*m)-1]
	return t
}

// Push implements [heap.Interface].
func (m *minHeap) Push(x any) {
	*m = append(*m, x.(minHeapNode))
}

// Swap implements [heap.Interface].
func (m minHeap) Swap(i int, j int) {
	m[i], m[j] = m[j], m[i]
}

var _ heap.Interface = (*minHeap)(nil)

func findSafeWalk(grid [][]int, health int) bool {
	type pair struct {
		x int
		y int
	}
	m, n := len(grid), len(grid[0])
	dir4 := []pair{{0, 1}, {1, 0}, {0, -1}, {-1, 0}}

	dist := make([][]int, m)
	for i := range m {
		dist[i] = make([]int, n)
		for j := range n {
			dist[i][j] = math.MaxInt
		}
	}

	dist[0][0] = grid[0][0]
	h := minHeap{{
		x: 0,
		y: 0,
		d: grid[0][0],
	}}

	heap.Init(&h)

	vis := make([][]bool, m)
	for i := range m {
		vis[i] = make([]bool, n)
	}

	for h.Len() > 0 {
		// Shift the heap's top element
		top := heap.Pop(&h).(minHeapNode)
		px, py := top.x, top.y

		if vis[px][py] {
			continue
		}
		vis[px][py] = true

		if px == m-1 && py == n-1 {
			break
		}

		for _, d := range dir4 {
			x, y := px+d.x, py+d.y

			if x >= 0 && x < m && y >= 0 && y < n {
				cost := grid[x][y]
				if dist[px][py]+cost < dist[x][y] {
					dist[x][y] = dist[px][py] + cost
					heap.Push(&h, minHeapNode{
						x: x,
						y: y,
						d: dist[x][y],
					})
				}
			}
		}
	}

	return dist[m-1][n-1] < health
}

func minScore(n int, roads [][]int) int {
	type edge struct{ to, dis int }
	g := make([][]edge, n+1)

	for _, e := range roads {
		x, y, dis := e[0], e[1], e[2]
		g[x] = append(g[x], edge{y, dis})
		g[y] = append(g[y], edge{x, dis})
	}

	vis := make([]bool, n+1)
	ans := math.MaxInt
	var dfs func(int)
	dfs = func(x int) {
		vis[x] = true
		for _, e := range g[x] {
			ans = min(ans, e.dis)
			if !vis[e.to] {
				dfs(e.to)
			}
		}
	}
	dfs(1)
	return ans
}

func shiftGrid(grid [][]int, k int) [][]int {

	flat := make([]int, 0)
	m, n, f := len(grid), len(grid[0]), len(grid)*len(grid[0])

	for _, arr := range grid {
		flat = append(flat, arr...)
	}

	k = k % f

	flat = append(flat[f-k:f], flat[0:f-k]...)

	fmt.Println(flat)

	for i := range m {
		for j := range n {
			idx := i*n + j
			grid[i][j] = flat[idx]
		}
	}

	return grid
}

func smallestSubsequence(s string) string {
	ans := ""
	i, j := 0, 0
	chars := [26]int{}
	maxL := 0
	for ; i <= j && j < len(s); j++ {
		idx := s[j] - 'a'
		if chars[idx] == 0 {
			chars[idx]++
			continue
		}

		// chars[idx] == 1
		curL := j - i
		if curL == maxL {
			if ans == "" {
				ans = s[i:j]
			} else {
				ans = min(ans, s[i:j]) // Dictionary Ordered
			}
		}

		if curL > maxL {
			maxL = curL
			ans = s[i:j]
		}

		chars[idx]++ // chars[idx] == 2
		for ; i <= j && chars[idx] > 1; i++ {
			chars[s[i]-'a']--
		}

		// chars[idx] == 1
	}
	curL := j - i
	if curL == maxL {
		if ans == "" {
			ans = s[i:j]
		} else {
			ans = min(ans, s[i:j]) // Dictionary Ordered
		}
	}
	return ans
}

func removeDuplicateLetters(s string) string {
	charCnts := [26]int{}

	for _, c := range s {
		charCnts[c-'a']++
	}

	ans := []rune{}

	inAns := [26]bool{}

	for _, c := range s {
		idx := int(c - 'a')
		charCnts[idx]--
		if inAns[idx] {
			continue
		}

		for len(ans) > 0 &&
			c < ans[len(ans)-1] &&
			// 后面还有 ans[len(ans)-1]
			charCnts[ans[len(ans)-1]] > 0 {
			x := ans[len(ans)-1]
			ans = ans[:len(ans)-1]
			inAns[x-'a'] = false
		}

		ans = append(ans, c)
		inAns[c] = true
	}

	return string(ans)
}

func maxActiveSectionsAfterTrade(s string) (ans int) {
	mx := 0
	pre0 := math.MinInt
	cnt := 0
	for i := range len(s) {
		cnt++
		if i == len(s)-1 || s[i] != s[i+1] { // i 是一段的末尾
			if s[i] == '1' { // 是一段 '1'
				ans += cnt
			} else { // 是一段 '0'
				mx = max(mx, pre0+cnt)
				pre0 = cnt
			}
			cnt = 0
		}
	}
	return ans + mx
}

func test() (int, int) {
	i := 0
	var st struct{ a int } = struct{ a int }{a: 1}

	defer func() {
		fmt.Println("defer1")
	}()

	defer func() {
		i++
		st.a++
		fmt.Println("defer2")
	}()

	return i, st.a
}

// func main() {
//   i, a := test()
// 	fmt.Println("test returns", i, a)
// }

func test2() (i int, a int) {
	var st struct{ a int } = struct{ a int }{a: 1}

	defer func() {
		fmt.Println("defer1")
	}()

	defer func() {
		i++
		st.a++
		fmt.Println("defer2")
	}()

	return i, st.a
}

type MyError struct{}

// Error implements [error].
func (m *MyError) Error() string {
 return "MyError"
}

var _ error = (*MyError)(nil)

func foo() *MyError {
	var err *MyError = nil
	return err
}

func main() {
	a := []int{1, 2, 3, 4, 5}
  b := a[:]
  a = append(a, 7);
  b = append(b, 8)
  fmt.Println(a, b)
}
