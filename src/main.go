package main

import "fmt"

func maxSubarrayLength(nums []int, k int) int {
	l, r := 0, 0
	n := len(nums)
	ans := 0
	cnt := map[int]int{}

	for ; l <= r && r < n; r++ {
		num := nums[r]

		if cnt[num] == k {
			ans = max(ans, r-l)
		}

		cnt[num]++
		for ; l <= r && cnt[num] > k; l++ {
			num2 := nums[l]
			cnt[num2]--
		}
	}

	ans = max(ans, r-l)
	return ans
}

func validSequence(word1 string, word2 string) []int {
	m := len(word1)

	n := len(word2)

	suf := make([]int, m+1)
	j := n - 1
	for i := m - 1; i >= 0; i-- {
		if j >= 0 && word1[i] == word2[j] {
			j--
			suf[i] = suf[i+1] + 1
		} else {
			suf[i] = suf[i+1]
		}
	}

	fmt.Println(suf)

	changed := false
	ans := []int{}
	k := 0

	for i := range m {
		if k == n {
			break
		}

		if word1[i] == word2[k] {
			ans = append(ans, i)
			k++
			continue
		}

		// word1[i] != word2[k]
		if !changed {
			if k+1+suf[i+1] >= n {
				changed = true
				ans = append(ans, i)
				k++
			}
		}
	}

	if k == n {
		return ans
	}
	return []int{}
}
