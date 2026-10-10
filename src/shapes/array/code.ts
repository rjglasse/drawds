import type { CodeSource } from '../code/algorithms'

// The array algorithms' code, as a code box beside the array shows it while one plays (see
// `src/shapes/code/algorithms.ts`). The @tags at the ends of lines are the `line`s the steps in
// `operations.ts` and `scans.ts` name, so a line reads as what its step shows; the $tags the
// variables shown there (the steps' pointers, or what they `let`). Insertion sort is lecture 3's, the
// shuffles lecture 2's (its names: numbers, the random index n).

// Lomuto's partition, as quicksort and its variants call it (lecture 10's, CLRS's): the last value is the pivot.
const JAVA_PARTITION = String.raw`
			int partition(int[] a, int lo, int hi) {
			    int pivot = a[hi];                      @pivot $pivot
			    int i = lo - 1;                         $i
			    for (int j = lo; j < hi; j++) {         $j
			        if (a[j] < pivot) {                 @compare
			            i++;
			            swap(a, i, j);                  @swap
			        }
			    }
			    swap(a, i + 1, hi);                     @place
			    return i + 1;
			}`

const PYTHON_PARTITION = String.raw`
			def partition(a, lo, hi):
			    pivot = a[hi]                           @pivot $pivot
			    i = lo - 1                              $i
			    for j in range(lo, hi):                 $j
			        if a[j] < pivot:                    @compare
			            i += 1
			            a[i], a[j] = a[j], a[i]         @swap
			    a[i + 1], a[hi] = a[hi], a[i + 1]       @place
			    return i + 1`

