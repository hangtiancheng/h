package main

import (
	"slices"
	"strings"
)

func smallestPalindrome(s string) string {
	cnt := [26]int{}
	for _, r := range s {
		cnt[r-'a']++
	}
	odd := ""
	for i, c := range cnt {
		if c%2 == 1 {
			odd = string(i + 'a')
			cnt[i]--
			break
		}
	}
	sb := strings.Builder{}
	for i, c := range cnt {
		chr := i + 'a'
		sb.WriteString(strings.Repeat(string(chr), c/2))
	}
	half := sb.String()
	return half + odd + Reverse(half)
}

func Reverse(s string) string {
	r := []rune(s)
	slices.Reverse(r)
	return string(r)
}

