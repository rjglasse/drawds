import type { CodeSource } from '../../code/algorithms'

// Sorts: lectures 2-3's simple ones, Lomuto's and Hoare's partitions, quicksort and lecture 10's improvements, counting sort, merge sort and merging two arrays, and bogosort (an easter egg). Part of ARRAY_CODE (../code.ts).

// Lomuto's partition, as quicksort and its variants call it (lecture 10's, CLRS's): the last value is the pivot.
const C_PARTITION = String.raw`
			int partition(int a[], int lo, int hi) {
			    int pivot = a[hi];                 @pivot $pivot
			    int i = lo - 1;                    @init $i
			    for (int j = lo; j < hi; j++) {    @loop $j
			        if (a[j] < pivot) {            @compare
			            i++;                       @grow
			            swap(&a[i], &a[j]);        @swap
			        }
			    }
			    swap(&a[i + 1], &a[hi]);           @place
			    return i + 1;                      @result
			}`

const JAVA_PARTITION = String.raw`
			int partition(int[] a, int lo, int hi) {
			    int pivot = a[hi];                      @pivot $pivot
			    int i = lo - 1;                         @init $i
			    for (int j = lo; j < hi; j++) {         @loop $j
			        if (a[j] < pivot) {                 @compare
			            i++;                            @grow
			            swap(a, i, j);                  @swap
			        }
			    }
			    swap(a, i + 1, hi);                     @place
			    return i + 1;                           @result
			}`

const PYTHON_PARTITION = String.raw`
			def partition(a, lo, hi):
			    pivot = a[hi]                           @pivot $pivot
			    i = lo - 1                              @init $i
			    for j in range(lo, hi):                 @loop $j
			        if a[j] < pivot:                    @compare
			            i += 1                          @grow
			            a[i], a[j] = a[j], a[i]         @swap
			    a[i + 1], a[hi] = a[hi], a[i + 1]       @place
			    return i + 1                            @result`

