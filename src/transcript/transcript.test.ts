import { describe, expect, it } from 'vitest'
import { diffValues, replay, type ArrayMove } from './array-moves'
import { diffList, replayList, type ListMove, type ListState } from './list-moves'
import { renderArrayLog, renderListLog } from './render'

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

describe('a linked list change as the move a teacher made', () => {
	const at = (ids: string, values: string, cycle: number | null = null): ListState => ({ ids: ids.split(' '), values: values.split(' '), cycle })

	it('a value set, a node in at the head, at the end or after another, a node out, reversed', () => {
		expect(diffList(at('n0 n1 n2', '3 1 4'), at('n0 n1 n2', '3 42 4'))).toEqual([{ op: 'set', i: 1, v: '42' }])
		expect(diffList(at('n0 n1', '3 1'), at('n9 n0 n1', '5 3 1'))).toEqual([{ op: 'insertAtHead', v: '5' }])
		expect(diffList(at('n0 n1', '3 1'), at('n0 n1 n9', '3 1 5'))).toEqual([{ op: 'append', v: '5' }])
		expect(diffList(at('n0 n1', '3 1'), at('n0 n9 n1', '3 5 1'))).toEqual([{ op: 'insert', i: 1, v: '5' }])
		expect(diffList(at('n0 n1 n2', '3 1 4'), at('n0 n2', '3 4'))).toEqual([{ op: 'remove', i: 1, v: '1', first: true }])
		// A later node holding the same value as one before it goes by its place.
		expect(diffList(at('n0 n1 n2', '3 1 3'), at('n0 n1', '3 1'))).toEqual([{ op: 'remove', i: 2, v: '3', first: false }])
		expect(diffList(at('n0 n1 n2', '3 1 4'), at('n2 n1 n0', '4 1 3'))).toEqual([{ op: 'reverse' }])
	})

	it('several at once (a grip dragged): in at the head in order, appended, out from the back', () => {
		expect(diffList(at('n0', '3'), at('n8 n9 n0 n5 n6', '7 8 3 5 6'))).toEqual([
			{ op: 'insertAtHead', v: '8' },
			{ op: 'insertAtHead', v: '7' },
			{ op: 'append', v: '5' },
			{ op: 'append', v: '6' },
		])
		expect(diffList(at('n0 n1 n2 n3', '3 1 4 1'), at('n0 n3', '3 1'))).toEqual([
			{ op: 'remove', i: 2, v: '4', first: true },
			{ op: 'remove', i: 1, v: '1', first: true },
		])
	})

	it("the last node's next re-pointed: a cycle made or taken away; anything else, new values", () => {
		expect(diffList(at('n0 n1 n2', '3 1 4'), at('n0 n1 n2', '3 1 4', 1))).toEqual([{ op: 'cycle', last: 2, to: 1 }])
		expect(diffList(at('n0 n1 n2', '3 1 4', 1), at('n0 n1 n2', '3 1 4'))).toEqual([{ op: 'cycle', last: 2, to: null }])
		expect(diffList(at('n0 n1', '3 1'), at('n2 n1', '5 1'))).toEqual([{ op: 'assign', values: ['5', '1'] }])
	})

	it('written out: drawds’ own list methods, node_at naming a node', () => {
		const log: ListMove[] = [
			{ op: 'new', name: 'b', values: ['3', '1', '4'] },
			{ op: 'set', i: 1, v: '42' },
			{ op: 'insertAtHead', v: '5' },
			{ op: 'append', v: '9' },
			{ op: 'insert', i: 2, v: '7' },
			{ op: 'remove', i: 0, v: '5', first: true },
			{ op: 'reverse' },
			{ op: 'cycle', last: 4, to: 1 },
			{ op: 'call', algorithm: 'list-reverse', label: 'reverse', effect: [{ op: 'reverse' }] },
			{ op: 'call', algorithm: 'list-insert', label: 'insert', effect: [{ op: 'insert', i: 1, v: '8' }] },
		]
		expect(renderListLog(log, 'python').split('\n')).toEqual([
			'b = LinkedList([3, 1, 4])',
			'b.node_at(1).value = 42',
			'b.insert_at_head(5)',
			'b.append(9)',
			'b.insert_after(b.node_at(1), 7)',
			'b.remove(5)',
			'b.reverse()',
			'b.node_at(4).next = b.node_at(1)    # a cycle',
			'b.reverse()',
			'# insert, step by step:',
			'b.insert_after(b.node_at(0), 8)',
		])
		expect(renderListLog(log, 'java').split('\n').slice(0, 3)).toEqual(['LinkedList b = new LinkedList(3, 1, 4);', 'b.nodeAt(1).value = 42;', 'b.insertAtHead(5);'])
		expect(renderListLog(log, 'java')).toContain('\nb.reverse();\n// insert, step by step:')
		expect(renderListLog(log, 'c').split('\n').slice(0, 2)).toEqual(['List *b = listOf(3, (int[]){3, 1, 4});', 'nodeAt(b, 1)->value = 42;'])
		expect(renderListLog(log, 'c')).toContain('\nreverse(b);\n')
		// 3 42 4 -> 5 3 42 4 -> 5 3 42 4 9 -> 5 3 7 42 4 9 -> 3 7 42 4 9 -> 9 4 42 7 3 -> (reverse) 3 7 42 4 9 -> 3 8 7 42 4 9
		expect(replayList(log)).toEqual(['3', '8', '7', '42', '4', '9'])
	})
})
