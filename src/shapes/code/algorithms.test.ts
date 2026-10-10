import { describe, expect, it } from 'vitest'
import {
	binarySearch,
	bubbleSort,
	hoarePartition,
	insertionSort,
	linearSearch,
	mergeSort,
	partitionArray,
	quicksort,
	recursiveBinarySearch,
	selectionSort,
	sumWithInvariant,
	type ArrayOperation,
	type ArrayState,
} from '../array/operations'
import { allUnique, findMax, sentinelSearch } from '../array/scans'
import { fisherYates, unfairShuffle } from '../array/shuffles'
import { mulberry32 } from '../../data/random'
import { ALGORITHMS, algorithmCode, parseCode, shownValues, taggedLine } from './algorithms'
import { codeShapeMigrations } from './code-shape-types'

const array = (...values: (string | number)[]): ArrayState => ({ values: values.map(String), marks: {} })

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
			for (const language of ['java', 'python'] as const) {
				expect(algorithmCode(id, language)!.text, `${id} ${language}`).not.toMatch(/\s[@$][\w=-]+\s*$/m)
			}
		}
	})

	it('C falls back to Java (not written yet); an algorithm without code has none', () => {
		expect(algorithmCode('bubble-sort', 'c')?.language).toBe('java')
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
		const ops: ArrayOperation[] = [
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
			insertionSort(array(5, 2, 4, 1, 3)),
			selectionSort(array(5, 2, 4, 1, 3)),
			selectionSort(array(1, 2, 3)),
			bubbleSort(array(5, 2, 4, 1, 3)),
			bubbleSort(array(1, 2, 3)),
			partitionArray(array(7, 2, 9, 1, 5)),
			partitionArray(array(1, 2, 9)),
			quicksort(array(7, 2, 9, 1, 5, 3)),
			hoarePartition(array(5, 2, 9, 1, 7, 3)),
			mergeSort(array(7, 2, 9, 1, 5, 3)),
			unfairShuffle(array(7, 2, 9, 1), mulberry32(3)),
			fisherYates(array(7, 2, 9, 1), mulberry32(3)),
		]
		for (const op of ops) {
			expect(op.code && ALGORITHMS[op.code], `${op.frames[0]?.caption}`).toBeTruthy()
			const lines = op.frames.flatMap((f) => (f.line ? [f.line] : []))
			expect(lines.length).toBeGreaterThan(0)
			// What the steps give values for: their pointers and variables.
			const given = new Set(op.frames.flatMap((f) => [...(f.pointers ?? []).map((p) => p.name), ...Object.keys(f.vars ?? {})]))
			for (const language of ['java', 'python'] as const) {
				const code = algorithmCode(op.code!, language)!
				expect(code.language).toBe(language)
				for (const line of lines) expect(code.lines, `${op.code} ${language} @${line}`).toHaveProperty(line)
				for (const v of code.values) expect(given, `${op.code} ${language} $${v.name}`).toContain(v.key)
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

describe('code box migrations', () => {
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
