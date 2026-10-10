import type { CodeSource } from '../code/algorithms'

// The array algorithms' code, as a code box beside the array shows it while one plays (see
// `src/shapes/code/algorithms.ts`). The tags at the ends of lines are the `line`s the steps in
// `operations.ts` and `scans.ts` name, so a line reads as what its step shows.

export const ARRAY_CODE: Record<string, CodeSource> = {
	'linear-search': {
		java: String.raw`
			int linearSearch(int[] a, int key) {
			    for (int i = 0; i < a.length; i++) {
			        if (a[i] == key) {              @compare
			            return i;                   @found
			        }
			    }
			    return -1;                          @missing
			}`,
		python: String.raw`
			def linear_search(a, key):
			    for i in range(len(a)):
			        if a[i] == key:                 @compare
			            return i                    @found
			    return -1                           @missing`,
	},
	'binary-search': {
		java: String.raw`
			int binarySearch(int[] a, int key) {
			    int lo = 0, hi = a.length - 1;            @init
			    while (lo <= hi) {
			        int mid = (lo + hi) / 2;              @mid
			        if (a[mid] == key) return mid;        @found
			        else if (a[mid] < key) lo = mid + 1;  @right
			        else hi = mid - 1;                    @left
			    }
			    return -1;                                @missing
			}`,
		python: String.raw`
			def binary_search(a, key):
			    lo, hi = 0, len(a) - 1              @init
			    while lo <= hi:
			        mid = (lo + hi) // 2            @mid
			        if a[mid] == key:
			            return mid                  @found
			        elif a[mid] < key:
			            lo = mid + 1                @right
			        else:
			            hi = mid - 1                @left
			    return -1                           @missing`,
	},
	'sentinel-search': {
		java: String.raw`
			int sentinelSearch(int[] a, int n, int key) {
			    a[n] = key; // past the end: the sentinel   @sentinel
			    int i = 0;
			    while (a[i] != key) {                       @compare
			        i++;
			    }
			    if (i < n) return i;                        @found
			    return -1;                                  @missing
			}`,
		python: String.raw`
			def sentinel_search(a, key):
			    n = len(a)
			    a.append(key)  # the sentinel       @sentinel
			    i = 0
			    while a[i] != key:                  @compare
			        i += 1
			    a.pop()
			    return i if i < n else -1           @found @missing`,
	},
	'find-max': {
		java: String.raw`
			int maxElement(int[] a) {
			    int maxval = a[0];                      @init
			    for (int i = 1; i < a.length; i++) {
			        if (a[i] > maxval) {                @compare
			            maxval = a[i];                  @update
			        }
			    }
			    return maxval;                          @done
			}`,
		python: String.raw`
			def max_element(a):
			    maxval = a[0]                       @init
			    for i in range(1, len(a)):
			        if a[i] > maxval:               @compare
			            maxval = a[i]               @update
			    return maxval                       @done`,
	},
	'all-unique': {
		java: String.raw`
			boolean uniqueElements(int[] a) {
			    for (int i = 0; i < a.length - 1; i++) {
			        for (int j = i + 1; j < a.length; j++) {
			            if (a[i] == a[j]) {                 @compare
			                return false;                   @repeat
			            }
			        }
			    }
			    return true;                                @unique
			}`,
		python: String.raw`
			def unique_elements(a):
			    n = len(a)
			    for i in range(n - 1):
			        for j in range(i + 1, n):
			            if a[i] == a[j]:            @compare
			                return False            @repeat
			    return True                         @unique`,
	},
	'insertion-sort': {
		java: String.raw`
			void insertionSort(int[] a) {
			    for (int i = 1; i < a.length; i++) {        @outer
			        int j = i;
			        while (j > 0 && a[j - 1] > a[j]) {      @compare
			            swap(a, j - 1, j);                  @swap
			            j--;
			        }
			    }
			}`,
		python: String.raw`
			def insertion_sort(a):
			    for i in range(1, len(a)):                  @outer
			        j = i
			        while j > 0 and a[j - 1] > a[j]:        @compare
			            a[j - 1], a[j] = a[j], a[j - 1]     @swap
			            j -= 1`,
	},
	'selection-sort': {
		java: String.raw`
			void selectionSort(int[] a) {
			    for (int i = 0; i < a.length - 1; i++) {
			        int min = i;                                @init
			        for (int j = i + 1; j < a.length; j++) {
			            if (a[j] < a[min]) {                    @compare
			                min = j;                            @update
			            }
			        }
			        if (min != i) swap(a, i, min);              @swap @noswap
			    }
			}`,
		python: String.raw`
			def selection_sort(a):
			    n = len(a)
			    for i in range(n - 1):
			        min_idx = i                                     @init
			        for j in range(i + 1, n):
			            if a[j] < a[min_idx]:                       @compare
			                min_idx = j                             @update
			        if min_idx != i:                                @noswap
			            a[i], a[min_idx] = a[min_idx], a[i]         @swap`,
	},
	'bubble-sort': {
		java: String.raw`
			void bubbleSort(int[] a) {
			    for (int pass = 1; pass < a.length; pass++) {
			        boolean swapped = false;
			        for (int j = 0; j < a.length - pass; j++) {
			            if (a[j] > a[j + 1]) {              @compare
			                swap(a, j, j + 1);              @swap
			                swapped = true;
			            }
			        }
			        if (!swapped) break;                    @pass @sorted
			    }
			}`,
		python: String.raw`
			def bubble_sort(a):
			    n = len(a)
			    for p in range(1, n):
			        swapped = False
			        for j in range(n - p):
			            if a[j] > a[j + 1]:                     @compare
			                a[j], a[j + 1] = a[j + 1], a[j]     @swap
			                swapped = True
			        if not swapped:                             @pass
			            break                                   @sorted`,
	},
	partition: {
		java: String.raw`
			int partition(int[] a, int lo, int hi) {
			    int pivot = a[hi];                      @pivot
			    int i = lo - 1;
			    for (int j = lo; j < hi; j++) {
			        if (a[j] < pivot) {                 @compare
			            i++;
			            swap(a, i, j);                  @swap
			        }
			    }
			    swap(a, i + 1, hi);                     @place
			    return i + 1;
			}`,
		python: String.raw`
			def partition(a, lo, hi):
			    pivot = a[hi]                           @pivot
			    i = lo - 1
			    for j in range(lo, hi):
			        if a[j] < pivot:                    @compare
			            i += 1
			            a[i], a[j] = a[j], a[i]         @swap
			    a[i + 1], a[hi] = a[hi], a[i + 1]       @place
			    return i + 1`,
	},
	quicksort: {
		java: String.raw`
			void quicksort(int[] a, int lo, int hi) {
			    if (lo < hi) {                          @base
			        int p = partition(a, lo, hi);       @partition
			        quicksort(a, lo, p - 1);
			        quicksort(a, p + 1, hi);
			    }
			}

			int partition(int[] a, int lo, int hi) {
			    int pivot = a[hi];                      @pivot
			    int i = lo - 1;
			    for (int j = lo; j < hi; j++) {
			        if (a[j] < pivot) {                 @compare
			            i++;
			            swap(a, i, j);                  @swap
			        }
			    }
			    swap(a, i + 1, hi);                     @place
			    return i + 1;
			}`,
		python: String.raw`
			def quicksort(a, lo, hi):
			    if lo < hi:                             @base
			        p = partition(a, lo, hi)            @partition
			        quicksort(a, lo, p - 1)
			        quicksort(a, p + 1, hi)

			def partition(a, lo, hi):
			    pivot = a[hi]                           @pivot
			    i = lo - 1
			    for j in range(lo, hi):
			        if a[j] < pivot:                    @compare
			            i += 1
			            a[i], a[j] = a[j], a[i]         @swap
			    a[i + 1], a[hi] = a[hi], a[i + 1]       @place
			    return i + 1`,
	},
	'hoare-partition': {
		java: String.raw`
			int hoarePartition(int[] a, int lo, int hi) {
			    int pivot = a[lo];                      @pivot
			    int i = lo - 1, j = hi + 1;
			    while (true) {
			        do i++; while (a[i] < pivot);       @left
			        do j--; while (a[j] > pivot);       @right
			        if (i >= j) return j;               @crossed
			        swap(a, i, j);                      @swap
			    }
			}`,
		python: String.raw`
			def hoare_partition(a, lo, hi):
			    pivot = a[lo]                           @pivot
			    i, j = lo - 1, hi + 1
			    while True:
			        i += 1
			        while a[i] < pivot:                 @left
			            i += 1
			        j -= 1
			        while a[j] > pivot:                 @right
			            j -= 1
			        if i >= j:                          @crossed
			            return j
			        a[i], a[j] = a[j], a[i]             @swap`,
	},
	'merge-sort': {
		java: String.raw`
			void mergeSort(int[] a, int lo, int hi) {
			    if (lo == hi) return;                               @base
			    int mid = (lo + hi) / 2;                            @split
			    mergeSort(a, lo, mid);
			    mergeSort(a, mid + 1, hi);
			    merge(a, lo, mid, hi);                              @merge
			}

			void merge(int[] a, int lo, int mid, int hi) {
			    int[] merged = new int[hi - lo + 1];
			    int i = lo, j = mid + 1, k = 0;
			    while (i <= mid && j <= hi) {
			        if (a[i] <= a[j]) merged[k++] = a[i++];         @left
			        else merged[k++] = a[j++];                      @right
			    }
			    while (i <= mid) merged[k++] = a[i++];              @rest-left
			    while (j <= hi) merged[k++] = a[j++];               @rest-right
			    for (k = 0; k < merged.length; k++) a[lo + k] = merged[k];  @copy
			}`,
		python: String.raw`
			def merge_sort(a, lo, hi):
			    if lo == hi:                            @base
			        return
			    mid = (lo + hi) // 2                    @split
			    merge_sort(a, lo, mid)
			    merge_sort(a, mid + 1, hi)
			    merge(a, lo, mid, hi)                   @merge

			def merge(a, lo, mid, hi):
			    merged = []
			    i, j = lo, mid + 1
			    while i <= mid and j <= hi:
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
}
