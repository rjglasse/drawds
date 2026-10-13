import type { CodeSource } from '../../code/algorithms'

// Inserting and deleting by shifting, growing or with a fixed capacity. Part of ARRAY_CODE (../code.ts).

export const SHIFT_CODE: Record<string, CodeSource> = {
	// Insert by shifting, the array growing by one cell (as a Python list does).
	'array-insert': {
		c: String.raw`
			int *insert(int *a, int n, int k, int value) {    $k $value
			    a = realloc(a, (n + 1) * sizeof(int));        @grow
			    for (int i = n; i > k; i--)                   $i
			        a[i] = a[i - 1];                          @shift
			    a[k] = value;                                 @place
			    return a;
			}`,
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
		c: String.raw`
			int *delete(int *a, int n, int k) {           $k
			    for (int i = k; i < n - 1; i++)           @start $i
			        a[i] = a[i + 1];                      @shift
			    a = realloc(a, (n - 1) * sizeof(int));    @shrink
			    return a;
			}`,
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
		c: String.raw`
			void insert(Array *arr, int k, int value) {                                    $k $value
			    if (arr->size == arr->capacity) { fprintf(stderr, "full\n"); exit(1); }    @full
			    for (int i = arr->size; i > k; i--)                                        @start $i
			        arr->a[i] = arr->a[i - 1];                                             @shift
			    arr->a[k] = value;                                                         @place
			    arr->size++;
			}`,
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
		c: String.raw`
			void delete(Array *arr, int k) {               $k
			    for (int i = k; i < arr->size - 1; i++)    @start $i
			        arr->a[i] = arr->a[i + 1];             @shift
			    arr->size--;                               @shrink
			}`,
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
}
