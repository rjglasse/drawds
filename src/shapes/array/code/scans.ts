import type { CodeSource } from '../../code/algorithms'

// Lectures 2-4's scans: the sum with its invariant, the largest, all unique? (every pair, a set, sorting first). Part of ARRAY_CODE (../code.ts).

export const SCAN_CODE: Record<string, CodeSource> = {
	'sum-invariant': {
		c: String.raw`
			int sum(int nums[], int n) {
			    int total = nums[0];     @init $total
			    int i = 1;
			    while (i < n) {          $i
			        total += nums[i];    @add
			        i++;
			        // total == nums[0] + ... + nums[i - 1]
			    }
			    return total;            @done
			}`,
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
		c: String.raw`
			int maxElement(int a[], int n) {
			    int maxval = a[0];               @init $maxval
			    for (int i = 1; i < n; i++) {    @loop $i
			        if (a[i] > maxval) {         @compare
			            maxval = a[i];           @update
			        }
			    }
			    return maxval;                   @done
			}`,
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
		c: String.raw`
			bool uniqueElements(int a[], int n) {
			    for (int i = 0; i < n - 1; i++) {        @outer $i
			        for (int j = i + 1; j < n; j++) {    @inner $j
			            if (a[i] == a[j]) {              @compare
			                return false;                @repeat
			            }
			        }
			    }
			    return true;                             @unique
			}`,
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
	// Lecture 3's faster ways: a set (as it writes it, every value added, then one comparison), and
	// sorting a copy, then comparing neighbours. C has no set of its own: a small library's, as a
	// slide would assume one.
	'all-unique-set': {
		c: String.raw`
			bool uniqueBySet(int a[], int n) {
			    Set *seen = newSet();                @init
			    for (int i = 0; i < n; i++) {        @loop $i
			        setAdd(seen, a[i]);              @add
			    }
			    return setSize(seen) == n;           @compare
			}`,
		java: String.raw`
			boolean uniqueBySet(int[] a) {
			    Set<Integer> seen = new HashSet<>();        @init
			    for (int i = 0; i < a.length; i++) {        @loop $i
			        seen.add(a[i]);                         @add
			    }
			    return seen.size() == a.length;             @compare
			}`,
		python: String.raw`
			def unique_by_set(a):
			    seen = set()                        @init
			    for x in a:                         @loop $x
			        seen.add(x)                     @add
			    return len(seen) == len(a)          @compare`,
	},
	'all-unique-sorted': {
		c: String.raw`
			bool uniqueBySorting(int a[], int n) {
			    int b[n];
			    memcpy(b, a, n * sizeof(int));           @copy
			    qsort(b, n, sizeof(int), compare);       @sort
			    for (int i = 1; i < n; i++) {            @loop $i
			        if (b[i] == b[i - 1]) {              @compare
			            return false;                    @repeat
			        }
			    }
			    return true;                             @unique
			}`,
		java: String.raw`
			boolean uniqueBySorting(int[] a) {
			    int[] b = Arrays.copyOf(a, a.length);       @copy
			    Arrays.sort(b);                             @sort
			    for (int i = 1; i < b.length; i++) {        @loop $i
			        if (b[i] == b[i - 1]) {                 @compare
			            return false;                       @repeat
			        }
			    }
			    return true;                                @unique
			}`,
		python: String.raw`
			def unique_by_sorting(a):
			    b = list(a)                         @copy
			    b.sort()                            @sort
			    for i in range(1, len(b)):          @loop $i
			        if b[i] == b[i - 1]:            @compare
			            return False                @repeat
			    return True                         @unique`,
	},
}
