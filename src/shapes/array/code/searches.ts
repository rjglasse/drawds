import type { CodeSource } from '../../code/algorithms'

// Searches: linear, binary (and recursive), the sentinel search. Part of ARRAY_CODE (../code.ts).

export const SEARCH_CODE: Record<string, CodeSource> = {
	'linear-search': {
		c: String.raw`
			int linearSearch(int a[], int n, int key) {    $key
			    for (int i = 0; i < n; i++) {              @loop $i
			        if (a[i] == key) {                     @compare
			            return i;                          @found
			        }
			    }
			    return -1;                                 @missing
			}`,
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
		c: String.raw`
			int binarySearch(int a[], int n, int key) {     $key
			    int lo = 0, hi = n - 1;                     @init $lo $hi
			    while (lo <= hi) {                          @loop
			        int mid = (lo + hi) / 2;                @mid $mid
			        if (a[mid] == key)                      @compare
			            return mid;                         @found
			        else if (a[mid] < key)                  @less
			            lo = mid + 1;                       @right
			        else
			            hi = mid - 1;                       @left
			    }
			    return -1;                                  @missing
			}`,
		java: String.raw`
			int binarySearch(int[] a, int key) {      $key
			    int lo = 0, hi = a.length - 1;            @init $lo $hi
			    while (lo <= hi) {                        @loop
			        int mid = (lo + hi) / 2;              @mid $mid
			        if (a[mid] == key)                    @compare
			            return mid;                       @found
			        else if (a[mid] < key)                @less
			            lo = mid + 1;                     @right
			        else
			            hi = mid - 1;                     @left
			    }
			    return -1;                                @missing
			}`,
		python: String.raw`
			def binary_search(a, key):          $key
			    lo, hi = 0, len(a) - 1              @init $lo $hi
			    while lo <= hi:                     @loop
			        mid = (lo + hi) // 2            @mid $mid
			        if a[mid] == key:               @compare
			            return mid                  @found
			        elif a[mid] < key:              @less
			            lo = mid + 1                @right
			        else:
			            hi = mid - 1                @left
			    return -1                           @missing`,
	},
	'binary-search-recursive': {
		c: String.raw`
			int binarySearch(int a[], int key, int low, int high) {    $key $low $high
			    if (low > high)                                        @base
			        return -1;                                         @missing
			    int mid = (low + high) / 2;                            @mid $mid
			    if (a[mid] == key)                                     @compare
			        return mid;                                        @found
			    if (a[mid] < key)                                      @less
			        return binarySearch(a, key, mid + 1, high);        @right
			    else
			        return binarySearch(a, key, low, mid - 1);         @left
			}`,
		java: String.raw`
			int binarySearch(int[] a, int key, int low, int high) {     $key $low $high
			    if (low > high)                                         @base
			        return -1;                                          @missing
			    int mid = (low + high) / 2;                             @mid $mid
			    if (a[mid] == key)                                      @compare
			        return mid;                                         @found
			    if (a[mid] < key)                                       @less
			        return binarySearch(a, key, mid + 1, high);         @right
			    else
			        return binarySearch(a, key, low, mid - 1);          @left
			}`,
		python: String.raw`
			def binary_search(a, key, low, high):          $key $low $high
			    if low > high:                              @base
			        return -1                               @missing
			    mid = (low + high) // 2                     @mid $mid
			    if a[mid] == key:                           @compare
			        return mid                              @found
			    if a[mid] < key:                            @less
			        return binary_search(a, key, mid + 1, high)     @right
			    return binary_search(a, key, low, mid - 1)          @left`,
	},
	'sentinel-search': {
		c: String.raw`
			int sentinelSearch(int a[], int n, int key) {    $n $key
			    a[n] = key; // past the end: the sentinel    @sentinel
			    int i = 0;                                   @init
			    while (a[i] != key) {                        @compare $i
			        i++;                                     @next
			    }
			    if (i < n)                                   @check
			        return i;                                @found
			    return -1;                                   @missing
			}`,
		java: String.raw`
			int sentinelSearch(int[] a, int n, int key) {   $n $key
			    a[n] = key; // past the end: the sentinel   @sentinel
			    int i = 0;                                  @init
			    while (a[i] != key) {                       @compare $i
			        i++;                                    @next
			    }
			    if (i < n)                                  @check
			        return i;                               @found
			    return -1;                                  @missing
			}`,
		python: String.raw`
			def sentinel_search(a, key):        $key
			    n = len(a)                          @n $n
			    a.append(key)  # the sentinel       @sentinel
			    i = 0                               @init
			    while a[i] != key:                  @compare $i
			        i += 1                          @next
			    a.pop()                             @restore
			    if i < n:                           @check
			        return i                        @found
			    return -1                           @missing`,
	},
}
