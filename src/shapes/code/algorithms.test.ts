import { describe, expect, it } from 'vitest'
import type { Frame } from '../../nodelink/playback'
import {
	binarySearch,
	bubbleSort,
	deleteAt,
	deleteFixed,
	insertAt,
	insertFixed,
	hoarePartition,
	insertionSort,
	linearSearch,
	mergeSort,
	partitionArray,
	recursiveBinarySearch,
	selectionSort,
	sumWithInvariant,
	type ArrayState,
} from '../array/operations'
import { partition3Array, quicksort } from '../array/quicksorts'
import { allUnique, findMax, sentinelSearch } from '../array/scans'
import { fisherYates, unfairShuffle } from '../array/shuffles'
import { dequeue, enqueue, peekQueue, peekStack, pop, push } from '../array/stack-queue'
import { checkBrackets, evaluatePostfix } from '../array/stack-uses'
import { countingSort } from '../array/counting'
import {
	appendToList,
	deleteFromList,
	detectCycle,
	findInList,
	findMiddle,
	insertIntoList,
	insertSorted,
	printBackwards,
	printList,
	reverseList,
} from '../list/operations'
import { mergeSortList, mergeSortedLists } from '../list/merge'
import { bogosort, bozosort } from '../array/bogo'
import { mergeArrays } from '../array/merge'
import { dequeueFrom, enqueueOnto, peekAt, popFrom, pushOnto } from '../list/stack-queue'
import { countNodes } from '../list/size'
import { deleteKey, findKey, insertEntry, rehash, buildTable } from '../hash/hash'
import { heapCode } from '../heap/code'
import { connectedSteps, findSteps, unionSteps } from '../union-find/operations'
import { buildHeapSteps } from '../heap/heap'
import { insertSteps, removeSteps } from '../heap/steps'
import { measureTree } from '../tree/measure'
import { bstDeleteSteps, bstExtreme, bstInsertSteps, bstSearch } from '../tree/search'
import { bfs, dfs } from '../graph/traverse'
import { components } from '../graph/algorithms'
import { findCycle, shortestPath } from '../graph/paths'
import { traverseTree } from '../tree/traverse'
import { mulberry32 } from '../../data/random'
import { ALGORITHMS, algorithmCode, parseCode, shownValues, taggedLine } from './algorithms'
import { codeShapeMigrations } from './code-shape-types'

const array = (...values: (string | number)[]): ArrayState => ({ values: values.map(String), marks: {} })
const plainList = (values: string[]) => ({ nodes: values.map((value, i) => ({ id: `n${i}`, value, dx: 0, dy: 0 })), direction: 'right' as const, size: 'm' as const })
const treeNode = (id: string, value: string, children: (string | null)[] = [null, null]) => ({ id, value, children, dx: 0, dy: 0 })
// Two pieces: A-B-C in a triangle, D-E.
const graph = {
	nodes: ['A', 'B', 'C', 'D', 'E'].map((v, i) => ({ id: v.toLowerCase(), value: v, x: i, y: 0 })),
	edges: [['a', 'b'], ['b', 'c'], ['a', 'c'], ['d', 'e']].map(([from, to], i) => ({ id: `e${i}`, from, to, weight: '1' })),
}
// A BST: 40 (20 (10, 30 (25, -)), 50 (-, 60)). Every delete case: a leaf (10), one child (50, 30), two
// children with the successor deeper (20: 25, case 3.2) or the right child itself (40: 50, case 3.1).
const bst = [
	treeNode('a', '40', ['b', 'c']),
	treeNode('b', '20', ['d', 'e']),
	treeNode('c', '50', [null, 'g']),
	treeNode('d', '10'),
	treeNode('e', '30', ['f', null]),
	treeNode('f', '25'),
	treeNode('g', '60'),
]
// A, B and C, B with one child D: every kind of node.
const tree = [treeNode('a', 'A', ['b', 'c']), treeNode('b', 'B', ['d', null]), treeNode('c', 'C'), treeNode('d', 'D')]

