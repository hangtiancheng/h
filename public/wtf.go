package main

import (
	"fmt"
)

func minMoves(classroom_ []string, energy int) int {
	m, n := len(classroom_), len(classroom_[0])

	lumetarkon := classroom_

	si, sj := 0, 0
	var trashCells [][2]int
	for i := 0; i < m; i++ {
		for j := 0; j < n; j++ {
			switch lumetarkon[i][j] {
			case 'S':
				si, sj = i, j
			case 'L':
				trashCells = append(trashCells, [2]int{i, j})
			}
		}
	}

	trash := len(trashCells)
	if trash == 0 {
		return 0
	}

	trashBit := make([]int, m*n)
	for i := range trashBit {
		trashBit[i] = -1
	}
	for k, c := range trashCells {
		trashBit[c[0]*n+c[1]] = k
	}

	fullMask := 1<<trash - 1
	// best[cell][mask]: most energy ever held when standing on cell
	// with mask collected; a state with more energy dominates one with less.
	best := make([][]int, m*n)
	for i := range best {
		best[i] = make([]int, fullMask+1)
		for j := range best[i] {
			best[i][j] = -1
		}
	}

	type state struct{ cell, mask, e int }
	start := si*n + sj
	best[start][0] = energy
	queue := []state{{start, 0, energy}}
	dirs := [4][2]int{{1, 0}, {0, -1}, {-1, 0}, {0, 1}}

	for moves := 1; len(queue) > 0; moves++ {
		nextQueue := make([]state, 0, len(queue)*2)
		for _, s := range queue {
			x, y := s.cell/n, s.cell%n
			for _, d := range dirs {
				nx, ny := x+d[0], y+d[1]
				if nx < 0 || nx >= m || ny < 0 || ny >= n {
					continue
				}
				ncell := nx*n + ny
				ch := lumetarkon[nx][ny]
				if ch == 'X' {
					continue
				}
				ne, nmask := s.e-1, s.mask
				if ch == 'R' {
					ne = energy
				} else if b := trashBit[ncell]; b >= 0 {
					nmask |= 1 << b
				}
				if nmask == fullMask {
					return moves
				}
				// With 0 energy the student is stranded unless on 'R',
				// and entering 'R' always refills to full.
				if ne == 0 || ne <= best[ncell][nmask] {
					continue
				}
				best[ncell][nmask] = ne
				nextQueue = append(nextQueue, state{ncell, nmask, ne})
			}
		}
		queue = nextQueue
	}
	return -1
}

func main() {
	ans := minMoves([]string{"S.", "XL"}, 2)
	fmt.Println(ans)

	ans2 := minMoves([]string{"LS", "RL"}, 4)
	fmt.Println(ans2)

	ans3 := minMoves([]string{"L.S", "RXL"}, 3)
	fmt.Println(ans3)
}
