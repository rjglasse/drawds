import type { CodeSource } from '../code/algorithms'
import type { HeapType } from './heap'

// The heap operations' code, as a code box beside the heap shows it while one plays: the heap is
// its array (index i's children 2i + 1 and 2i + 2, its parent (i - 1) / 2), a min heap's and a max
// heap's the same but for the comparison (and the names: smallest / largest, extractMin / Max). Tags
// as in `src/shapes/code/algorithms.ts`: `@line` for the steps' `line`, `$i` for a value shown.

/** A heap operation's code id: heap-insert-min, heap-build-max... */
export const heapCode = (op: 'insert' | 'remove' | 'extract' | 'build', type: HeapType) => `heap-${op}-${type}`

function codeFor(type: HeapType) {
	const cmp = type === 'min' ? '<' : '>'
	const best = type === 'min' ? 'smallest' : 'largest'
	const Name = type === 'min' ? 'Min' : 'Max'

	const siftUp = {
		c: String.raw`
			void siftUp(Heap *h, int i) {
			    while (i > 0 && h->a[i] ${cmp} h->a[(i - 1) / 2]) {     @up
			        int p = (i - 1) / 2;
			        swap(&h->a[i], &h->a[p]);                          @swap-up
			        i = p;
			    }
			}`,
		java: String.raw`
			void siftUp(int i) {
			    while (i > 0 && heap[i] ${cmp} heap[(i - 1) / 2]) {     @up
			        int p = (i - 1) / 2;
			        swap(heap, i, p);                                  @swap-up
			        i = p;
			    }
			}`,
		python: String.raw`
			def sift_up(self, i):
			    while i > 0 and self.heap[i] ${cmp} self.heap[(i - 1) // 2]:     @up
			        p = (i - 1) // 2
			        self.heap[i], self.heap[p] = self.heap[p], self.heap[i]     @swap-up
			        i = p`,
	}
	const siftDown = {
		c: String.raw`
			void siftDown(Heap *h, int i) {
			    while (true) {
			        int ${best} = i, l = 2 * i + 1, r = 2 * i + 2;
			        if (l < h->size && h->a[l] ${cmp} h->a[${best}]) ${best} = l;
			        if (r < h->size && h->a[r] ${cmp} h->a[${best}]) ${best} = r;
			        if (${best} == i) return;                             @down
			        swap(&h->a[i], &h->a[${best}]);                      @swap-down
			        i = ${best};
			    }
			}`,
		java: String.raw`
			void siftDown(int i) {
			    while (true) {
			        int ${best} = i, l = 2 * i + 1, r = 2 * i + 2;
			        if (l < size && heap[l] ${cmp} heap[${best}]) ${best} = l;
			        if (r < size && heap[r] ${cmp} heap[${best}]) ${best} = r;
			        if (${best} == i) return;                             @down
			        swap(heap, i, ${best});                              @swap-down
			        i = ${best};
			    }
			}`,
		python: String.raw`
			def sift_down(self, i):
			    n = len(self.heap)
			    while True:
			        ${best}, l, r = i, 2 * i + 1, 2 * i + 2
			        if l < n and self.heap[l] ${cmp} self.heap[${best}]:
			            ${best} = l
			        if r < n and self.heap[r] ${cmp} self.heap[${best}]:
			            ${best} = r
			        if ${best} == i:
			            return                                         @down
			        self.heap[i], self.heap[${best}] = self.heap[${best}], self.heap[i]     @swap-down
			        i = ${best}`,
	}
	// Append, then sift up, in one function.
	const insert: CodeSource = {
		c: String.raw`
			void insert(Heap *h, int value) {                         $value
			    h->a[h->size] = value;                                @append
			    int i = h->size++;
			    while (i > 0 && h->a[i] ${cmp} h->a[(i - 1) / 2]) {   @up $i
			        int p = (i - 1) / 2;
			        swap(&h->a[i], &h->a[p]);                         @swap-up
			        i = p;
			    }
			}`,
		java: String.raw`
			void insert(int value) {                                  $value
			    heap[size] = value;                                   @append
			    int i = size++;
			    while (i > 0 && heap[i] ${cmp} heap[(i - 1) / 2]) {   @up $i
			        int p = (i - 1) / 2;
			        swap(heap, i, p);                                 @swap-up
			        i = p;
			    }
			}`,
		python: String.raw`
			def insert(self, value):                                  $value
			    self.heap.append(value)                               @append
			    i = len(self.heap) - 1
			    while i > 0 and self.heap[i] ${cmp} self.heap[(i - 1) // 2]:     @up $i
			        p = (i - 1) // 2
			        self.heap[i], self.heap[p] = self.heap[p], self.heap[i]     @swap-up
			        i = p`,
	}
	// The root out: the last value takes its place and sifts down.
	const extract: CodeSource = {
		c: String.raw`
			int extract${Name}(Heap *h) {
			    int ${type} = h->a[0];                 @take $${type}
			    h->a[0] = h->a[--h->size];             @move
			    siftDown(h, 0);
			    return ${type};
			}
			${siftDown.c}`,
		java: String.raw`
			int extract${Name}() {
			    int ${type} = heap[0];                 @take $${type}
			    heap[0] = heap[--size];                @move
			    siftDown(0);
			    return ${type};
			}
			${siftDown.java}`,
		python: String.raw`
			def extract_${type}(self):
			    ${type} = self.heap[0]                 @take $${type}
			    last = self.heap.pop()
			    if self.heap:
			        self.heap[0] = last                @move
			        self.sift_down(0)
			    return ${type}
			${siftDown.python}`,
	}
	// Any value out: the last takes its place, then sifts up if it beats its new parent, else down.
	const remove: CodeSource = {
		c: String.raw`
			void removeAt(Heap *h, int i) {                               @call
			    h->a[i] = h->a[--h->size];                                @move
			    if (i > 0 && h->a[i] ${cmp} h->a[(i - 1) / 2]) siftUp(h, i);
			    else siftDown(h, i);
			}
			${siftUp.c}
			${siftDown.c}`,
		java: String.raw`
			void removeAt(int i) {                                        @call
			    heap[i] = heap[--size];                                   @move
			    if (i > 0 && heap[i] ${cmp} heap[(i - 1) / 2]) siftUp(i);
			    else siftDown(i);
			}
			${siftUp.java}
			${siftDown.java}`,
		python: String.raw`
			def remove_at(self, i):                                       @call
			    last = self.heap.pop()
			    if i < len(self.heap):
			        self.heap[i] = last                                   @move
			        if i > 0 and self.heap[i] ${cmp} self.heap[(i - 1) // 2]:
			            self.sift_up(i)
			        else:
			            self.sift_down(i)
			${siftUp.python}
			${siftDown.python}`,
	}
	// Floyd's bottom-up build: every parent sifted down, the last first.
	const build: CodeSource = {
		c: String.raw`
			void buildHeap(Heap *h) {
			    for (int i = h->size / 2 - 1; i >= 0; i--)    @loop $i
			        siftDown(h, i);                           @sift
			}
			${siftDown.c}`,
		java: String.raw`
			void buildHeap() {
			    for (int i = size / 2 - 1; i >= 0; i--)    @loop $i
			        siftDown(i);                           @sift
			}
			${siftDown.java}`,
		python: String.raw`
			def build_heap(self):
			    for i in range(len(self.heap) // 2 - 1, -1, -1):    @loop $i
			        self.sift_down(i)                                @sift
			${siftDown.python}`,
	}
	return {
		[heapCode('insert', type)]: insert,
		[heapCode('extract', type)]: extract,
		[heapCode('remove', type)]: remove,
		[heapCode('build', type)]: build,
	}
}

