package main

func maximumLengthSubstring(s string) int {
	cnt := make(map[byte]int)
	n := len(s)
	ans := 0
	l, r := 0, 0
	for l <= r && r < n {
		c := s[r]

		cnt[c]++
		if cnt[c] > 2 {

			for cnt[c] > 2 {
				c2 := s[l]
				cnt[c2]--
				l++
			}
		}
		r++

		ans = max(ans, r-l)
	}

	return max(ans, r-l)
}

func missingInteger(nums []int) int {
	n := len(nums)
	pre := nums[0]
	for i := 1; i < n; i++ {
		if nums[i] == nums[i-1]+1 {
			pre += nums[i]
		} else {
			break
		}
	}
	s := map[int]struct{}{}
	for _, num := range nums {
		s[num] = struct{}{}
	}

	for i := pre; ; i++ {
		if _, ok := s[i]; !ok {
			return i
		}
	}
}