describe('algorithm code', () => {
	it('takes the tags off the ends of lines and the indentation the first line has', () => {
		const code = parseCode(
			`
			def f(a):
			    @cache  # a decorator stays
			    x = a[0]              @init $x
			    return x  # done      @found @missing $min_idx=min $n`,
			'python'
		)
		expect(code.text).toBe('def f(a):\n    @cache  # a decorator stays\n    x = a[0]\n    return x  # done')
		expect(code.lines).toEqual({ init: 2, found: 3, missing: 3 })
		expect(code.values).toEqual([
			{ line: 2, name: 'x', key: 'x' },
			{ line: 3, name: 'min_idx', key: 'min' },
			{ line: 3, name: 'n', key: 'n' },
		])
		// In code edited since, values stay with their lines, or go with them.
		expect(shownValues(`# lecture 3\n${code.text}`, code).map((v) => v.line)).toEqual([3, 4, 4])
		expect(shownValues('def f(a):\n    return x  # done', code).map((v) => v.line)).toEqual([1, 1])
	})

	it('leaves no tag in the code (a tag needs two spaces before it)', () => {
		for (const id of Object.keys(ALGORITHMS)) {
			for (const language of ['c', 'java', 'python'] as const) {
				expect(algorithmCode(id, language)!.text, `${id} ${language}`).not.toMatch(/\s[@$][\w=-]+\s*$/m)
			}
		}
	})

	it('every algorithm is written in C, Java and Python; an algorithm without code has none', () => {
		for (const id of Object.keys(ALGORITHMS)) for (const language of ['c', 'java', 'python'] as const) expect(ALGORITHMS[id][language], `${id} ${language}`).toBeTruthy()
		expect(algorithmCode('bubble-sort', 'c')?.text).toMatch(/^void bubbleSort\(int a\[\], int n\) \{/)
		expect(algorithmCode('bubble-sort', 'python')?.text).toMatch(/^def bubble_sort\(a\):/)
		expect(algorithmCode('no-such-sort', 'java')).toBeUndefined()
	})

	it('finds a tagged line in code edited since, by what it says', () => {
		const sort = algorithmCode('bubble-sort', 'java')!
		const swap = sort.lines.swap
		expect(taggedLine(sort.text, sort, 'swap')).toBe(swap)
		// A comment added at the top: the swap is a line further down.
		expect(taggedLine(`// Lecture 3\n${sort.text}`, sort, 'swap')).toBe(swap + 1)
		expect(taggedLine('int x;', sort, 'swap')).toBeUndefined()
		expect(taggedLine(sort.text, sort, 'no-such-line')).toBeUndefined()
	})

	it('every line a step of an array operation names is in its code, in Java and Python', () => {
		const ops: { frames: Frame[]; code?: string }[] = [
			linearSearch(array(5, 7, 9), '9'),
			linearSearch(array(5, 7, 9), '4'),
			binarySearch(array(1, 3, 5, 7, 9, 11), '9'),
			binarySearch(array(1, 3, 5, 7, 9, 11), '2'),
			recursiveBinarySearch(array(1, 3, 5, 7, 9, 11), '9'),
			recursiveBinarySearch(array(1, 3, 5, 7, 9, 11), '2'),
			sumWithInvariant(array(4, 6, 5, 8)),
			sentinelSearch(array(5, 7, 9), '7'),
			sentinelSearch(array(5, 7, 9), '4'),
			findMax(array(3, 9, 2, 9, 5)),
			allUnique(array(4, 1, 3)),
			allUnique(array(1, 2, 1)),
			bogosort({ values: ['3', '1', '2'], marks: {} }, mulberry32(2), 5),
			bozosort({ values: ['3', '1', '2'], marks: {} }, mulberry32(2), 5),
			insertionSort(array(5, 2, 4, 1, 3)),
			selectionSort(array(5, 2, 4, 1, 3)),
			selectionSort(array(1, 2, 3)),
			bubbleSort(array(5, 2, 4, 1, 3)),
			bubbleSort(array(1, 2, 3)),
			partitionArray(array(7, 2, 9, 1, 5)),
			partitionArray(array(1, 2, 9)),
			quicksort(array(7, 2, 9, 1, 5, 3)),
			// Lecture 10's improvements.
			quicksort(array(7, 2, 9, 1, 5, 3), 'quicksort-random', { rng: mulberry32(2) }),
			quicksort(array(7, 2, 9, 1, 5, 3), 'quicksort-median'),
			quicksort(array(9, 4), 'quicksort-median'),
			quicksort(array(2, 0, 2, 1, 2, 0, 1), 'quicksort-3way'),
			partition3Array(array(2, 0, 2, 1, 2, 0, 1)),
			quicksort(array(7, 2, 9, 1, 5, 3, 8), 'quicksort-cutoff', { cutoff: 3 }),
			hoarePartition(array(5, 2, 9, 1, 7, 3)),
			mergeSort(array(7, 2, 9, 1, 5, 3)),
			countingSort(array(3, 0, 2, 3, 1, 0)),
			mergeArrays(array(1, 4, 7), ['2', '3', '9'], 'shape:b', { drop: 0, gap: 0 }),
			mergeArrays(array(5, 9), ['2'], 'shape:b', { drop: 0, gap: 0 }),
			unfairShuffle(array(7, 2, 9, 1), mulberry32(3)),
			fisherYates(array(7, 2, 9, 1), mulberry32(3)),
			// Insert and delete by shifting, growing and with a fixed capacity; lecture 6's ArrayQueue.
			insertAt(array(5, 7, 9), 1, '4'),
			deleteAt(array(5, 7, 9), 0),
			insertFixed(array(5, 7, 0, 0), 2, 1, '4'),
			insertFixed(array(5, 7), 2, 1, '4'),
			deleteFixed(array(5, 7, 9, 0), 3, 0),
			enqueue({ ...array(5, 7, 0), used: 2, front: 0, fixed: true }, '4'),
			enqueue({ ...array(5, 7), used: 2, front: 0, fixed: true }, '4'),
			dequeue({ ...array(5, 7, 0), used: 2, front: 0, fixed: true }),
			dequeue({ ...array(0, 0), used: 0, front: 0, fixed: true }),
			peekQueue({ ...array(5, 7, 0), used: 2, front: 0, fixed: true }),
			peekQueue({ ...array(0, 0), used: 0, front: 0, fixed: true }),
			// Lecture 6's ArrayStack: a fixed stack.
			push({ ...array(1, 2, 0), used: 2, fixed: true }, '7'),
			push({ ...array(1, 2), used: 2, fixed: true }, '7'),
			pop({ ...array(1, 2, 0), used: 2, fixed: true }),
			pop({ ...array(0, 0), used: 0, fixed: true }),
			peekStack({ ...array(1, 2, 0), used: 2, fixed: true }),
			peekStack({ ...array(0), used: 0, fixed: true }),
			// What a stack is for: balanced, a mismatch, an extra closer, openers left, an overflow; postfix
			// evaluated, too few and too many operands, a division by zero, an overflow.
			...[false, true].flatMap((fixed) =>
				['{[()()]}', '(]', '())', '((', '((((('].map((text) => checkBrackets({ ...array(0, 0, 0), used: 0, fixed }, text))
			),
			...[false, true].flatMap((fixed) =>
				['5 1 2 + 4 * + 3 -', '1 +', '1 2', '4 0 /', '1 2 3 4 + + +'].map((text) => evaluatePostfix({ ...array(0, 0, 0), used: 0, fixed }, text))
			),
			// Lecture 5's list, changed: plain singly linked, with a tail and without; the linked stack and queue.
			...[{}, { tail: 'tail' as const }].flatMap((variant) => {
				const props = { ...plainList(['7', '3', '9']), ...variant }
				const sorted = { ...plainList(['3', '7', '9']), ...variant }
				return [
					insertIntoList(props, 'n1', 'n9', '5'),
					insertIntoList(props, 'n2', 'n9', '5'),
					insertIntoList(props, undefined, 'n9', '5'),
					insertIntoList({ ...props, nodes: [] }, undefined, 'n9', '5'),
					appendToList(props, 'n9', '5'),
					deleteFromList(props, 'n0'),
					deleteFromList(props, 'n2'),
					deleteFromList({ ...props, nodes: props.nodes.slice(0, 1) }, 'n0'),
					reverseList(props),
					// The walks: the middle, insert in order (first, between, last), print, Floyd.
					findMiddle(props),
					findMiddle({ ...props, nodes: props.nodes.slice(0, 2) }),
					insertSorted(sorted, 'n9', '1'),
					insertSorted(sorted, 'n9', '5'),
					insertSorted(sorted, 'n9', '12'),
					printList(props),
					detectCycle(props),
					detectCycle({ ...props, cycleTo: 'n1' }),
					printBackwards({ ...props, links: 'doubly' as const }),
				]
			}),
			// Two sorted lists merged: a runs out first, b runs out first.
			mergeSortedLists(plainList(['1', '4']), plainList(['2', '3', '9']), { x: 0, y: 200 }, ['n7', 'n8', 'n9']),
			mergeSortedLists(plainList(['5', '9']), plainList(['2']), { x: 0, y: 200 }, ['n9']),
			mergeSortList(plainList(['7', '3', '9', '1', '6'])),
			pushOnto({ ...plainList(['7', '3']), kind: 'stack' }, 'n9', '5'),
			pushOnto({ ...plainList([]), kind: 'stack' }, 'n9', '5'),
			popFrom({ ...plainList(['7', '3']), kind: 'stack' }),
			popFrom({ ...plainList([]), kind: 'stack' }),
			peekAt({ ...plainList(['7']), kind: 'stack' }),
			peekAt({ ...plainList([]), kind: 'stack' }),
			enqueueOnto({ ...plainList(['7', '3']), kind: 'queue' }, 'n9', '5'),
			enqueueOnto({ ...plainList([]), kind: 'queue' }, 'n9', '5'),
			dequeueFrom({ ...plainList(['7', '3']), kind: 'queue' }),
			dequeueFrom({ ...plainList(['7']), kind: 'queue' }),
			dequeueFrom({ ...plainList([]), kind: 'queue' }),
			peekAt({ ...plainList(['7']), kind: 'queue' }),
			peekAt({ ...plainList([]), kind: 'queue' }),
			// Lecture 5's size, counted.
			countNodes({ nodes: ['7', '3'].map((value, i) => ({ id: `n${i}`, value, dx: 0, dy: 0 })), direction: 'right', size: 'm' }),
			// Lecture 5's indexOf.
			findInList({ nodes: ['7', '3', '9'].map((value, i) => ({ id: `n${i}`, value, dx: 0, dy: 0 })), direction: 'right', size: 'm' }, '9'),
			findInList({ nodes: ['7', '3'].map((value, i) => ({ id: `n${i}`, value, dx: 0, dy: 0 })), direction: 'right', size: 'm' }, '9'),
			// Lecture 8: traversals (with and without null markers) and the recursion that returns values.
			...(['pre', 'in', 'post', 'level'] as const).flatMap((order) => [traverseTree(tree, 'a', order), traverseTree(tree, 'a', order, { nulls: true })]),
			// A general tree's, each call from a loop over the children.
			...(['pre', 'post', 'level'] as const).map((order) => traverseTree(tree, 'a', order, { general: true })),
			...(['height', 'height-levels', 'leaves', 'size'] as const).map((m) => measureTree(tree, 'a', m, { general: true })),
			...(['height', 'height-levels', 'leaves', 'size'] as const).flatMap((m) => [measureTree(tree, 'a', m), measureTree(tree, 'a', m, { nulls: true })]),
			{ ...bstExtreme(tree, 'a', 'min'), code: 'bst-min' },
			// Lecture 8b's BST: search, insert, delete (every case).
			{ ...bstSearch(bst, '20'), code: 'bst-search' },
			{ ...bstSearch(bst, '33'), code: 'bst-search' },
			{ ...bstSearch(bst, '50'), code: 'bst-search' },
			{ ...bstInsertSteps(bst, '33'), code: 'bst-insert' },
			{ ...bstInsertSteps(bst, '20'), code: 'bst-insert' },
			{ ...bstInsertSteps(bst, '10'), code: 'bst-insert' },
			...['d', 'c', 'e', 'b', 'a'].map((id) => ({ ...bstDeleteSteps(bst, id), code: 'bst-delete' })),
			{ ...bstExtreme(tree, 'a', 'max'), code: 'bst-max' },
			// Heaps, min and max: insert (sifting up), extract the root, remove from the middle (down, and up),
			// remove the last, build bottom-up.
			...(['min', 'max'] as const).flatMap((type) => {
				const heap = type === 'min' ? ['1', '10', '2', '11', '12', '3', '4'] : ['12', '4', '11', '3', '2', '10', '9']
				return [
					insertSteps(heap, type === 'min' ? '0' : '13', type),
					insertSteps(heap, type === 'min' ? '99' : '-1', type),
					removeSteps(heap, 0, type),
					removeSteps(heap, 1, type),
					removeSteps(heap, 3, type),
					removeSteps(heap, 6, type),
					{ ...buildHeapSteps(['5', '9', '1', '7', '3', '8'], type), code: heapCode('build', type) },
				]
			}),
			// Lecture 9: the searches and components, on a graph in two pieces.
			bfs(graph, 'a', false),
			dfs(graph, 'a', false),
			bfs(graph, 'a', true),
			components(graph, { directed: false, weighted: false }),
			// Lecture 9's path and Task 18's cycle.
			shortestPath(graph, 'a', 'c', false),
			shortestPath(graph, 'a', 'e', false),
			findCycle(graph, false),
			findCycle({ ...graph, edges: graph.edges.slice(0, 1) }, false),
			findCycle(graph, true),
			findCycle({ ...graph, edges: graph.edges.slice(0, 1) }, true),
		]
		// What the steps give values for (their pointers and variables), by code: some runs never reach a
		// variable (a pop that underflows has no v), so all the runs of a code together.
		const given = new Map<string, Set<string>>()
		for (const op of ops) {
			const names = op.frames.flatMap((f) => [...(f.pointers ?? []).map((p) => p.name), ...Object.keys(f.vars ?? {})])
			given.set(op.code!, new Set([...(given.get(op.code!) ?? []), ...names]))
		}
		for (const op of ops) {
			expect(op.code && ALGORITHMS[op.code], `${op.frames[0]?.caption}`).toBeTruthy()
			const lines = op.frames.flatMap((f) => (f.line ? [f.line] : []))
			expect(lines.length).toBeGreaterThan(0)
			for (const language of ['c', 'java', 'python'] as const) {
				const code = algorithmCode(op.code!, language)!
				expect(code.language).toBe(language)
				for (const line of lines) expect(code.lines, `${op.code} ${language} @${line}`).toHaveProperty(line)
				for (const v of code.values) expect(given.get(op.code!), `${op.code} ${language} $${v.name}`).toContain(v.key)
			}
			// Every line counted is in the code, in one language at least (Python's n = len(a) only there).
			for (const tag of Object.keys(op.frames[0].runs ?? {})) {
				const where = (['java', 'python'] as const).filter((language) => algorithmCode(op.code!, language)!.lines[tag] !== undefined)
				expect(where, `${op.code} counts @${tag}`).not.toEqual([])
			}
		}
	})

	it('a step names the line it shows: bubble sort compares, swaps, and checks after each pass', () => {
		const op = bubbleSort(array(2, 1, 3))
		expect(op.frames.map((f) => f.line)).toEqual(['compare', 'swap', 'compare', 'pass', 'compare', 'sorted', undefined])
		// Its variables as the steps run: swapped goes true at the swap, and false again for pass 2.
		expect(op.frames.map((f) => f.vars?.swapped)).toEqual(['false', 'true', 'true', 'true', 'false', 'false', 'false'])
		expect(op.frames.map((f) => f.vars?.pass)).toEqual(['1', '1', '1', '1', '2', '2', '2'])
	})

	it('merge sort: each call shows its own lo, hi and mid, again when it merges after its inner calls', () => {
		const op = mergeSort(array(3, 1, 2))
		const merging = op.frames.filter((f) => f.line === 'merge').map((f) => [f.vars?.lo, f.vars?.mid, f.vars?.hi])
		expect(merging).toEqual([
			['0', '0', '1'],
			['0', '1', '2'],
		])
		// A call of one value has no mid.
		expect(op.frames.find((f) => f.line === 'base')?.vars?.mid).toBeUndefined()
	})
})

describe('hash tables', () => {
	// Every strategy, kind of key and scheme: insert (new, in already, a collision), find (there, not),
	// delete (there, the first and a later one in a chain, not there), rehash.
	const schemes = (['chaining', 'probing'] as const).flatMap((strategy) => [
		...(['sum', 'letters', 'java'] as const).flatMap((code) => (['mod', 'mad'] as const).map((compress) => ({ strategy, code, compress, ints: false }))),
		...(['mod', 'mad'] as const).map((compress) => ({ strategy, code: 'sum' as const, compress, ints: true })),
		{ strategy, code: 'direct' as const, compress: 'mod' as const, ints: true },
	])
	it.each(schemes)('%o: every operation shows its code, every line and value in it', ({ ints, ...scheme }) => {
		const keys = ints ? ['3', '10', '17', '5', '1'] : ['cat', 'dog', 'emu', 'act', 'god']
		const table = buildTable(keys, 7, scheme)
		const ops = [
			insertEntry(table, scheme, ints ? '24' : 'tac'),
			insertEntry(table, scheme, keys[0]),
			findKey(table, scheme, keys[1]),
			findKey(table, scheme, ints ? '6' : 'owl'),
			deleteKey(table, scheme, keys[0]),
			deleteKey(table, scheme, keys[3]),
			deleteKey(table, scheme, ints ? '6' : 'owl'),
			deleteKey(table, scheme, keys[4]),
			rehash(table, scheme),
		]
		const given = new Map<string, Set<string>>()
		for (const op of ops) {
			const names = op.frames.flatMap((f) => [...(f.pointers ?? []).map((p) => p.name), ...Object.keys(f.vars ?? {})])
			given.set(op.code, new Set([...(given.get(op.code) ?? []), ...names]))
		}
		for (const op of ops) {
			expect(ALGORITHMS[op.code], op.code).toBeTruthy()
			const lines = op.frames.flatMap((f) => (f.line ? [f.line] : []))
			expect(lines.length, op.code).toBeGreaterThan(0)
			for (const language of ['c', 'java', 'python'] as const) {
				const code = algorithmCode(op.code, language)!
				for (const line of lines) expect(code.lines, `${op.code} ${language} @${line}`).toHaveProperty(line)
				for (const v of code.values) expect(given.get(op.code), `${op.code} ${language} $${v.name}`).toContain(v.key)
			}
		}
	})

	it('integer keys are their own hash code: text keys use the table\'s hash code', () => {
		const scheme = { strategy: 'chaining' as const, code: 'java' as const, compress: 'mod' as const }
		expect(findKey(buildTable(['3', '10'], 7, scheme), scheme, '3').code).toBe('hash-find-chaining-int-mod')
		expect(findKey(buildTable(['cat'], 7, scheme), scheme, 'cat').code).toBe('hash-find-chaining-java-mod')
		expect(algorithmCode('hash-find-chaining-java-mod', 'java')!.text).toContain('int h = key.hashCode();')
		expect(algorithmCode('hash-find-probing-direct', 'python')!.text).toContain('return key    # the key is the index')
	})
})

describe('union-find', () => {
	// Every way of linking, with path compression and without: find (a root, a deep node), union (two
	// sets, one set already).
	const forest = { parent: [0, 0, 1, 2, 4, 4, 6], sizes: [4, 3, 2, 1, 2, 1, 1], ranks: [3, 2, 1, 0, 1, 0, 0] }
	const kinds = (['size', 'rank', 'naive'] as const).flatMap((unionBy) => (['on', 'off'] as const).map((compression) => ({ unionBy, compression })))
	it.each(kinds)('%o: every operation shows its code, every line and value in it', (kind) => {
		const props = { labels: ['0', '1', '2', '3', '4', '5', '6'], size: 'm' as const, ...forest, ...kind }
		const f = { parent: [...forest.parent], sizes: [...forest.sizes], ranks: [...forest.ranks] }
		const ops = [
			findSteps(props, f, 0),
			findSteps(props, f, 3),
			unionSteps(props, 3, 5),
			unionSteps(props, 3, 1),
			unionSteps(props, 6, 4),
			connectedSteps(props, 3, 1),
			connectedSteps(props, 3, 5),
		]
		const given = new Map<string, Set<string>>()
		for (const op of ops) {
			const names = op.frames.flatMap((fr) => [...(fr.pointers ?? []).map((p) => p.name), ...Object.keys(fr.vars ?? {})])
			given.set(op.code, new Set([...(given.get(op.code) ?? []), ...names]))
		}
		for (const op of ops) {
			const lines = op.frames.flatMap((fr) => (fr.line ? [fr.line] : []))
			expect(lines.length, op.code).toBeGreaterThan(0)
			for (const language of ['c', 'java', 'python'] as const) {
				const code = algorithmCode(op.code, language)!
				for (const line of lines) expect(code.lines, `${op.code} ${language} @${line}`).toHaveProperty(line)
				for (const v of code.values) expect(given.get(op.code), `${op.code} ${language} $${v.name}`).toContain(v.key)
			}
		}
	})
})

describe('list variants', () => {
	// Every mix of the four list toggles (doubly, circular, sentinel, tail), every operation offered on
	// it: each shows code, every line a step lights is in it, in C, Java and Python, and every value it
	// shows is one a step gives.
	const variants = Array.from({ length: 16 }, (_, bits) => ({
		links: bits & 1 ? ('doubly' as const) : ('singly' as const),
		ends: bits & 2 ? ('circular' as const) : ('null' as const),
		sentinel: bits & 4 ? ('sentinel' as const) : ('none' as const),
		tail: bits & 8 ? ('tail' as const) : ('none' as const),
	}))
	const list = (values: string[], variant: object) => ({ ...plainList(values), ...variant })

	it.each(variants)('%o: every operation shows its code, every line and value in it', (variant) => {
		const props = list(['7', '3', '9', '4'], variant)
		const sorted = list(['3', '5', '7', '9'], variant)
		const circular = variant.ends === 'circular'
		const ops = [
			findInList(props, '9'),
			findInList(props, '8'),
			countNodes(props),
			printList(props),
			...(variant.links === 'doubly' ? [printBackwards(props)] : []),
			...(circular ? [] : [findMiddle(props), reverseList(props)]),
			detectCycle(props),
			insertIntoList(props, 'n1', 'n9', '5'),
			insertIntoList(props, 'n3', 'n9', '5'),
			insertIntoList(props, undefined, 'n9', '5'),
			appendToList(props, 'n9', '5'),
			deleteFromList(props, 'n0'),
			deleteFromList(props, 'n2'),
			deleteFromList(props, 'n3'),
			// Round a circle without a sentinel, insert in order has no code (the front moves the last node's next too).
			...(circular && variant.sentinel === 'none' ? [] : [insertSorted(sorted, 'n9', '1'), insertSorted(sorted, 'n9', '6'), insertSorted(sorted, 'n9', '12')]),
		]
		const given = new Map<string, Set<string>>()
		for (const op of ops) {
			expect(op.code, `${op.frames[0]?.caption}`).toBeTruthy()
			const names = op.frames.flatMap((f) => [...(f.pointers ?? []).map((p) => p.name), ...Object.keys(f.vars ?? {})])
			given.set(op.code!, new Set([...(given.get(op.code!) ?? []), ...names]))
		}
		for (const op of ops) {
			const lines = op.frames.flatMap((f) => (f.line ? [f.line] : []))
			expect(lines.length, op.code).toBeGreaterThan(0)
			for (const language of ['c', 'java', 'python'] as const) {
				const code = algorithmCode(op.code!, language)!
				expect(code.language).toBe(language)
				for (const line of lines) expect(code.lines, `${op.code} ${language} @${line}`).toHaveProperty(line)
				for (const v of code.values) expect(given.get(op.code!), `${op.code} ${language} $${v.name}`).toContain(v.key)
			}
		}
	})

	it('a list with a cycle shows only Floyd\'s code: the other walks never end', () => {
		const props = { ...plainList(['7', '3', '9']), cycleTo: 'n1' }
		expect(detectCycle(props).code).toBe('list-floyd')
		expect(findInList(props, '8').code).toBeUndefined()
	})
})

describe('code box migrations', () => {
	it('code boxes saved before folding fold their long code beside a structure', () => {
		const [, , , addFold] = codeShapeMigrations.sequence
		if (!('up' in addFold) || typeof addFold.down !== 'function') throw new Error('expected a props migration')
		const props: Record<string, unknown> = { code: 'x = 1' }
		addFold.up(props)
		expect(props).toMatchObject({ fold: true })
		addFold.down(props)
		expect(props).not.toHaveProperty('fold')
	})

	it('code boxes saved before the code beside a structure are boxes of their own', () => {
		const [, , addTranscript] = codeShapeMigrations.sequence
		if (!('up' in addTranscript) || typeof addTranscript.down !== 'function') throw new Error('expected a props migration')
		const props: Record<string, unknown> = { code: 'x = 1' }
		addTranscript.up(props)
		expect(props).toMatchObject({ transcript: false })
		addTranscript.down(props)
		expect(props).not.toHaveProperty('transcript')
	})

	it('code boxes saved before the times column have it off', () => {
		const [, addLineCounts] = codeShapeMigrations.sequence
		if (!('up' in addLineCounts) || typeof addLineCounts.down !== 'function') throw new Error('expected a props migration')
		const props: Record<string, unknown> = { code: 'x = 1' }
		addLineCounts.up(props)
		expect(props).toMatchObject({ lineCounts: false })
		addLineCounts.down(props)
		expect(props).not.toHaveProperty('lineCounts')
	})

	it('code boxes saved before they could follow a structure follow none', () => {
		const [addFollowing] = codeShapeMigrations.sequence
		if (!('up' in addFollowing) || typeof addFollowing.down !== 'function') throw new Error('expected a props migration')
		const props: Record<string, unknown> = { code: 'x = 1' }
		addFollowing.up(props)
		expect(props).toMatchObject({ structureId: '', algorithm: '' })
		addFollowing.down(props)
		expect(props).not.toHaveProperty('structureId')
		expect(props).not.toHaveProperty('algorithm')
	})
})
