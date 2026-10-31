const MIN_HEAP_CAPACITY = 32;

export class BreadcrumbHeap<T extends { timestamp: number }> {
  private capacity = MIN_HEAP_CAPACITY;
  private heap: T[] = [];

  get size() {
    return this.heap.length;
  }

  constructor(capacity = MIN_HEAP_CAPACITY, itemArray: T[] = []) {
    this.capacity = Math.max(capacity, MIN_HEAP_CAPACITY);
    this.heap = itemArray.slice(0, capacity);
    this.buildHeap();
    if (itemArray.length > capacity) {
      const rest = itemArray.slice(capacity);
      for (const item of rest) {
        if (item.timestamp >= this.heap[0].timestamp) {
          this.heap[0] = item;
          this.heapifyDown(0);
        }
      }
    }
  }

  push(item: T): boolean {
    if (this.size < this.capacity) {
      this.heap.push(item);
      this.heapifyUp(this.size - 1);
      return true;
    }
    if (item.timestamp >= this.heap[0].timestamp) {
      this.heap[0] = item;
      this.heapifyDown(0);
      return true;
    }
    return false;
  }

  peek(): T | undefined {
    return this.heap[0];
  }

  private heapifyUp(idx: number) {
    while (idx > 0) {
      const parentIdx = Math.floor((idx - 1) / 2);
      if (this.heap[parentIdx].timestamp <= this.heap[idx].timestamp) {
        break;
      }
      [this.heap[idx], this.heap[parentIdx]] = [
        this.heap[parentIdx],
        this.heap[idx],
      ];
      idx = parentIdx;
    }
  }

  private heapifyDown(idx: number) {
    while (true) {
      let childIdx = idx;
      const left = idx * 2 + 1;
      const right = idx * 2 + 2;
      if (
        left < this.size &&
        this.heap[left].timestamp < this.heap[childIdx].timestamp
      ) {
        childIdx = left;
      }
      if (
        right < this.size &&
        this.heap[right].timestamp < this.heap[childIdx].timestamp
      ) {
        childIdx = right;
      }
      if (childIdx === idx) {
        break;
      }
      [this.heap[idx], this.heap[childIdx]] = [
        this.heap[childIdx],
        this.heap[idx],
      ];
      idx = childIdx;
    }
  }

  private buildHeap() {
    const lastLeafIdx = this.size - 1;
    const lastNonLeafIdx = Math.floor((lastLeafIdx - 1) / 2);
    for (let i = lastNonLeafIdx; i >= 0; i--) {
      this.heapifyDown(i);
    }
  }

  dump(): T[] {
    return this.heap;
  }

  clear() {
    this.heap = [];
  }

  pop(): T | undefined {
    if (this.size === 0) {
      return undefined;
    }
    const peek = this.heap[0];
    this.heap[0] = this.heap[this.size - 1];
    this.heap.pop();
    if (this.size > 0) {
      this.heapifyDown(0);
    }
    return peek;
  }
}
