import type { CodeSource } from '../code/algorithms'
import { SEARCH_CODE } from './code/searches'
import { SCAN_CODE } from './code/scans'
import { SORT_CODE } from './code/sorts'
import { SHUFFLE_CODE } from './code/shuffles'
import { STACK_QUEUE_CODE } from './code/stacks'
import { SHIFT_CODE } from './code/shifting'

// The array algorithms' code, as a code box beside the array shows it while one plays (see
// `src/shapes/code/algorithms.ts`). The @tags at the ends of lines are the `line`s the steps in
// `operations.ts` and `scans.ts` name, so a line reads as what its step shows; the $tags the
// variables shown there (the steps' pointers, or what they `let`). Insertion sort is lecture 3's, the
// shuffles lecture 2's (its names: numbers, the random index n).
// Each family's code is in code/: searches, scans, sorts, shuffles, stacks (and queues), shifting.

export const ARRAY_CODE: Record<string, CodeSource> = {
	...SEARCH_CODE,
	...SCAN_CODE,
	...SORT_CODE,
	...SHUFFLE_CODE,
	...STACK_QUEUE_CODE,
	...SHIFT_CODE,
}