export const SORT_CODE: Record<string, CodeSource> = {
	'insertion-sort': {
		c: String.raw`
			void insertionSort(int a[], int n) {
			    for (int i = 1; i < n; i++) {            @outer $i
			        int key = a[i];                      @key $key
			        int j = i;                           @start
			        while (j > 0 && a[j - 1] > key) {    @compare $j
			            swap(&a[j], &a[j - 1]);          @swap
			            j--;                             @back
			        }
			    }
			}`,
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
	// Shuffle until sorted (an easter egg: running it turns the sounds on).
	bogosort: {
		c: String.raw`
			bool isSorted(int a[], int n) {
			    for (int i = 0; i + 1 < n; i++)
			        if (a[i] > a[i + 1]) return false;   @compare $i
			    return true;                              @sorted
			}

			void bogoSort(int a[], int n) {
			    while (!isSorted(a, n))                   @check
			        shuffle(a, n);                        @shuffle
			}`,
		java: String.raw`
			void bogoSort(int[] a) {
			    while (!isSorted(a))                      @check
			        shuffle(a);                           @shuffle
			}

			boolean isSorted(int[] a) {
			    for (int i = 0; i + 1 < a.length; i++)
			        if (a[i] > a[i + 1]) return false;   @compare $i
			    return true;                              @sorted
			}`,
		python: String.raw`
			def bogo_sort(a):
			    while not is_sorted(a):                   @check
			        random.shuffle(a)                     @shuffle

			def is_sorted(a):
			    for i in range(len(a) - 1):
			        if a[i] > a[i + 1]:                   @compare $i
			            return False
			    return True                               @sorted`,
	},
	// Swap two at random until sorted (the easter egg's other way in).
	bozosort: {
		c: String.raw`
			bool isSorted(int a[], int n) {
			    for (int i = 0; i + 1 < n; i++)
			        if (a[i] > a[i + 1]) return false;   @compare $i
			    return true;                              @sorted
			}

			void bozoSort(int a[], int n) {
			    while (!isSorted(a, n))                   @check
			        swap(&a[rand() % n], &a[rand() % n]);   @swap
			}`,
		java: String.raw`
			void bozoSort(int[] a) {
			    Random random = new Random();
			    while (!isSorted(a))                      @check
			        swap(a, random.nextInt(a.length), random.nextInt(a.length));   @swap
			}

			boolean isSorted(int[] a) {
			    for (int i = 0; i + 1 < a.length; i++)
			        if (a[i] > a[i + 1]) return false;   @compare $i
			    return true;                              @sorted
			}`,
		python: String.raw`
			def bozo_sort(a):
			    while not is_sorted(a):                   @check
			        x, y = random.randrange(len(a)), random.randrange(len(a))   @swap $x $y
			        a[x], a[y] = a[y], a[x]

			def is_sorted(a):
			    for i in range(len(a) - 1):
			        if a[i] > a[i + 1]:                   @compare $i
			            return False
			    return True                               @sorted`,
	},
	'selection-sort': {
		c: String.raw`
			void selectionSort(int a[], int n) {
			    for (int i = 0; i < n - 1; i++) {        @outer $i
			        int min = i;                         @init $min
			        for (int j = i + 1; j < n; j++) {    @inner $j
			            if (a[j] < a[min]) {             @compare
			                min = j;                     @update
			            }
			        }
			        if (min != i)                        @noswap
			            swap(&a[i], &a[min]);            @swap
			    }
			}`,
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
		c: String.raw`
			void bubbleSort(int a[], int n) {
			    for (int pass = 1; pass < n; pass++) {      @outer $pass
			        bool swapped = false;                   @reset $swapped
			        for (int j = 0; j < n - pass; j++) {    @inner $j
			            if (a[j] > a[j + 1]) {              @compare
			                swap(&a[j], &a[j + 1]);         @swap
			                swapped = true;                 @flag
			            }
			        }
			        if (!swapped)                           @pass
			            break;                              @sorted
			    }
			}`,
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
		c: String.raw`
			int partition(int a[], int lo, int hi) {    $lo $hi
			    int pivot = a[hi];                      @pivot $pivot
			    int i = lo - 1;                         @init $i
			    for (int j = lo; j < hi; j++) {         @loop $j
			        if (a[j] < pivot) {                 @compare
			            i++;                            @grow
			            swap(&a[i], &a[j]);             @swap
			        }
			    }
			    swap(&a[i + 1], &a[hi]);                @place
			    return i + 1;                           @result
			}`,
		java: String.raw`
			int partition(int[] a, int lo, int hi) {    $lo $hi
			    int pivot = a[hi];                      @pivot $pivot
			    int i = lo - 1;                         @init $i
			    for (int j = lo; j < hi; j++) {         @loop $j
			        if (a[j] < pivot) {                 @compare
			            i++;                            @grow
			            swap(a, i, j);                  @swap
			        }
			    }
			    swap(a, i + 1, hi);                     @place
			    return i + 1;                           @result
			}`,
		python: String.raw`
			def partition(a, lo, hi):               $lo $hi
			    pivot = a[hi]                           @pivot $pivot
			    i = lo - 1                              @init $i
			    for j in range(lo, hi):                 @loop $j
			        if a[j] < pivot:                    @compare
			            i += 1                          @grow
			            a[i], a[j] = a[j], a[i]         @swap
			    a[i + 1], a[hi] = a[hi], a[i + 1]       @place
			    return i + 1                            @result`,
	},
	quicksort: {
		c: String.raw`
			void quicksort(int a[], int lo, int hi) {    $lo $hi
			    if (lo < hi) {                           @base
			        int p = partition(a, lo, hi);        @partition
			        quicksort(a, lo, p - 1);             @sort-left
			        quicksort(a, p + 1, hi);             @sort-right
			    }
			}
			${C_PARTITION}`,
		java: String.raw`
			void quicksort(int[] a, int lo, int hi) {   $lo $hi
			    if (lo < hi) {                          @base
			        int p = partition(a, lo, hi);       @partition
			        quicksort(a, lo, p - 1);            @sort-left
			        quicksort(a, p + 1, hi);            @sort-right
			    }
			}
			${JAVA_PARTITION}`,
		python: String.raw`
			def quicksort(a, lo, hi):               $lo $hi
			    if lo < hi:                             @base
			        p = partition(a, lo, hi)            @partition
			        quicksort(a, lo, p - 1)             @sort-left
			        quicksort(a, p + 1, hi)             @sort-right
			${PYTHON_PARTITION}`,
	},
	// Lecture 10's improvements, one at a time.
	'quicksort-random': {
		c: String.raw`
			void quicksort(int a[], int lo, int hi) {       $lo $hi
			    if (lo < hi) {                              @base
			        int k = lo + rand() % (hi - lo + 1);    @pick $k
			        swap(&a[k], &a[hi]);                    @toend
			        int p = partition(a, lo, hi);           @partition
			        quicksort(a, lo, p - 1);
			        quicksort(a, p + 1, hi);
			    }
			}
			${C_PARTITION}`,
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
		c: String.raw`
			void quicksort(int a[], int lo, int hi) {                   $lo $hi
			    if (lo < hi) {                                          @base
			        if (hi - lo >= 2) { // three values or more
			            int m = medianOf3(a, lo, (lo + hi) / 2, hi);    @median $mid $m
			            swap(&a[m], &a[hi]);                            @tohi
			        }
			        int p = partition(a, lo, hi);                       @partition
			        quicksort(a, lo, p - 1);
			        quicksort(a, p + 1, hi);
			    }
			}

			// The index of the middle value of a[i], a[j] and a[k].
			int medianOf3(int a[], int i, int j, int k) {
			    if (a[i] < a[j]) {
			        if (a[j] < a[k]) return j;
			        return a[i] < a[k] ? k : i;
			    }
			    if (a[i] < a[k]) return i;
			    return a[j] < a[k] ? k : j;
			}
			${C_PARTITION}`,
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
		c: String.raw`
			void quicksort(int a[], int lo, int hi) {                $lo $hi
			    if (lo >= hi) return;                                @base
			    int pivot = a[hi];                                   @pivot $pivot
			    int lt = lo, i = lo, gt = hi;                        $lt $i $gt
			    while (i <= gt) {
			        if (a[i] < pivot) swap(&a[lt++], &a[i++]);       @less @less-swap
			        else if (a[i] > pivot) swap(&a[i], &a[gt--]);    @more @more-swap
			        else i++;                                        @equal
			    }
			    quicksort(a, lo, lt - 1);                            @split
			    quicksort(a, gt + 1, hi);
			}`,
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
		c: String.raw`
			// Then a[lo..lt-1] < pivot, a[lt..gt] == pivot, a[gt+1..hi] > pivot.
			void partition3(int a[], int lo, int hi, int *lt_out, int *gt_out) {
			    int pivot = a[hi];                                   @pivot $pivot
			    int lt = lo, i = lo, gt = hi;                        $lt $i $gt
			    while (i <= gt) {
			        if (a[i] < pivot) swap(&a[lt++], &a[i++]);       @less @less-swap
			        else if (a[i] > pivot) swap(&a[i], &a[gt--]);    @more @more-swap
			        else i++;                                        @equal
			    }
			    *lt_out = lt; *gt_out = gt;                          @split
			}`,
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
		c: String.raw`
			void quicksort(int a[], int lo, int hi) {                  $lo $hi
			    if (hi - lo + 1 <= CUTOFF) {                           @small $CUTOFF
			        insertionSort(a, lo, hi);
			        return;
			    }
			    int p = partition(a, lo, hi);                          @partition
			    quicksort(a, lo, p - 1);
			    quicksort(a, p + 1, hi);
			}

			void insertionSort(int a[], int lo, int hi) {
			    for (int i = lo + 1; i <= hi; i++)                     $i
			        for (int j = i; j > lo && a[j - 1] > a[j]; j--)    @is-compare $j
			            swap(&a[j], &a[j - 1]);                        @is-swap
			}
			${C_PARTITION}`,
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
		c: String.raw`
			int hoarePartition(int a[], int lo, int hi) {
			    int pivot = a[lo];                   @pivot $pivot
			    int i = lo - 1, j = hi + 1;          @init
			    while (true) {                       @round
			        do i++; while (a[i] < pivot);    @left $i
			        do j--; while (a[j] > pivot);    @right $j
			        if (i >= j)                      @crossed
			            return j;                    @done
			        swap(&a[i], &a[j]);              @swap
			    }
			}`,
		java: String.raw`
			int hoarePartition(int[] a, int lo, int hi) {
			    int pivot = a[lo];                      @pivot $pivot
			    int i = lo - 1, j = hi + 1;             @init
			    while (true) {                          @round
			        do i++; while (a[i] < pivot);       @left $i
			        do j--; while (a[j] > pivot);       @right $j
			        if (i >= j)                         @crossed
			            return j;                       @done
			        swap(a, i, j);                      @swap
			    }
			}`,
		python: String.raw`
			def hoare_partition(a, lo, hi):
			    pivot = a[lo]                           @pivot $pivot
			    i, j = lo - 1, hi + 1                   @init
			    while True:                             @round
			        i += 1                              @step-i
			        while a[i] < pivot:                 @left $i
			            i += 1                          @more-i
			        j -= 1                              @step-j
			        while a[j] > pivot:                 @right $j
			            j -= 1                          @more-j
			        if i >= j:                          @crossed
			            return j                        @done
			        a[i], a[j] = a[j], a[i]             @swap`,
	},
	// Counting sort (CLRS's, stable): count, prefix sums, place from the right, copy back. Values 0..k.
	'counting-sort': {
		c: String.raw`
			void countingSort(int a[], int n, int k) {        $k
			    int *count = calloc(k + 1, sizeof(int));      @alloc
			    for (int i = 0; i < n; i++)                   $i
			        count[a[i]]++;                            @count
			    for (int v = 1; v <= k; v++)                  $v
			        count[v] += count[v - 1];                 @prefix
			    int *out = malloc(n * sizeof(int));           @out
			    for (int i = n - 1; i >= 0; i--)
			        out[--count[a[i]]] = a[i];                @place
			    for (int i = 0; i < n; i++)
			        a[i] = out[i];                            @copy
			    free(count);
			    free(out);
			}`,
		java: String.raw`
			void countingSort(int[] a, int k) {              $k
			    int[] count = new int[k + 1];                @alloc
			    for (int i = 0; i < a.length; i++)           $i
			        count[a[i]]++;                           @count
			    for (int v = 1; v <= k; v++)                 $v
			        count[v] += count[v - 1];                @prefix
			    int[] out = new int[a.length];               @out
			    for (int i = a.length - 1; i >= 0; i--)
			        out[--count[a[i]]] = a[i];               @place
			    for (int i = 0; i < a.length; i++)
			        a[i] = out[i];                           @copy
			}`,
		python: String.raw`
			def counting_sort(a, k):                    $k
			    count = [0] * (k + 1)                   @alloc
			    for i in range(len(a)):                 $i
			        count[a[i]] += 1                    @count
			    for v in range(1, k + 1):               $v
			        count[v] += count[v - 1]            @prefix
			    out = [None] * len(a)                   @out
			    for i in range(len(a) - 1, -1, -1):
			        count[a[i]] -= 1
			        out[count[a[i]]] = a[i]             @place
			    a[:] = out                              @copy`,
	},
	'merge-sort': {
		c: String.raw`
			void mergeSort(int a[], int lo, int hi) {          $lo $hi
			    if (lo == hi)                                  @base
			        return;                                    @leaf
			    int mid = (lo + hi) / 2;                       @split $mid
			    mergeSort(a, lo, mid);                         @sort-left
			    mergeSort(a, mid + 1, hi);                     @sort-right
			    merge(a, lo, mid, hi);                         @merge
			}

			void merge(int a[], int lo, int mid, int hi) {
			    int merged[hi - lo + 1];                       @alloc
			    int i = lo, j = mid + 1, k = 0;                @start
			    while (i <= mid && j <= hi) {                  @loop $i $j $k
			        if (a[i] <= a[j])                          @compare
			            merged[k++] = a[i++];                  @left
			        else
			            merged[k++] = a[j++];                  @right
			    }
			    while (i <= mid)                               @rest-left-loop
			        merged[k++] = a[i++];                      @rest-left
			    while (j <= hi)                                @rest-right-loop
			        merged[k++] = a[j++];                      @rest-right
			    for (k = 0; k < hi - lo + 1; k++)              @copy-loop
			        a[lo + k] = merged[k];                     @copy
			}`,
		java: String.raw`
			void mergeSort(int[] a, int lo, int hi) {               $lo $hi
			    if (lo == hi)                                       @base
			        return;                                         @leaf
			    int mid = (lo + hi) / 2;                            @split $mid
			    mergeSort(a, lo, mid);                              @sort-left
			    mergeSort(a, mid + 1, hi);                          @sort-right
			    merge(a, lo, mid, hi);                              @merge
			}

			void merge(int[] a, int lo, int mid, int hi) {
			    int[] merged = new int[hi - lo + 1];                @alloc
			    int i = lo, j = mid + 1, k = 0;                     @start
			    while (i <= mid && j <= hi) {                       @loop $i $j $k
			        if (a[i] <= a[j])                               @compare
			            merged[k++] = a[i++];                       @left
			        else
			            merged[k++] = a[j++];                       @right
			    }
			    while (i <= mid)                                    @rest-left-loop
			        merged[k++] = a[i++];                           @rest-left
			    while (j <= hi)                                     @rest-right-loop
			        merged[k++] = a[j++];                           @rest-right
			    for (k = 0; k < merged.length; k++)                 @copy-loop
			        a[lo + k] = merged[k];                          @copy
			}`,
		python: String.raw`
			def merge_sort(a, lo, hi):              $lo $hi
			    if lo == hi:                            @base
			        return                              @leaf
			    mid = (lo + hi) // 2                    @split $mid
			    merge_sort(a, lo, mid)                  @sort-left
			    merge_sort(a, mid + 1, hi)              @sort-right
			    merge(a, lo, mid, hi)                   @merge

			def merge(a, lo, mid, hi):
			    merged = []                             @alloc
			    i, j = lo, mid + 1                      @start
			    while i <= mid and j <= hi:             @loop $i $j
			        if a[i] <= a[j]:                    @compare
			            merged.append(a[i])             @left
			            i += 1                          @next-i
			        else:
			            merged.append(a[j])             @right
			            j += 1                          @next-j
			    while i <= mid:                         @rest-left-loop
			        merged.append(a[i])                 @rest-left
			        i += 1                              @rest-next-i
			    while j <= hi:                          @rest-right-loop
			        merged.append(a[j])                 @rest-right
			        j += 1                              @rest-next-j
			    for k in range(len(merged)):            @copy-loop
			        a[lo + k] = merged[k]               @copy`,
	},
	// Two sorted arrays merged into a new one (dds-55z.20.10): merge sort's merge, without the halves.
	'merge-arrays': {
		c: String.raw`
			int *merge(int a[], int n, int b[], int m) {
			    int *c = malloc((n + m) * sizeof(int));        @alloc
			    int i = 0, j = 0, k = 0;                       @start
			    while (i < n && j < m) {                       @loop $i $j $k
			        if (a[i] <= b[j])                          @compare
			            c[k++] = a[i++];                       @left
			        else
			            c[k++] = b[j++];                       @right
			    }
			    while (i < n)                                  @rest-left-loop
			        c[k++] = a[i++];                           @rest-left
			    while (j < m)                                  @rest-right-loop
			        c[k++] = b[j++];                           @rest-right
			    return c;                                      @return
			}`,
		java: String.raw`
			int[] merge(int[] a, int[] b) {
			    int[] c = new int[a.length + b.length];             @alloc
			    int i = 0, j = 0, k = 0;                            @start
			    while (i < a.length && j < b.length) {              @loop $i $j $k
			        if (a[i] <= b[j])                               @compare
			            c[k++] = a[i++];                            @left
			        else
			            c[k++] = b[j++];                            @right
			    }
			    while (i < a.length)                                @rest-left-loop
			        c[k++] = a[i++];                                @rest-left
			    while (j < b.length)                                @rest-right-loop
			        c[k++] = b[j++];                                @rest-right
			    return c;                                           @return
			}`,
		python: String.raw`
			def merge(a, b):
			    c = []                                  @alloc
			    i, j = 0, 0                             @start
			    while i < len(a) and j < len(b):        @loop $i $j
			        if a[i] <= b[j]:                    @compare
			            c.append(a[i])                  @left
			            i += 1                          @next-i
			        else:
			            c.append(b[j])                  @right
			            j += 1                          @next-j
			    while i < len(a):                       @rest-left-loop
			        c.append(a[i])                      @rest-left
			        i += 1                              @rest-next-i
			    while j < len(b):                       @rest-right-loop
			        c.append(b[j])                      @rest-right
			        j += 1                              @rest-next-j
			    return c                                @return`,
	},
}
