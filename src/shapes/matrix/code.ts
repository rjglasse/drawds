import type { CodeSource } from '../code/algorithms'

// The matrices' code, as a code box beside the matrix shows it while one plays (see
// `src/shapes/code/algorithms.ts`): a 2D array a[i][j], i the row, j the column (C passes its
// sizes, a[rows][cols]). The traversals visit each cell in turn, row by row or column by column;
// transpose swaps each cell above the diagonal with its mirror; staircase search starts top-right.

export const MATRIX_CODE: Record<string, CodeSource> = {
	'matrix-row-major': {
		c: String.raw`
			void rowMajor(int rows, int cols, int a[rows][cols]) {
			    for (int i = 0; i < rows; i++)                  $i
			        for (int j = 0; j < cols; j++)              $j
			            visit(a[i][j]);                         @visit
			}`,
		java: String.raw`
			void rowMajor(int[][] a) {
			    for (int i = 0; i < a.length; i++)              $i
			        for (int j = 0; j < a[i].length; j++)       $j
			            visit(a[i][j]);                         @visit
			}`,
		python: String.raw`
			def row_major(a):
			    for i in range(len(a)):                 $i
			        for j in range(len(a[i])):          $j
			            visit(a[i][j])                  @visit`,
	},
	'matrix-col-major': {
		c: String.raw`
			void columnMajor(int rows, int cols, int a[rows][cols]) {
			    for (int j = 0; j < cols; j++)                  $j
			        for (int i = 0; i < rows; i++)              $i
			            visit(a[i][j]);                         @visit
			}`,
		java: String.raw`
			void columnMajor(int[][] a) {
			    for (int j = 0; j < a[0].length; j++)           $j
			        for (int i = 0; i < a.length; i++)          $i
			            visit(a[i][j]);                         @visit
			}`,
		python: String.raw`
			def column_major(a):
			    for j in range(len(a[0])):              $j
			        for i in range(len(a)):             $i
			            visit(a[i][j])                  @visit`,
	},
	'matrix-transpose': {
		c: String.raw`
			void transpose(int n, int a[n][n]) {
			    for (int i = 0; i < n; i++)                     $i
			        for (int j = i + 1; j < n; j++) {           @upper $j
			            int t = a[i][j];                        @swap
			            a[i][j] = a[j][i];
			            a[j][i] = t;
			        }
			}`,
		java: String.raw`
			void transpose(int[][] a) {
			    int n = a.length;
			    for (int i = 0; i < n; i++)                     $i
			        for (int j = i + 1; j < n; j++) {           @upper $j
			            int t = a[i][j];                        @swap
			            a[i][j] = a[j][i];
			            a[j][i] = t;
			        }
			}`,
		python: String.raw`
			def transpose(a):
			    n = len(a)
			    for i in range(n):                              $i
			        for j in range(i + 1, n):                   @upper $j
			            a[i][j], a[j][i] = a[j][i], a[i][j]     @swap`,
	},
	'matrix-staircase': {
		c: String.raw`
			bool staircase(int rows, int cols, int a[rows][cols], int key) {    $key
			    int i = 0, j = cols - 1;
			    while (i < rows && j >= 0) {                    $i $j
			        if (a[i][j] == key) return true;            @found
			        if (a[i][j] > key) j--;                     @left
			        else i++;                                   @down
			    }
			    return false;                                   @missing
			}`,
		java: String.raw`
			boolean staircase(int[][] a, int key) {             $key
			    int i = 0, j = a[0].length - 1;
			    while (i < a.length && j >= 0) {                $i $j
			        if (a[i][j] == key) return true;            @found
			        if (a[i][j] > key) j--;                     @left
			        else i++;                                   @down
			    }
			    return false;                                   @missing
			}`,
		python: String.raw`
			def staircase(a, key):                      $key
			    i, j = 0, len(a[0]) - 1
			    while i < len(a) and j >= 0:            $i $j
			        if a[i][j] == key:                  @found
			            return True
			        if a[i][j] > key:                   @left
			            j -= 1
			        else:                               @down
			            i += 1
			    return False                            @missing`,
	},
}
