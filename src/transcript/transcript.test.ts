import { describe, expect, it } from 'vitest'
import { diffValues, replay, type ArrayMove } from './array-moves'
import { renderArrayLog } from './render'

const v = (...xs: (number | string)[]) => xs.map(String)

describe('an array change as the move a teacher made', () => {
	it('a value set, values appended or popped, one inserted or deleted, two swapped', () => {
		expect(diffValues(v(3, 1, 4), v(3, 42, 4))).toEqual([{ op: 'set', i: 1, v: '42' }])
		expect(diffValues(v(3, 1), v(3, 1, 4, 1))).toEqual([
			{ op: 'append', v: '4' },
			{ op: 'append', v: '1' },
		])
		expect(diffValues(v(3, 1, 4), v(3))).toEqual([{ op: 'pop' }, { op: 'pop' }])
		expect(diffValues(v(3, 1, 4), v(3, 9, 1, 4))).toEqual([{ op: 'insert', i: 1, v: '9' }])
		expect(diffValues(v(3, 1, 4), v(3, 4))).toEqual([{ op: 'delete', i: 1 }])
		expect(diffValues(v(3, 1, 4, 1), v(1, 1, 4, 3))).toEqual([{ op: 'swap', i: 0, j: 3 }])
	})

	it('the whole array sorted (either way) or reversed; anything else, the new values', () => {
		expect(diffValues(v(3, 1, 4, 10), v(1, 3, 4, 10))).toEqual([{ op: 'swap', i: 0, j: 1 }])
		expect(diffValues(v(3, 10, 4, 1), v(1, 3, 4, 10))).toEqual([{ op: 'sort' }])
		expect(diffValues(v(3, 10, 4, 1), v(10, 4, 3, 1))).toEqual([{ op: 'sort', descending: true }])
		expect(diffValues(v(3, 10, 1, 4), v(4, 1, 10, 3))).toEqual([{ op: 'reverse' }])
		expect(diffValues(v(3, 10, 1, 4), v(10, 4, 3, 1))).toEqual([{ op: 'sort', descending: true }])
		expect(diffValues(v(3, 10, 1, 4), v(1, 4, 10, 3))).toEqual([{ op: 'assign', values: v(1, 4, 10, 3) }])
		expect(diffValues(v(3, 1), v(7, 8, 9))).toEqual([{ op: 'assign', values: v(7, 8, 9) }])
		expect(diffValues(v(3, 1), v(3, 1))).toEqual([])
	})

	it('replaying a log gives the values it describes', () => {
		const log: ArrayMove[] = [
			{ op: 'new', name: 'a', values: v(3, 1, 4) },
			{ op: 'set', i: 0, v: '42' },
			{ op: 'append', v: '7' },
			{ op: 'insert', i: 1, v: '5' },
			{ op: 'delete', i: 2 },
			{ op: 'swap', i: 0, j: 3 },
			{ op: 'sort' },
			{ op: 'call', algorithm: 'bubble-sort', label: 'bubble sort', effect: [{ op: 'reverse' }] },
		]
		expect(replay(log)).toEqual(v(42, 7, 5, 4))
	})
})

describe('a log written out', () => {
	const log: ArrayMove[] = [
		{ op: 'new', name: 'a', values: v(3, 1, 4) },
		{ op: 'set', i: 0, v: '42' },
		{ op: 'append', v: '7' },
		{ op: 'insert', i: 1, v: '5' },
		{ op: 'delete', i: 2 },
		{ op: 'pop' },
		{ op: 'swap', i: 0, j: 2 },
		{ op: 'sort', descending: true },
		{ op: 'reverse' },
		{ op: 'shuffle', values: v(5, 42, 4) },
		{ op: 'call', algorithm: 'bubble-sort', label: 'bubble sort', effect: [{ op: 'sort' }] },
		{ op: 'call', algorithm: 'merge-sort', label: 'merge sort', effect: [] },
		{ op: 'call', algorithm: 'array-insert', label: 'insert', effect: [{ op: 'insert', i: 0, v: '9' }] },
		{ op: 'assign', values: v(1, 2) },
	]

	it('in Python: a list', () => {
		expect(renderArrayLog(log, 'python').split('\n')).toEqual([
			'a = [3, 1, 4]',
			'a[0] = 42',
			'a.append(7)',
			'a.insert(1, 5)',
			'del a[2]',
			'a.pop()',
			'a[0], a[2] = a[2], a[0]',
			'a.sort(reverse=True)',
			'a.reverse()',
			'random.shuffle(a)    # came out [5, 42, 4]',
			'bubble_sort(a)',
			'merge_sort(a, 0, len(a) - 1)',
			// insert(a, k, value): k and value can't be told, so what it did, under its name.
			'# insert, step by step:',
			'a.insert(0, 9)',
			'a = [1, 2]',
		])
	})

	it('in Java: a List, as a growing array is', () => {
		expect(renderArrayLog(log, 'java').split('\n')).toEqual([
			'List<Integer> a = new ArrayList<>(List.of(3, 1, 4));',
			'a.set(0, 42);',
			'a.add(7);',
			'a.add(1, 5);',
			'a.remove(2);',
			'a.remove(a.size() - 1);',
			'Collections.swap(a, 0, 2);',
			'a.sort(Collections.reverseOrder());',
			'Collections.reverse(a);',
			'Collections.shuffle(a);    // came out {5, 42, 4}',
			'bubbleSort(a);',
			'mergeSort(a, 0, a.size() - 1);',
			'// insert, step by step:',
			'a.add(0, 9);',
			'a = new ArrayList<>(List.of(1, 2));',
		])
	})

	it("in C: a list type with a list's operations, its items and size what C's algorithms take", () => {
		const c = renderArrayLog(log, 'c').split('\n')
		expect(c[0]).toBe('IntList a = listOf(3, (int[]){3, 1, 4});')
		expect(c.slice(1, 3)).toEqual(['a.items[0] = 42;', 'append(&a, 7);'])
		expect(c).toContain('bubbleSort(a.items, a.size);')
		expect(c).toContain('mergeSort(a.items, 0, a.size - 1);')
	})

	it('text values are quoted, and the list holds text', () => {
		const words: ArrayMove[] = [
			{ op: 'new', name: 'b', values: ['cat', 'dog'] },
			{ op: 'set', i: 1, v: 'emu' },
		]
		expect(renderArrayLog(words, 'python')).toBe('b = ["cat", "dog"]\nb[1] = "emu"')
		expect(renderArrayLog(words, 'java').split('\n')[0]).toBe('List<String> b = new ArrayList<>(List.of("cat", "dog"));')
	})
})
