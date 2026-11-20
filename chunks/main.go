// Go port of chunks/index.ts: the Node worker_threads pool becomes a goroutine
// pool. Worker "processes" are goroutines, postMessage is a send on the
// worker's job channel, and the "message"/"error" events are the task's result
// channel.
package main

import "fmt"

// func main() {
// 	s := make([]int, 3, 10)
// 	a := append(s, 1)
// 	b := append(s, 2)
// 	fmt.Printf("a[3] = %v\n", a[3]) // a[3] = ?
// 	fmt.Printf("b[3] = %v\n", b[3]) // b[3] = ?
// }

// func main() {
// 	c := []int{3, 3}
// 	defer fmt.Printf("c = %v\n", c) // c = ?
// 	c = []int{4, 4}
// }

// func main() {
// 	c := []int{3, 3}
// 	defer func() {
// 		fmt.Printf("c = %v\n", c)
// 	}() // c = ?
// 	c = []int{4, 4}
// }

// type Mngr struct{}

// func (m *Mngr) Error() string {
// 	return ""
// }
// func f() error {
// 	var m *Mngr = nil
// 	return m
// }
// func main() {
// 	if f() == nil {
// 		fmt.Println("A")
// 	} else {
// 		fmt.Println("B")
// 	}
// }

func run() (x int) {
	x = 2
	defer func(y *int) (x int) {
		x++
		*y++
		fmt.Printf("x = %d\n", x) // x = ?
		return 10
	}(&x)
	return x
}
func main() {
	fmt.Printf("main = %d\n", run()) // main = ?
}