export const ARRAY_CODE: Record<string, CodeSource> = {
	'linear-search': {
		java: String.raw`
			int linearSearch(int[] a, int key) {        $key
			    for (int i = 0; i < a.length; i++) {    @loop $i
			        if (a[i] == key) {                  @compare
			            return i;                       @found
			        }
			    }
			    return -1;                              @missing
			}`,
		python: String.raw`
			def linear_search(a, key):          $key
			    for i in range(len(a)):             @loop $i
			        if a[i] == key:                 @compare
			            return i                    @found
			    return -1                           @missing`,
	},
	'binary-search': {
		java: String.raw`
			int binarySearch(int[] a, int key) {      $key
			    int lo = 0, hi = a.length - 1;            @init $lo $hi
			    while (lo <= hi) {
			        int mid = (lo + hi) / 2;              @mid $mid
			        if (a[mid] == key) return mid;        @found
			        else if (a[mid] < key) lo = mid + 1;  @right
			        else hi = mid - 1;                    @left
			    }
			    return -1;                                @missing
			}`,
		python: String.raw`
			def binary_search(a, key):          $key
			    lo, hi = 0, len(a) - 1              @init $lo $hi
			    while lo <= hi:
			        mid = (lo + hi) // 2            @mid $mid
			        if a[mid] == key:
			            return mid                  @found
			        elif a[mid] < key:
			            lo = mid + 1                @right
			        else:
			            hi = mid - 1                @left
			    return -1                           @missing`,
	},
	'binary-search-recursive': {
		java: String.raw`
			int binarySearch(int[] a, int key, int low, int high) {     $key $low $high
			    if (low > high) return -1;                              @missing
			    int mid = (low + high) / 2;                             @mid $mid
			    if (a[mid] == key) return mid;                          @found
			    if (a[mid] < key)
			        return binarySearch(a, key, mid + 1, high);         @right
			    else
			        return binarySearch(a, key, low, mid - 1);          @left
			}`,
		python: String.raw`
			def binary_search(a, key, low, high):          $key $low $high
			    if low > high:
			        return -1                               @missing
			    mid = (low + high) // 2                     @mid $mid
			    if a[mid] == key:
			        return mid                              @found
			    if a[mid] < key:
			        return binary_search(a, key, mid + 1, high)     @right
			    return binary_search(a, key, low, mid - 1)          @left`,
	},
	'sentinel-search': {
		java: String.raw`
			int sentinelSearch(int[] a, int n, int key) {   $n $key
			    a[n] = key; // past the end: the sentinel   @sentinel
			    int i = 0;
			    while (a[i] != key) {                       @compare $i
			        i++;
			    }
			    if (i < n) return i;                        @found
			    return -1;                                  @missing
			}`,
		python: String.raw`
			def sentinel_search(a, key):        $key
			    n = len(a)                          $n
			    a.append(key)  # the sentinel       @sentinel
			    i = 0
			    while a[i] != key:                  @compare $i
			        i += 1
			    a.pop()
			    return i if i < n else -1           @found @missing`,
	},
	'sum-invariant': {
		java: String.raw`
			int sum(int[] nums) {
			    int total = nums[0];                    @init $total
			    int i = 1;
			    while (i < nums.length) {               $i
			        total += nums[i];                   @add
			        i++;
			        // total == nums[0] + ... + nums[i - 1]
			    }
			    return total;                           @done
			}`,
		python: String.raw`
			def sum_array(nums):
			    total = nums[0]                     @init $total
			    i = 1
			    while i < len(nums):                $i
			        total += nums[i]                @add
			        i += 1
			        # total == sum(nums[0:i])
			    return total                        @done`,
	},
	'find-max': {
		java: String.raw`
			int maxElement(int[] a) {
			    int maxval = a[0];                      @init $maxval
			    for (int i = 1; i < a.length; i++) {    @loop $i
			        if (a[i] > maxval) {                @compare
			            maxval = a[i];                  @update
			        }
			    }
			    return maxval;                          @done
			}`,
		python: String.raw`
			def max_element(a):
			    maxval = a[0]                       @init $maxval
			    for i in range(1, len(a)):          @loop $i
			        if a[i] > maxval:               @compare
			            maxval = a[i]               @update
			    return maxval                       @done`,
	},
	'all-unique': {
		java: String.raw`
			boolean uniqueElements(int[] a) {
			    for (int i = 0; i < a.length - 1; i++) {        @outer $i
			        for (int j = i + 1; j < a.length; j++) {    @inner $j
			            if (a[i] == a[j]) {                     @compare
			                return false;                       @repeat
			            }
			        }
			    }
			    return true;                                    @unique
			}`,
		python: String.raw`
			def unique_elements(a):
			    n = len(a)                          @n
			    for i in range(n - 1):              @outer $i
			        for j in range(i + 1, n):       @inner $j
			            if a[i] == a[j]:            @compare
			                return False            @repeat
			    return True                         @unique`,
	},
	'insertion-sort': {
		java: String.raw`
			void insertionSort(int[] a) {
			    for (int i = 1; i < a.length; i++) {        @outer $i
			        int key = a[i];                         @key $key
			        int j = i;                              @start
			        while (j > 0 && a[j - 1] > key) {       @compare $j
			            swap(a, j, j - 1);                  @swap
			            j--;                                @back
			        }
			    }
			}`,
		python: String.raw`
			def insertion_sort(a):
			    for i in range(1, len(a)):                  @outer $i
			        key = a[i]                              @key $key
			        j = i                                   @start
			        while j > 0 and a[j - 1] > key:         @compare $j
			            a[j], a[j - 1] = a[j - 1], a[j]     @swap
			            j -= 1                              @back`,
	},
	'selection-sort': {
		java: String.raw`
			void selectionSort(int[] a) {
			    for (int i = 0; i < a.length - 1; i++) {        @outer $i
			        int min = i;                                @init $min
			        for (int j = i + 1; j < a.length; j++) {    @inner $j
			            if (a[j] < a[min]) {                    @compare
			                min = j;                            @update
			            }
			        }
			        if (min != i)                               @noswap
			            swap(a, i, min);                        @swap
			    }
			}`,
		python: String.raw`
			def selection_sort(a):
			    n = len(a)                                          @n
			    for i in range(n - 1):                              @outer $i
			        min_idx = i                                     @init $min_idx=min
			        for j in range(i + 1, n):                       @inner $j
			            if a[j] < a[min_idx]:                       @compare
			                min_idx = j                             @update
			        if min_idx != i:                                @noswap
			            a[i], a[min_idx] = a[min_idx], a[i]         @swap`,
	},
	'bubble-sort': {
		java: String.raw`
			void bubbleSort(int[] a) {
			    for (int pass = 1; pass < a.length; pass++) {   @outer $pass
			        boolean swapped = false;                    @reset $swapped
			        for (int j = 0; j < a.length - pass; j++) {  @inner $j
			            if (a[j] > a[j + 1]) {                  @compare
			                swap(a, j, j + 1);                  @swap
			                swapped = true;                     @flag
			            }
			        }
			        if (!swapped)                               @pass
			            break;                                  @sorted
			    }
			}`,
		python: String.raw`
			def bubble_sort(a):
			    n = len(a)                                      @n
			    for p in range(1, n):                           @outer $p=pass
			        swapped = False                             @reset $swapped
			        for j in range(n - p):                      @inner $j
			            if a[j] > a[j + 1]:                     @compare
			                a[j], a[j + 1] = a[j + 1], a[j]     @swap
			                swapped = True                      @flag
			        if not swapped:                             @pass
			            break                                   @sorted`,
	},
	partition: {
		java: String.raw`
			int partition(int[] a, int lo, int hi) {    $lo $hi
			    int pivot = a[hi];                      @pivot $pivot
			    int i = lo - 1;                         $i
			    for (int j = lo; j < hi; j++) {         $j
			        if (a[j] < pivot) {                 @compare
			            i++;
			            swap(a, i, j);                  @swap
			        }
			    }
			    swap(a, i + 1, hi);                     @place
			    return i + 1;
			}`,
		python: String.raw`
			def partition(a, lo, hi):               $lo $hi
			    pivot = a[hi]                           @pivot $pivot
			    i = lo - 1                              $i
			    for j in range(lo, hi):                 $j
			        if a[j] < pivot:                    @compare
			            i += 1
			            a[i], a[j] = a[j], a[i]         @swap
			    a[i + 1], a[hi] = a[hi], a[i + 1]       @place
			    return i + 1`,
	},
	quicksort: {
		java: String.raw`
			void quicksort(int[] a, int lo, int hi) {   $lo $hi
			    if (lo < hi) {                          @base
			        int p = partition(a, lo, hi);       @partition
			        quicksort(a, lo, p - 1);
			        quicksort(a, p + 1, hi);
			    }
			}
			${JAVA_PARTITION}`,
		python: String.raw`
			def quicksort(a, lo, hi):               $lo $hi
			    if lo < hi:                             @base
			        p = partition(a, lo, hi)            @partition
			        quicksort(a, lo, p - 1)
			        quicksort(a, p + 1, hi)
			${PYTHON_PARTITION}`,
	},
	// Lecture 10's improvements, one at a time.
	'quicksort-random': {
		java: String.raw`
			void quicksort(int[] a, int lo, int hi) {           $lo $hi
			    if (lo < hi) {                                  @base
			        int k = lo + rand.nextInt(hi - lo + 1);     @pick $k
			        swap(a, k, hi);                             @toend
			        int p = partition(a, lo, hi);               @partition
			        quicksort(a, lo, p - 1);
			        quicksort(a, p + 1, hi);
			    }
			}
			${JAVA_PARTITION}`,
		python: String.raw`
			def quicksort(a, lo, hi):                   $lo $hi
			    if lo < hi:                                 @base
			        k = random.randint(lo, hi)              @pick $k
			        a[k], a[hi] = a[hi], a[k]               @toend
			        p = partition(a, lo, hi)                @partition
			        quicksort(a, lo, p - 1)
			        quicksort(a, p + 1, hi)
			${PYTHON_PARTITION}`,
	},
	'quicksort-median': {
		java: String.raw`
			void quicksort(int[] a, int lo, int hi) {                   $lo $hi
			    if (lo < hi) {                                          @base
			        if (hi - lo >= 2) { // three values or more
			            int m = medianOf3(a, lo, (lo + hi) / 2, hi);    @median $mid $m
			            swap(a, m, hi);                                 @tohi
			        }
			        int p = partition(a, lo, hi);                       @partition
			        quicksort(a, lo, p - 1);
			        quicksort(a, p + 1, hi);
			    }
			}

			// The index of the middle value of a[i], a[j] and a[k].
			int medianOf3(int[] a, int i, int j, int k) {
			    if (a[i] < a[j]) {
			        if (a[j] < a[k]) return j;
			        return a[i] < a[k] ? k : i;
			    }
			    if (a[i] < a[k]) return i;
			    return a[j] < a[k] ? k : j;
			}
			${JAVA_PARTITION}`,
		python: String.raw`
			def quicksort(a, lo, hi):                           $lo $hi
			    if lo < hi:                                         @base
			        if hi - lo >= 2:  # three values or more
			            m = median_of_3(a, lo, (lo + hi) // 2, hi)  @median $mid $m
			            a[m], a[hi] = a[hi], a[m]                   @tohi
			        p = partition(a, lo, hi)                        @partition
			        quicksort(a, lo, p - 1)
			        quicksort(a, p + 1, hi)

			# The index of the middle value of a[i], a[j] and a[k].
			def median_of_3(a, i, j, k):
			    if a[i] < a[j]:
			        if a[j] < a[k]:
			            return j
			        return k if a[i] < a[k] else i
			    if a[i] < a[k]:
			        return i
			    return k if a[j] < a[k] else j
			${PYTHON_PARTITION}`,
	},
	// Dijkstra's three-way partition (the Dutch national flag), inside quicksort as Sedgewick writes it.
	'quicksort-3way': {
		java: String.raw`
			void quicksort(int[] a, int lo, int hi) {           $lo $hi
			    if (lo >= hi) return;                           @base
			    int pivot = a[hi];                              @pivot $pivot
			    int lt = lo, i = lo, gt = hi;                   $lt $i $gt
			    while (i <= gt) {
			        if (a[i] < pivot) swap(a, lt++, i++);       @less @less-swap
			        else if (a[i] > pivot) swap(a, i, gt--);    @more @more-swap
			        else i++;                                   @equal
			    }
			    quicksort(a, lo, lt - 1);                       @split
			    quicksort(a, gt + 1, hi);
			}`,
		python: String.raw`
			def quicksort(a, lo, hi):                   $lo $hi
			    if lo >= hi:                                @base
			        return
			    pivot = a[hi]                               @pivot $pivot
			    lt, i, gt = lo, lo, hi                      $lt $i $gt
			    while i <= gt:
			        if a[i] < pivot:                        @less
			            a[lt], a[i] = a[i], a[lt]           @less-swap
			            lt, i = lt + 1, i + 1
			        elif a[i] > pivot:                      @more
			            a[i], a[gt] = a[gt], a[i]           @more-swap
			            gt -= 1
			        else:
			            i += 1                              @equal
			    quicksort(a, lo, lt - 1)                    @split
			    quicksort(a, gt + 1, hi)`,
	},
	'partition-3way': {
		java: String.raw`
			// Then a[lo..lt-1] < pivot, a[lt..gt] == pivot, a[gt+1..hi] > pivot.
			int[] partition3(int[] a, int lo, int hi) {
			    int pivot = a[hi];                              @pivot $pivot
			    int lt = lo, i = lo, gt = hi;                   $lt $i $gt
			    while (i <= gt) {
			        if (a[i] < pivot) swap(a, lt++, i++);       @less @less-swap
			        else if (a[i] > pivot) swap(a, i, gt--);    @more @more-swap
			        else i++;                                   @equal
			    }
			    return new int[] { lt, gt };                    @split
			}`,
		python: String.raw`
			# Then a[lo:lt] < pivot, a[lt:gt + 1] == pivot, a[gt + 1:hi + 1] > pivot.
			def partition3(a, lo, hi):
			    pivot = a[hi]                               @pivot $pivot
			    lt, i, gt = lo, lo, hi                      $lt $i $gt
			    while i <= gt:
			        if a[i] < pivot:                        @less
			            a[lt], a[i] = a[i], a[lt]           @less-swap
			            lt, i = lt + 1, i + 1
			        elif a[i] > pivot:                      @more
			            a[i], a[gt] = a[gt], a[i]           @more-swap
			            gt -= 1
			        else:
			            i += 1                              @equal
			    return lt, gt                               @split`,
	},
	'quicksort-cutoff': {
		java: String.raw`
			void quicksort(int[] a, int lo, int hi) {           $lo $hi
			    if (hi - lo + 1 <= CUTOFF) {                    @small $CUTOFF
			        insertionSort(a, lo, hi);
			        return;
			    }
			    int p = partition(a, lo, hi);                   @partition
			    quicksort(a, lo, p - 1);
			    quicksort(a, p + 1, hi);
			}

			void insertionSort(int[] a, int lo, int hi) {
			    for (int i = lo + 1; i <= hi; i++)                      $i
			        for (int j = i; j > lo && a[j - 1] > a[j]; j--)     @is-compare $j
			            swap(a, j, j - 1);                              @is-swap
			}
			${JAVA_PARTITION}`,
		python: String.raw`
			def quicksort(a, lo, hi):                   $lo $hi
			    if hi - lo + 1 <= CUTOFF:                   @small $CUTOFF
			        insertion_sort(a, lo, hi)
			        return
			    p = partition(a, lo, hi)                    @partition
			    quicksort(a, lo, p - 1)
			    quicksort(a, p + 1, hi)

			def insertion_sort(a, lo, hi):
			    for i in range(lo + 1, hi + 1):             $i
			        j = i
			        while j > lo and a[j - 1] > a[j]:       @is-compare $j
			            a[j], a[j - 1] = a[j - 1], a[j]     @is-swap
			            j -= 1
			${PYTHON_PARTITION}`,
	},
	'hoare-partition': {
		java: String.raw`
			int hoarePartition(int[] a, int lo, int hi) {
			    int pivot = a[lo];                      @pivot $pivot
			    int i = lo - 1, j = hi + 1;
			    while (true) {
			        do i++; while (a[i] < pivot);       @left $i
			        do j--; while (a[j] > pivot);       @right $j
			        if (i >= j) return j;               @crossed
			        swap(a, i, j);                      @swap
			    }
			}`,
		python: String.raw`
			def hoare_partition(a, lo, hi):
			    pivot = a[lo]                           @pivot $pivot
			    i, j = lo - 1, hi + 1
			    while True:
			        i += 1
			        while a[i] < pivot:                 @left $i
			            i += 1
			        j -= 1
			        while a[j] > pivot:                 @right $j
			            j -= 1
			        if i >= j:                          @crossed
			            return j
			        a[i], a[j] = a[j], a[i]             @swap`,
	},
	'merge-sort': {
		java: String.raw`
			void mergeSort(int[] a, int lo, int hi) {               $lo $hi
			    if (lo == hi) return;                               @base
			    int mid = (lo + hi) / 2;                            @split $mid
			    mergeSort(a, lo, mid);
			    mergeSort(a, mid + 1, hi);
			    merge(a, lo, mid, hi);                              @merge
			}

			void merge(int[] a, int lo, int mid, int hi) {
			    int[] merged = new int[hi - lo + 1];
			    int i = lo, j = mid + 1, k = 0;
			    while (i <= mid && j <= hi) {                       $i $j $k
			        if (a[i] <= a[j]) merged[k++] = a[i++];         @left
			        else merged[k++] = a[j++];                      @right
			    }
			    while (i <= mid) merged[k++] = a[i++];              @rest-left
			    while (j <= hi) merged[k++] = a[j++];               @rest-right
			    for (k = 0; k < merged.length; k++) a[lo + k] = merged[k];  @copy
			}`,
		python: String.raw`
			def merge_sort(a, lo, hi):              $lo $hi
			    if lo == hi:                            @base
			        return
			    mid = (lo + hi) // 2                    @split $mid
			    merge_sort(a, lo, mid)
			    merge_sort(a, mid + 1, hi)
			    merge(a, lo, mid, hi)                   @merge

			def merge(a, lo, mid, hi):
			    merged = []
			    i, j = lo, mid + 1
			    while i <= mid and j <= hi:             $i $j
			        if a[i] <= a[j]:
			            merged.append(a[i])             @left
			            i += 1
			        else:
			            merged.append(a[j])             @right
			            j += 1
			    merged += a[i:mid + 1]                  @rest-left
			    merged += a[j:hi + 1]                   @rest-right
			    a[lo:hi + 1] = merged                   @copy`,
	},
	'unfair-shuffle': {
		java: String.raw`
			public void shuffleArray(int[] numbers) {
			    for (int i = 0; i < numbers.length; i++) {      $i
			        int n = rand.nextInt(numbers.length);       @pick $n
			        swap(numbers, i, n);                        @swap
			    }
			}`,
		python: String.raw`
			def shuffle_array(numbers):
			    for i in range(len(numbers)):                   $i
			        n = random.randint(0, len(numbers) - 1)     @pick $n
			        numbers[i], numbers[n] = numbers[n], numbers[i]     @swap`,
	},
	'fisher-yates': {
		java: String.raw`
			public void shuffleArray(int[] numbers) {
			    for (int i = numbers.length - 1; i > 0; i--) {  $i
			        int n = rand.nextInt(i + 1);                @pick $n
			        swap(numbers, i, n);                        @swap
			    }
			}`,
		python: String.raw`
			def shuffle_array(numbers):
			    for i in range(len(numbers) - 1, 0, -1):        $i
			        n = random.randint(0, i)                    @pick $n
			        numbers[i], numbers[n] = numbers[n], numbers[i]     @swap`,
	},
	// Lecture 6's ArrayStack (a fixed array, top from -1), a method per operation.
	'stack-push': {
		java: String.raw`
			void push(int v) {                      $v
			    if (top == a.length - 1)            @overflow
			        throw new StackOverflowError();
			    top++;                              @inc $top
			    a[top] = v;                         @store
			}`,
		python: String.raw`
			def push(self, v):                      $v
			    if self.top == len(self.a) - 1:     @overflow
			        raise OverflowError('stack overflow')
			    self.top += 1                       @inc $top
			    self.a[self.top] = v                @store`,
	},
	'stack-pop': {
		java: String.raw`
			int pop() {
			    if (top == -1)                      @underflow
			        throw new EmptyStackException();
			    int v = a[top];                     @take $v
			    top--;                              @dec $top
			    return v;
			}`,
		python: String.raw`
			def pop(self):
			    if self.top == -1:                  @underflow
			        raise IndexError('pop from an empty stack')
			    v = self.a[self.top]                @take $v
			    self.top -= 1                       @dec $top
			    return v`,
	},
	'stack-peek': {
		java: String.raw`
			int peek() {
			    if (top == -1)                      @peek-empty
			        throw new EmptyStackException();
			    return a[top];                      @peek $top
			}`,
		python: String.raw`
			def peek(self):
			    if self.top == -1:                  @peek-empty
			        raise IndexError('peek at an empty stack')
			    return self.a[self.top]             @peek $top`,
	},
	// Insert by shifting, the array growing by one cell (as a Python list does).
	'array-insert': {
		java: String.raw`
			void insert(int k, int value) {               $k $value
			    a = Arrays.copyOf(a, a.length + 1);       @grow
			    for (int i = a.length - 1; i > k; i--)    $i
			        a[i] = a[i - 1];                      @shift
			    a[k] = value;                             @place
			}`,
		python: String.raw`
			def insert(a, k, value):                  $k $value
			    a.append(None)                        @grow
			    for i in range(len(a) - 1, k, -1):    $i
			        a[i] = a[i - 1]                   @shift
			    a[k] = value                          @place`,
	},
	// Delete by shifting, the array shrinking by one cell.
	'array-delete': {
		java: String.raw`
			void delete(int k) {                          $k
			    for (int i = k; i < a.length - 1; i++)    @start $i
			        a[i] = a[i + 1];                      @shift
			    a = Arrays.copyOf(a, a.length - 1);       @shrink
			}`,
		python: String.raw`
			def delete(a, k):                     $k
			    for i in range(k, len(a) - 1):    @start $i
			        a[i] = a[i + 1]               @shift
			    a.pop()                           @shrink`,
	},
	// A fixed capacity: size counts the values in use, the rest are spare slots.
	'array-insert-fixed': {
		java: String.raw`
			void insert(int k, int value) {                                       $k $value
			    if (size == a.length) throw new IllegalStateException("full");    @full
			    for (int i = size; i > k; i--)                                    @start $i
			        a[i] = a[i - 1];                                              @shift
			    a[k] = value;                                                     @place
			    size++;
			}`,
		python: String.raw`
			def insert(self, k, value):                      $k $value
			    if self.size == len(self.a):                 @full
			        raise IndexError("the array is full")
			    for i in range(self.size, k, -1):            @start $i
			        self.a[i] = self.a[i - 1]                @shift
			    self.a[k] = value                            @place
			    self.size += 1`,
	},
	// Delete with a fixed capacity: the last slot in use is spare again.
	'array-delete-fixed': {
		java: String.raw`
			void delete(int k) {                      $k
			    for (int i = k; i < size - 1; i++)    @start $i
			        a[i] = a[i + 1];                  @shift
			    size--;                               @shrink
			}`,
		python: String.raw`
			def delete(self, k):                     $k
			    for i in range(k, self.size - 1):    @start $i
			        self.a[i] = self.a[i + 1]        @shift
			    self.size -= 1                       @shrink`,
	},
	// Lecture 6's ArrayQueue, a circular buffer: rear and front wrap round, nothing moves.
	'queue-enqueue': {
		java: String.raw`
			void enqueue(int value) {                                             $value
			    if (size == a.length) throw new IllegalStateException("full");    @full
			    a[rear] = value;                                                  @store $rear
			    rear = (rear + 1) % a.length;                                     @rear
			    size++;
			}`,
		python: String.raw`
			def enqueue(self, value):                        $value
			    if self.size == len(self.a):                 @full
			        raise IndexError("the queue is full")
			    self.a[self.rear] = value                    @store $rear
			    self.rear = (self.rear + 1) % len(self.a)    @rear
			    self.size += 1`,
	},
	// Dequeue: take a[front], then front moves on, round past the end.
	'queue-dequeue': {
		java: String.raw`
			int dequeue() {
			    if (size == 0) throw new NoSuchElementException();    @empty
			    int v = a[front];                                     @take $front $v
			    front = (front + 1) % a.length;                       @front
			    size--;
			    return v;
			}`,
		python: String.raw`
			def dequeue(self):
			    if self.size == 0:                             @empty
			        raise IndexError("the queue is empty")
			    v = self.a[self.front]                         @take $front $v
			    self.front = (self.front + 1) % len(self.a)    @front
			    self.size -= 1
			    return v`,
	},
	// Peek at the front: nothing changes.
	'queue-peek': {
		java: String.raw`
			int peek() {
			    if (size == 0) throw new NoSuchElementException();    @empty
			    return a[front];                                      @peek $front
			}`,
		python: String.raw`
			def peek(self):
			    if self.size == 0:                            @empty
			        raise IndexError("the queue is empty")
			    return self.a[self.front]                     @peek $front`,
	},
}