// The traversals of the tree the array stands for: the binary tree's (`src/shapes/tree/code.ts`), line
// for line, over indexes: i's children 2i + 1 and 2i + 2 are there while they are under the size. The
// same for a min and a max heap.
const TRAVERSALS: Record<string, CodeSource> = {
	'heap-pre': {
		c: String.raw`
			void preOrder(Heap *h, int i) {                             @call $i
			    visit(h->a[i]);                                         @visit
			    if (2 * i + 1 < h->size) preOrder(h, 2 * i + 1);        @left
			    if (2 * i + 2 < h->size) preOrder(h, 2 * i + 2);        @right
			}`,
		java: String.raw`
			void preOrder(int i) {                              @call $i
			    visit(heap[i]);                                 @visit
			    if (2 * i + 1 < size) preOrder(2 * i + 1);      @left
			    if (2 * i + 2 < size) preOrder(2 * i + 2);      @right
			}`,
		python: String.raw`
			def pre_order(self, i):                     @call $i
			    visit(self.heap[i])                     @visit
			    if 2 * i + 1 < len(self.heap):          @left
			        self.pre_order(2 * i + 1)
			    if 2 * i + 2 < len(self.heap):          @right
			        self.pre_order(2 * i + 2)`,
	},
	'heap-in': {
		c: String.raw`
			void inOrder(Heap *h, int i) {                              @call $i
			    if (2 * i + 1 < h->size) inOrder(h, 2 * i + 1);         @left
			    visit(h->a[i]);                                         @visit
			    if (2 * i + 2 < h->size) inOrder(h, 2 * i + 2);         @right
			}`,
		java: String.raw`
			void inOrder(int i) {                               @call $i
			    if (2 * i + 1 < size) inOrder(2 * i + 1);       @left
			    visit(heap[i]);                                 @visit
			    if (2 * i + 2 < size) inOrder(2 * i + 2);       @right
			}`,
		python: String.raw`
			def in_order(self, i):                      @call $i
			    if 2 * i + 1 < len(self.heap):          @left
			        self.in_order(2 * i + 1)
			    visit(self.heap[i])                     @visit
			    if 2 * i + 2 < len(self.heap):          @right
			        self.in_order(2 * i + 2)`,
	},
	'heap-post': {
		c: String.raw`
			void postOrder(Heap *h, int i) {                            @call $i
			    if (2 * i + 1 < h->size) postOrder(h, 2 * i + 1);       @left
			    if (2 * i + 2 < h->size) postOrder(h, 2 * i + 2);       @right
			    visit(h->a[i]);                                         @visit
			}`,
		java: String.raw`
			void postOrder(int i) {                             @call $i
			    if (2 * i + 1 < size) postOrder(2 * i + 1);     @left
			    if (2 * i + 2 < size) postOrder(2 * i + 2);     @right
			    visit(heap[i]);                                 @visit
			}`,
		python: String.raw`
			def post_order(self, i):                    @call $i
			    if 2 * i + 1 < len(self.heap):          @left
			        self.post_order(2 * i + 1)
			    if 2 * i + 2 < len(self.heap):          @right
			        self.post_order(2 * i + 2)
			    visit(self.heap[i])                     @visit`,
	},
	'heap-level': {
		c: String.raw`
			void levelOrder(Heap *h, int root) {
			    int queue[h->size];
			    int front = 0, rear = 0;
			    queue[rear++] = root;                                   @start
			    while (front < rear) {
			        int i = queue[front++];                             $i
			        visit(h->a[i]);                                     @visit
			        if (2 * i + 1 < h->size) queue[rear++] = 2 * i + 1;
			        if (2 * i + 2 < h->size) queue[rear++] = 2 * i + 2;
			    }
			}`,
		java: String.raw`
			void levelOrder(int root) {
			    Queue<Integer> queue = new ArrayDeque<>();
			    queue.add(root);                                    @start
			    while (!queue.isEmpty()) {
			        int i = queue.remove();                         $i
			        visit(heap[i]);                                 @visit
			        if (2 * i + 1 < size) queue.add(2 * i + 1);
			        if (2 * i + 2 < size) queue.add(2 * i + 2);
			    }
			}`,
		python: String.raw`
			def level_order(self, root):
			    queue = deque([root])                   @start
			    while queue:
			        i = queue.popleft()                 $i
			        visit(self.heap[i])                 @visit
			        if 2 * i + 1 < len(self.heap):
			            queue.append(2 * i + 1)
			        if 2 * i + 2 < len(self.heap):
			            queue.append(2 * i + 2)`,
	},
}

export const HEAP_CODE: Record<string, CodeSource> = { ...codeFor('min'), ...codeFor('max'), ...TRAVERSALS }
