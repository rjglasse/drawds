import { describe, expect, it } from 'vitest'
import { diffArray, diffValues, replay, type ArrayLogState, type ArrayMove } from './array-moves'
import { diffList, replayList, type ListMove, type ListState } from './list-moves'
import { addChild, mirrorSubtree, removeSubtree, swapChildren } from '../shapes/tree/model'
import { diffGraph, graphState, type GraphMove, type GraphState } from './graph-moves'
import { renderArrayLog, renderGraphLog, renderHashLog, renderHeapLog, renderListLog, renderMatrixLog, renderTreeLog, renderUnionFindLog } from './render'
import { diffHeap, heapArgs, type HeapMove, type HeapState } from './heap-moves'
import { heapify, heapInsert, heapRemoveAt } from '../shapes/heap/heap'
import { heapCode } from '../shapes/heap/code'
import { diffHash, hashArgs, tableOf, type HashMove, type HashState } from './hash-moves'
import { TOMBSTONE, buildTable, deleteKey, entriesOf, insertEntry, rehash } from '../shapes/hash/hash'
import { hashCodeId } from '../shapes/hash/code'
import { diffGrid, replayGrid, type MatrixMove } from './matrix-moves'
import { deleteCol, deleteRow, insertCol, insertRow, transpose } from '../shapes/matrix/model'
import { diffUnionFind, type UnionFindMove, type UnionFindState } from './union-find-moves'
import { recount, singletons, union } from '../shapes/union-find/union-find'
import { unionFindCode } from '../shapes/union-find/code'
import { diffTree, shapeOf, treeArgs, type TreeMove } from './tree-moves'

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

describe('a binary tree change as the move a teacher made', () => {
	// 8 (3 (1, 6), 10 (-, 14)), ids by path.
	const node = (id: string, value: string, l: string | null = null, r: string | null = null) => ({ id, value, children: [l, r] as (string | null)[], dx: 0, dy: 0 })
	const tree = [node('n', '8', 'nL', 'nR'), node('nL', '3', 'nLL', 'nLR'), node('nR', '10', null, 'nRR'), node('nLL', '1'), node('nLR', '6'), node('nRR', '14')]

	it('a value set, a leaf added, a subtree removed, children swapped, a subtree mirrored', () => {
		expect(diffTree(tree, tree.map((n) => (n.id === 'nLR' ? { ...n, value: '7' } : n)))).toEqual([{ op: 'set', path: 'LR', v: '7' }])
		const { nodes: added } = addChild(tree, 'nR', 0, '9')
		expect(diffTree(tree, added)).toEqual([{ op: 'add', path: 'RL', v: '9' }])
		expect(diffTree(tree, removeSubtree(tree, 'nL'))).toEqual([{ op: 'remove', path: 'L', v: '3' }])
		expect(diffTree(tree, swapChildren(tree, 'nL'))).toEqual([{ op: 'swap', path: 'L' }])
		expect(diffTree(tree, mirrorSubtree(tree, 'n'))).toEqual([{ op: 'mirror', path: '' }])
	})

	it("an operation's key and node, as what it did tells them", () => {
		expect(treeArgs(tree, addChild(tree, 'nR', 0, '9').nodes)).toEqual({ key: '9' })
		expect(treeArgs(tree, removeSubtree(tree, 'nRR'))).toEqual({ node: 'RR' })
	})

	it('written out: a Tree, nodes by their paths, a BST insert and delete as calls on it', () => {
		const log: TreeMove[] = [
			{ op: 'new', name: 't', tree: shapeOf(tree) },
			{ op: 'set', path: 'LR', v: '7' },
			{ op: 'add', path: 'RL', v: '9' },
			{ op: 'remove', path: 'LL', v: '1' },
			{ op: 'swap', path: 'L' },
			{ op: 'mirror', path: '' },
			{ op: 'call', algorithm: 'bst-insert', label: 'insert', effect: [], args: { key: '5' } },
			{ op: 'call', algorithm: 'bst-delete', label: 'delete', effect: [], args: { node: 'R' } },
		]
		expect(renderTreeLog(log, 'python', 'key').split('\n')).toEqual([
			't = Tree(Node(8, Node(3, Node(1), Node(6)), Node(10, None, Node(14))))',
			't.root.left.right.key = 7',
			't.root.right.left = Node(9)',
			't.root.left.left = None    # 1 and everything under it',
			'swap_children(t.root.left)',
			'mirror(t.root)',
			't.insert(5)',
			't.delete(t.root.right)',
		])
		const java = renderTreeLog(log, 'java', 'key').split('\n')
		expect(java[0]).toBe('Tree t = new Tree(new Node(8, new Node(3, new Node(1), new Node(6)), new Node(10, null, new Node(14))));')
		expect(java.slice(-2)).toEqual(['t.insert(5);', 't.delete(t.root.right);'])
		const c = renderTreeLog(log, 'c', 'key').split('\n')
		expect(c[0]).toBe('Tree *t = newTree(node(8, node(3, newNode(1), newNode(6)), node(10, NULL, newNode(14))));')
		expect(c.slice(1, 3)).toEqual(['t->root->left->right->key = 7;', 't->root->right->left = newNode(9);'])
		expect(c.slice(-2)).toEqual(['insert(t, 5);', 'delete(t, t->root->right);'])
	})
})

describe('a graph change as the move a teacher made', () => {
	const g = (nodes: string, edges: string): GraphState => ({
		nodes: nodes.split(' ').map((v, i) => ({ id: `v${i}`, value: v })),
		edges: edges ? edges.split(' ').map((e, i) => ({ id: `e${i}`, from: `v${e[0]}`, to: `v${e[1]}`, weight: String(i + 2) })) : [],
	})
	const abc = g('A B C', '01 12')

	it('vertices and edges in and out (a vertex taking its edges), labels typed, weights changed', () => {
		expect(diffGraph(abc, { ...abc, nodes: [...abc.nodes, { id: 'v3', value: 'D' }], edges: [...abc.edges, { id: 'e2', from: 'v2', to: 'v3', weight: '7' }] })).toEqual([
			{ op: 'addVertex', v: 'D' },
			{ op: 'addEdge', from: 'C', to: 'D', weight: '7' },
		])
		expect(diffGraph(abc, { nodes: abc.nodes.slice(0, 2), edges: abc.edges.slice(0, 1) })).toEqual([{ op: 'removeVertex', v: 'C' }])
		expect(diffGraph(abc, { ...abc, edges: abc.edges.slice(1) })).toEqual([{ op: 'removeEdge', from: 'A', to: 'B' }])
		expect(diffGraph(abc, { ...abc, nodes: abc.nodes.map((n) => (n.id === 'v1' ? { ...n, value: 'Z' } : n)) })).toEqual([{ op: 'rename', from: 'B', to: 'Z' }])
		expect(diffGraph(abc, { ...abc, edges: abc.edges.map((e) => (e.id === 'e1' ? { ...e, weight: '9' } : e)) })).toEqual([{ op: 'weight', from: 'B', to: 'C', weight: '9' }])
	})

	it('where nodes are drawn is not the graph: dragging one logs nothing', () => {
		expect(diffGraph(graphState({ nodes: abc.nodes.map((n) => ({ ...n, x: 1, y: 2 })), edges: abc.edges }), abc)).toEqual([])
	})

	it('written out: a Graph (DiGraph directed), edges with weights while it shows them', () => {
		const log: GraphMove[] = [
			{ op: 'new', name: 'g', vertices: ['A', 'B'], edges: [['A', 'B', '4']] },
			{ op: 'addVertex', v: 'C' },
			{ op: 'addEdge', from: 'B', to: 'C', weight: '7' },
			{ op: 'weight', from: 'A', to: 'B', weight: '9' },
			{ op: 'rename', from: 'C', to: 'D' },
			{ op: 'removeEdge', from: 'A', to: 'B' },
			{ op: 'removeVertex', v: 'A' },
		]
		expect(renderGraphLog(log, 'python', { directed: false, weighted: true }).split('\n')).toEqual([
			'g = Graph(["A", "B"])',
			'g.add_edge("A", "B", 4)',
			'g.add_vertex("C")',
			'g.add_edge("B", "C", 7)',
			'g.set_weight("A", "B", 9)',
			'g.rename_vertex("C", "D")',
			'g.remove_edge("A", "B")',
			'g.remove_vertex("A")',
		])
		expect(renderGraphLog(log, 'java', { directed: true, weighted: false }).split('\n').slice(0, 2)).toEqual(['DiGraph g = new DiGraph("A", "B");', 'g.addEdge("A", "B");'])
		expect(renderGraphLog(log, 'c', { directed: false, weighted: false }).split('\n').slice(0, 3)).toEqual([
			'Graph *g = newGraph(2, (const char *[]){"A", "B"});',
			'addEdge(g, "A", "B");',
			'addVertex(g, "C");',
		])
	})
})

describe('a heap change as the move a teacher made', () => {
	// A min heap: 1 (3 (8, 5), 4).
	const heap: HeapState = { type: 'min', values: v(1, 3, 4, 8, 5) }

	it('a value typed, the heap built (min and max switched); anything else, a new heap', () => {
		expect(diffHeap(heap, { ...heap, values: v(1, 3, 4, 8, 0) })).toEqual([{ op: 'set', i: 4, v: '0' }])
		// Switching to max: the same values in a MaxHeap, then Floyd's build makes it one.
		const max: HeapState = { type: 'max', values: heap.values }
		expect(diffHeap(heap, max)).toEqual([{ op: 'assign', type: 'max', values: v(1, 3, 4, 8, 5) }])
		expect(diffHeap(max, { type: 'max', values: heapify(max.values, 'max').values })).toEqual([{ op: 'build' }])
		expect(diffHeap(heap, { ...heap, values: v(2, 3, 4) })).toEqual([{ op: 'assign', type: 'min', values: v(2, 3, 4) }])
		expect(diffHeap(heap, { ...heap })).toEqual([])
	})

	it("an operation's value and index, as what it did tells them", () => {
		expect(heapArgs(heap, { ...heap, values: heapInsert(heap.values, '2', 'min').values })).toEqual({ value: '2' })
		expect(heapArgs(heap, { ...heap, values: heapRemoveAt(heap.values, 1, 'min').values })).toEqual({ i: '1' })
		// Repeated values: an index whose removal leaves this heap.
		const twos: HeapState = { type: 'min', values: v(1, 2, 2, 7, 8, 9) }
		const after = heapRemoveAt(twos.values, 2, 'min').values
		const { i } = heapArgs(twos, { ...twos, values: after })
		expect(heapRemoveAt(twos.values, Number(i), 'min').values).toEqual(after)
	})

	it("written out: a MinHeap over its array, its operations called as the heap's own code declares them", () => {
		const log: HeapMove[] = [
			{ op: 'new', name: 'h', type: 'min', values: heap.values },
			{ op: 'set', i: 4, v: '0' },
			{ op: 'shuffle', values: v(4, 1, 3, 0, 8) },
			{ op: 'call', algorithm: heapCode('build', 'min'), label: 'build heap', effect: [] },
			{ op: 'call', algorithm: heapCode('insert', 'min'), label: 'insert into heap', effect: [], args: { value: '2' } },
			{ op: 'call', algorithm: heapCode('extract', 'min'), label: 'remove from heap', effect: [], args: { i: '0' } },
			{ op: 'call', algorithm: heapCode('remove', 'min'), label: 'remove from heap', effect: [], args: { i: '2' } },
			{ op: 'assign', type: 'max', values: v(1, 2, 3) },
			{ op: 'build' },
			{ op: 'call', algorithm: heapCode('extract', 'max'), label: 'remove from heap', effect: [], args: { i: '0' } },
		]
		expect(renderHeapLog(log, 'python').split('\n')).toEqual([
			'h = MinHeap([1, 3, 4, 8, 5])',
			'h.heap[4] = 0',
			'random.shuffle(h.heap)    # came out [4, 1, 3, 0, 8]',
			'h.build_heap()',
			'h.insert(2)',
			'h.extract_min()',
			'h.remove_at(2)',
			'h = MaxHeap([1, 2, 3])',
			'h.build_heap()',
			'h.extract_max()',
		])
		expect(renderHeapLog(log, 'java').split('\n')).toEqual([
			'Heap h = new MinHeap(1, 3, 4, 8, 5);',
			'h.heap[4] = 0;',
			'shuffle(h.heap, h.size);    // came out {4, 1, 3, 0, 8}',
			'h.buildHeap();',
			'h.insert(2);',
			'h.extractMin();',
			'h.removeAt(2);',
			'h = new MaxHeap(1, 2, 3);',
			'h.buildHeap();',
			'h.extractMax();',
		])
		expect(renderHeapLog(log, 'c').split('\n')).toEqual([
			'Heap *h = newMinHeap(5, (int[]){1, 3, 4, 8, 5});',
			'h->a[4] = 0;',
			'shuffle(h->a, h->size);    // came out {4, 1, 3, 0, 8}',
			'buildHeap(h);',
			'insert(h, 2);',
			'extractMin(h);',
			'removeAt(h, 2);',
			'h = newMaxHeap(3, (int[]){1, 2, 3});',
			'buildHeap(h);',
			'extractMax(h);',
		])
	})

	it('text values are quoted', () => {
		expect(renderHeapLog([{ op: 'new', name: 'h', type: 'min', values: ['B', 'K'] }], 'c')).toBe('Heap *h = newMinHeap(2, (const char *[]){"B", "K"});')
	})
})

describe('a hash table change as the move a teacher made', () => {
	const mod = { code: 'sum', compress: 'mod' } as const
	const chained = (keys: string[], m = 7): HashState => ({ strategy: 'chaining', ...mod, buckets: buildTable(keys, m, { strategy: 'chaining', ...mod }) })
	const probed = (keys: string[], m = 7): HashState => ({ strategy: 'probing', ...mod, buckets: buildTable(keys, m, { strategy: 'probing', ...mod }) })
	// 8 and 15 in bucket 1, 3 and 10 in bucket 3.
	const table = chained(v(8, 15, 3, 10))
	const at = (s: HashState, b: number, bucket: string[]): HashState => ({ ...s, buckets: s.buckets.map((x, i) => (i === b ? bucket : x)) })

	it('a key typed over another or away (in a chain at its place, in a slot), the table grown and rehashed', () => {
		expect(diffHash(table, at(table, 1, v(8, 22)))).toEqual([{ op: 'set', b: 1, at: 1, key: '22' }])
		expect(diffHash(table, at(table, 1, v(15)))).toEqual([{ op: 'clear', b: 1, at: 0 }])
		expect(diffHash(table, at(table, 3, v(3)))).toEqual([{ op: 'clear', b: 3, at: 1 }])
		const slots = probed(v(8, 15))
		expect(diffHash(slots, at(slots, 4, v(9)))).toEqual([{ op: 'set', b: 4, at: 0, key: '9' }])
		expect(diffHash(slots, at(slots, 2, []))).toEqual([{ op: 'clear', b: 2, at: 0 }])
		expect(diffHash(table, { ...table, buckets: rehash(table.buckets, 'chaining').buckets! })).toEqual([{ op: 'rehash' }])
	})

	it('another scheme: a new table, its keys put in in the order they had', () => {
		const mad = { ...table, compress: 'mad' as const, buckets: buildTable(entriesOf(table.buckets), 7, { strategy: 'chaining', code: 'sum', compress: 'mad' }) }
		expect(diffHash(table, mad)).toEqual([{ op: 'assign', table: { strategy: 'chaining', code: 'sum', compress: 'mad', m: 7, keys: v(8, 15, 3, 10) } }])
	})

	it('a table as keys put in, in an order checked to give it; else laid out as it is', () => {
		// 9 collided with 4 and wrapped round to slot 0: it goes in after 4.
		expect(tableOf(probed(v(4, 9), 5))).toEqual({ strategy: 'probing', ...mod, m: 5, keys: v(4, 9) })
		// A deleted marker, or a key in a bucket that isn't its hash: no order of inserts gives it.
		const deleted = { ...probed(v(8, 15)), buckets: deleteKey(probed(v(8, 15)).buckets, 'probing', '8').buckets! }
		expect(tableOf(deleted)).toEqual({ strategy: 'probing', ...mod, m: 7, buckets: [[], [TOMBSTONE], ['15'], [], [], [], []] })
		expect('buckets' in tableOf(at(table, 0, v(5)))).toBe(true)
	})

	it("an operation's key, as what it did tells it", () => {
		const slots = probed(v(8, 15))
		expect(hashArgs(slots, { ...slots, buckets: insertEntry(slots.buckets, 'probing', '22').buckets! })).toEqual({ key: '22' })
		expect(hashArgs(slots, { ...slots, buckets: deleteKey(slots.buckets, 'probing', '15').buckets! })).toEqual({ key: '15' })
	})

	it("written out: a ChainingHashTable or ProbingHashTable with its keys put in, its operations called as the table's own code declares them", () => {
		const id = (op: 'insert' | 'delete' | 'rehash') => hashCodeId(op, { strategy: 'chaining', ints: true, ...mod })
		const log: HashMove[] = [
			{ op: 'new', name: 't', table: { strategy: 'chaining', ...mod, m: 7, keys: v(8, 15, 3, 10) } },
			{ op: 'set', b: 1, at: 1, key: '22' },
			{ op: 'clear', b: 3, at: 1 },
			{ op: 'clear', b: 1, at: 0 },
			{ op: 'call', algorithm: id('insert'), label: 'insert', effect: [], args: { key: '5' } },
			{ op: 'call', algorithm: id('delete'), label: 'delete', effect: [], args: { key: '3' } },
			{ op: 'call', algorithm: id('rehash'), label: 'rehash', effect: [{ op: 'rehash' }] },
			{ op: 'assign', table: { strategy: 'probing', code: 'sum', compress: 'mad', m: 17, keys: v(5, 22) } },
			{ op: 'set', b: 3, at: 0, key: '9' },
			{ op: 'clear', b: 3, at: 0 },
		]
		expect(renderHashLog(log, 'python').split('\n')).toEqual([
			't = ChainingHashTable(7, [8, 15, 3, 10])',
			't.table[1].next.key = 22',
			't.table[3].next = t.table[3].next.next',
			't.table[1] = t.table[1].next',
			't.insert(5)',
			't.remove(3)',
			't.rehash()',
			't = ProbingHashTable(17, [5, 22])    # index: the key, MAD',
			't.table[3] = 9',
			't.table[3] = None',
		])
		expect(renderHashLog(log, 'java').split('\n')).toEqual([
			'HashTable t = new ChainingHashTable(7, 8, 15, 3, 10);',
			't.table[1].next.key = 22;',
			't.table[3].next = t.table[3].next.next;',
			't.table[1] = t.table[1].next;',
			't.insert(5);',
			't.remove(3);',
			't.rehash();',
			't = new ProbingHashTable(17, 5, 22);    // index: the key, MAD',
			't.table[3] = 9;',
			't.table[3] = null;',
		])
		expect(renderHashLog(log, 'c').split('\n')).toEqual([
			'Table *t = newTable(7, 4, (int[]){8, 15, 3, 10});',
			't->table[1]->next->key = 22;',
			't->table[3]->next = t->table[3]->next->next;',
			't->table[1] = t->table[1]->next;',
			'insert(t, 5);',
			'removeKey(t, 3);',
			'rehash(t);',
			't = newTable(17, 2, (int[]){5, 22});    // index: the key, MAD',
			't->slots[3] = (Slot){FULL, 9};',
			't->slots[3].state = EMPTY;',
		])
	})

	it('text keys quoted (Python takes an integer key as an integer), the hash code named; a table no inserts give, laid out', () => {
		const words: HashMove[] = [{ op: 'new', name: 't', table: { strategy: 'chaining', code: 'java', compress: 'mod', m: 7, keys: ['cat', '5'] } }]
		expect(renderHashLog(words, 'python')).toBe('t = ChainingHashTable(7, ["cat", 5])    # index: Java\'s hashCode, mod m')
		expect(renderHashLog(words, 'java')).toBe('HashTable t = new ChainingHashTable(7, "cat", "5");    // index: Java\'s hashCode, mod m')
		const odd: HashMove[] = [{ op: 'new', name: 't', table: { strategy: 'probing', ...mod, m: 5, buckets: [['5'], [], [TOMBSTONE], [], []] } }]
		expect(renderHashLog(odd, 'python').split('\n')).toEqual(['t = ProbingHashTable(5)    # laid out as it is: no order of inserts gives it', 't.table[0] = 5', 't.table[2] = DELETED'])
		expect(renderHashLog(odd, 'c').split('\n').slice(1)).toEqual(['t->slots[0] = (Slot){FULL, 5};', 't->slots[2].state = DELETED;'])
		const chains: HashMove[] = [{ op: 'new', name: 't', table: { strategy: 'chaining', ...mod, m: 7, buckets: [['5', '12'], [], [], [], [], [], []] } }]
		expect(renderHashLog(chains, 'java').split('\n')[1]).toBe('t.table[0] = new Node(5, new Node(12));')
	})

	it('grown past the 31 buckets drawds draws: the table it made, not what rehash() would', () => {
		const log: HashMove[] = [
			{ op: 'new', name: 't', table: { strategy: 'chaining', ...mod, m: 17, keys: v(3) } },
			{ op: 'call', algorithm: hashCodeId('rehash', { strategy: 'chaining', ints: true, ...mod }), label: 'rehash', effect: [{ op: 'assign', table: { strategy: 'chaining', ...mod, m: 31, keys: v(3) } }] },
		]
		expect(renderHashLog(log, 'python').split('\n').slice(1)).toEqual(['# rehash into 31 buckets, the most drawds draws (not next_prime(2 * m + 1)):', 't = ChainingHashTable(31, [3])'])
	})
})

describe('a matrix change as the move a teacher made', () => {
	const m = [v(1, 2, 3), v(4, 5, 6)]

	it('a value typed, rows and columns added at the end or put in, taken off the end or out, transposed', () => {
		expect(diffGrid(m, [v(1, 2, 3), v(4, 42, 6)])).toEqual([{ op: 'set', r: 1, c: 1, v: '42' }])
		expect(diffGrid(m, [...m, v(7, 8, 9), v(0, 0, 0)])).toEqual([
			{ op: 'appendRow', values: v(7, 8, 9) },
			{ op: 'appendRow', values: v(0, 0, 0) },
		])
		expect(diffGrid(m, insertRow(m, 1, v(7, 8, 9)))).toEqual([{ op: 'insertRow', at: 1, values: v(7, 8, 9) }])
		expect(diffGrid(m, [m[0]])).toEqual([{ op: 'deleteRow', at: 1 }])
		expect(diffGrid(m, [m[1]])).toEqual([{ op: 'deleteRow', at: 0 }])
		expect(diffGrid(m, insertCol(m, 3, v(7, 8)))).toEqual([{ op: 'appendCol', values: v(7, 8) }])
		expect(diffGrid(m, insertCol(m, 1, v(7, 8)))).toEqual([{ op: 'insertCol', at: 1, values: v(7, 8) }])
		expect(diffGrid(m, [v(1), v(4)])).toEqual([
			{ op: 'deleteCol', at: 2 },
			{ op: 'deleteCol', at: 1 },
		])
		expect(diffGrid(m, deleteCol(m, 0))).toEqual([{ op: 'deleteCol', at: 0 }])
		expect(diffGrid(m, transpose(m))).toEqual([{ op: 'transpose' }])
		expect(diffGrid(m, [v(9, 9, 9), v(9, 9, 9)])).toEqual([{ op: 'assign', values: [v(9, 9, 9), v(9, 9, 9)] }])
	})

	it('replaying a log gives the values it describes', () => {
		const log: MatrixMove[] = [
			{ op: 'new', name: 'a', values: m },
			...diffGrid(m, insertCol(m, 1, v(7, 8))),
			{ op: 'transpose' },
			{ op: 'deleteRow', at: 0 },
		]
		expect(replayGrid(log)).toEqual(deleteRow(transpose(insertCol(m, 1, v(7, 8))), 0))
	})

	it('written out: Python a list of rows, Java an int[][] made anew when its shape changes, C a matrix type', () => {
		const log: MatrixMove[] = [
			{ op: 'new', name: 'a', values: m },
			{ op: 'set', r: 1, c: 1, v: '42' },
			{ op: 'appendRow', values: v(7, 8, 9) },
			{ op: 'insertRow', at: 0, values: v(0, 0, 0) },
			{ op: 'deleteRow', at: 1 },
			{ op: 'appendCol', values: v(1, 2, 3) },
			{ op: 'insertCol', at: 1, values: v(4, 5, 6) },
			{ op: 'deleteCol', at: 0 },
			{ op: 'transpose' },
			{ op: 'assign', values: [v(1, 2)] },
		]
		expect(renderMatrixLog(log, 'python').split('\n')).toEqual([
			'a = [[1, 2, 3], [4, 5, 6]]',
			'a[1][1] = 42',
			'a.append([7, 8, 9])',
			'a.insert(0, [0, 0, 0])',
			'del a[1]',
			'for row, v in zip(a, [1, 2, 3]): row.append(v)',
			'for row, v in zip(a, [4, 5, 6]): row.insert(1, v)',
			'for row in a: del row[0]',
			'a = [list(row) for row in zip(*a)]',
			'a = [[1, 2]]',
		])
		expect(renderMatrixLog(log, 'java').split('\n')).toEqual([
			'int[][] a = {{1, 2, 3}, {4, 5, 6}};',
			'a[1][1] = 42;',
			'a = insertRow(a, a.length, new int[]{7, 8, 9});',
			'a = insertRow(a, 0, new int[]{0, 0, 0});',
			'a = deleteRow(a, 1);',
			'a = insertCol(a, a[0].length, new int[]{1, 2, 3});',
			'a = insertCol(a, 1, new int[]{4, 5, 6});',
			'a = deleteCol(a, 0);',
			'a = transpose(a);',
			'a = new int[][]{{1, 2}};',
		])
		const c = renderMatrixLog(log, 'c').split('\n')
		expect(c.slice(0, 3)).toEqual(['IntMatrix a = matrixOf(2, 3, (int[2][3]){{1, 2, 3}, {4, 5, 6}});', 'a.cells[1][1] = 42;', 'insertRow(&a, a.rows, (int[]){7, 8, 9});'])
		expect(c.slice(-2)).toEqual(['transpose(&a);', 'a = matrixOf(1, 2, (int[1][2]){{1, 2}});'])
	})

	it('text is quoted; an empty cell in Java makes it an Integer[][]', () => {
		expect(renderMatrixLog([{ op: 'new', name: 'a', values: [['x', 'y']] }], 'java')).toBe('String[][] a = {{"x", "y"}};')
		expect(renderMatrixLog([{ op: 'new', name: 'a', values: [v(1, '')] }], 'java')).toBe('Integer[][] a = {{1, null}};')
		expect(renderMatrixLog([{ op: 'new', name: 'a', values: [v(1, '')] }], 'python')).toBe('a = [[1, None]]')
	})
})

describe('a union-find change as the move a teacher made', () => {
	const start: UnionFindState = { ...singletons(4), by: 'size', compress: true }
	// 0 under 1, 2 under 3: two sets (by size: the ranks stay 0).
	const two: UnionFindState = { ...start, ...union(union(singletons(4), 0, 1, 'size').forest, 2, 3, 'size').forest }

	it('how union and find work, an element added, a parent typed (and the roots it recounts); else the new arrays', () => {
		expect(diffUnionFind(start, { ...start, by: 'rank', compress: false })).toEqual([{ op: 'by', by: 'rank' }, { op: 'compress', on: false }])
		expect(diffUnionFind(start, { ...start, ...singletons(5) })).toEqual([{ op: 'makeSet' }])
		// parent[3] = 1 by hand: 3's set goes under 1, whose size and rank are recounted.
		const parent = two.parent.map((p, i) => (i === 3 ? 1 : p))
		expect(diffUnionFind(two, { ...two, parent, ...recount(parent) })).toEqual([{ op: 'parent', i: 3, p: 1, size: [[1, 4]], rank: [[1, 2]] }])
		// Cut 0 off: a new root, its counts written whatever they were; 3's rank recounted as its height.
		const cut = two.parent.map((p, i) => (i === 0 ? 0 : p))
		expect(diffUnionFind(two, { ...two, parent: cut, ...recount(cut) })).toEqual([{ op: 'parent', i: 0, p: 0, size: [[0, 1], [1, 1]], rank: [[0, 0], [3, 1]] }])
		expect(diffUnionFind(two, start)).toEqual([{ op: 'assign', state: start }])
	})

	it('written out: a UnionFind, its arrays as its code keeps them, union and find called as its code declares them', () => {
		const log: UnionFindMove[] = [
			{ op: 'new', name: 'u', state: start },
			{ op: 'call', algorithm: unionFindCode('union', 'size', true), label: 'union(0, 1)', effect: [], args: { a: '0', b: '1' } },
			{ op: 'call', algorithm: unionFindCode('find', 'size', true), label: 'find(C)', effect: [], args: { i: '2' } },
			{ op: 'by', by: 'rank' },
			{ op: 'compress', on: false },
			{ op: 'makeSet' },
			{ op: 'parent', i: 3, p: 1, size: [[1, 4]], rank: [[1, 2]] },
			{ op: 'assign', state: two },
		]
		expect(renderUnionFindLog(log, 'python').split('\n')).toEqual([
			'u = UnionFind(4)',
			'u.union(0, 1)',
			'u.find(2)    # find(C)',
			"u.by = 'rank'",
			'u.compress = False',
			'u.make_set()',
			'u.parent[3] = 1',
			'u.size[1] = 4',
			'u.rank[1] = 2',
			'u.parent = [1, 1, 3, 3]',
			'u.size = [1, 2, 1, 2]',
			'u.rank = [0, 0, 0, 0]',
		])
		expect(renderUnionFindLog(log, 'java').split('\n').slice(0, 6)).toEqual(['UnionFind u = new UnionFind(4);', 'u.union(0, 1);', 'u.find(2);    // find(C)', 'u.by = By.RANK;', 'u.compress = false;', 'u.makeSet();'])
		const c = renderUnionFindLog(log, 'c').split('\n')
		expect(c.slice(0, 7)).toEqual(['UF *u = newUF(4);', 'unite(u, 0, 1);', 'find(u, 2);    // find(C)', 'u->by = BY_RANK;', 'u->compress = false;', 'makeSet(u);', 'u->parent[3] = 1;'])
		expect(c.at(-1)).toBe('memcpy(u->rank, (int[]){0, 0, 0, 0}, 4 * sizeof(int));')
	})

	it("back to union by size after unions by rank or naively: the sizes drawds kept, which their code didn't add up", () => {
		const back: UnionFindMove = { op: 'by', by: 'size', sizes: [1, 2, 1, 1] }
		const naive: UnionFindMove[] = [{ op: 'new', name: 'u', state: start }, { op: 'by', by: 'naive' }]
		const joined: UnionFindMove = { op: 'call', algorithm: unionFindCode('union', 'naive', true), label: 'union(0, 1)', effect: [], args: { a: '0', b: '1' } }
		expect(renderUnionFindLog([...naive, joined, back], 'python').split('\n').slice(-2)).toEqual(["u.by = 'size'", 'u.size = [1, 2, 1, 1]'])
		// No union in between: nothing to catch up.
		expect(renderUnionFindLog([...naive, back], 'python').split('\n').at(-1)).toBe("u.by = 'size'")
	})

	it('every element on its own again: a new one, told how it unions', () => {
		const rank: UnionFindState = { ...start, by: 'naive' }
		expect(renderUnionFindLog([{ op: 'new', name: 'u', state: two }, { op: 'assign', state: rank }], 'python').split('\n').slice(-2)).toEqual(['u = UnionFind(4)', "u.by = 'naive'"])
	})
})

describe('a stack or queue change as the move a teacher made', () => {
	const stack = (values: string[], capacity = 5): ArrayLogState => ({ values, fixed: { as: 'stack', capacity, front: 0 } })
	const queue = (values: string[], front = 0, capacity = 5): ArrayLogState => ({ values, fixed: { as: 'queue', capacity, front } })

	it("an ArrayStack's push, pop and a value typed; an ArrayQueue's enqueue, dequeue (front moving on) and a value typed at its place", () => {
		expect(diffArray(stack(v(3, 1)), stack(v(3, 1, 4)))).toEqual([{ op: 'push', v: '4' }])
		expect(diffArray(stack(v(3, 1)), stack(v(3)))).toEqual([{ op: 'pop' }])
		expect(diffArray(stack(v(3, 1)), stack(v(3, 9)))).toEqual([{ op: 'set', i: 1, v: '9' }])
		expect(diffArray(queue(v(3, 1), 4), queue(v(3, 1, 4), 4))).toEqual([{ op: 'enqueue', v: '4' }])
		expect(diffArray(queue(v(3, 1), 4), queue(v(1), 0))).toEqual([{ op: 'dequeue' }])
		// An empty buffer whose front moved round dequeued nothing: built anew (where its front is).
		expect(diffArray(queue([], 4), queue([], 0))).toEqual([{ op: 'assign', values: [], fixed: { as: 'queue', capacity: 5, front: 0 } }])
		// The queue's second value sits at (4 + 1) % 5 = 0.
		expect(diffArray(queue(v(3, 1), 4), queue(v(3, 9), 4))).toEqual([{ op: 'set', i: 0, v: '9' }])
		// Another capacity, another kind: built anew. A list (a growing stack too) as an array.
		expect(diffArray(stack(v(3, 1)), stack(v(3, 1), 8))).toEqual([{ op: 'assign', values: v(3, 1), fixed: { as: 'stack', capacity: 8, front: 0 } }])
		expect(diffArray({ values: v(3, 1) }, { values: v(3, 1, 4) })).toEqual([{ op: 'append', v: '4' }])
	})

	it('written out: lecture 6’s ArrayStack and ArrayQueue, made with their capacity and values', () => {
		const log: ArrayMove[] = [
			{ op: 'new', name: 's', values: v(3, 1), fixed: { as: 'stack', capacity: 5, front: 0 } },
			{ op: 'call', algorithm: 'stack-push', label: 'push', effect: [{ op: 'push', v: '4' }] },
			{ op: 'call', algorithm: 'stack-pop', label: 'pop', effect: [{ op: 'pop' }] },
			{ op: 'set', i: 1, v: '9' },
		]
		expect(renderArrayLog(log, 'python').split('\n')).toEqual(['s = ArrayStack(5, [3, 1])', 's.push(4)', 's.pop()', 's.a[1] = 9'])
		expect(renderArrayLog(log, 'java').split('\n')).toEqual(['ArrayStack s = new ArrayStack(5, 3, 1);', 's.push(4);', 's.pop();', 's.a[1] = 9;'])
		expect(renderArrayLog(log, 'c').split('\n')).toEqual(['Stack *s = newStack(5, 2, (int[]){3, 1});', 'push(s, 4);', 'pop(s);', 's->a[1] = 9;'])
		const q: ArrayMove[] = [
			{ op: 'new', name: 'q', values: v(3, 1), fixed: { as: 'queue', capacity: 4, front: 0 } },
			{ op: 'enqueue', v: '4' },
			{ op: 'dequeue' },
			{ op: 'assign', values: v(7, 8), fixed: { as: 'queue', capacity: 4, front: 3 } },
		]
		expect(renderArrayLog(q, 'python').split('\n')).toEqual([
			'q = ArrayQueue(4, [3, 1])',
			'q.enqueue(4)',
			'q.dequeue()',
			'q = ArrayQueue(4)    # its front moved on: laid out as it is',
			'q.a = [8, None, None, 7]',
			'q.front, q.rear, q.size = 3, 1, 2',
		])
		expect(renderArrayLog(q, 'c').split('\n').slice(-3)).toEqual([
			'q = newQueue(4, 0, NULL);    // its front moved on: laid out as it is',
			'memcpy(q->a, (int[]){8, 0, 0, 7}, 4 * sizeof(int));',
			'q->front = 3; q->rear = 1; q->size = 2;',
		])
	})

	it('a linked stack: in at the top and out from it; a linked queue: in at the rear, out from the front', () => {
		const st = (ids: string, kind: 'stack' | 'queue' = 'stack'): ListState => ({ ids: [...ids], values: [...ids].map((c) => String(c.charCodeAt(0) - 96)), cycle: null, kind })
		expect(diffList(st('bc'), st('abc'))).toEqual([{ op: 'push', v: '1' }])
		expect(diffList(st('abc'), st('bc'))).toEqual([{ op: 'pop' }])
		expect(diffList(st('ab', 'queue'), st('abc', 'queue'))).toEqual([{ op: 'enqueue', v: '3' }])
		expect(diffList(st('ab', 'queue'), st('b', 'queue'))).toEqual([{ op: 'dequeue' }])
		// In at the front: not what a queue does, so built anew.
		expect(diffList(st('ab', 'queue'), st('cab', 'queue'))).toEqual([{ op: 'assign', values: v(3, 1, 2), kind: 'queue' }])
		expect(diffList({ ...st('ab'), kind: undefined }, st('ab'))).toEqual([{ op: 'assign', values: v(1, 2), kind: 'stack' }])
	})

	it('written out: a LinkedStack (top first, as drawn) and a LinkedQueue, as their code calls them', () => {
		const log: ListMove[] = [
			{ op: 'new', name: 's', values: v(3, 1), kind: 'stack' },
			{ op: 'call', algorithm: 'linked-push', label: 'push', effect: [{ op: 'push', v: '4' }] },
			{ op: 'pop' },
			{ op: 'set', i: 1, v: '9' },
		]
		expect(renderListLog(log, 'python').split('\n')).toEqual(['s = LinkedStack([3, 1])    # top first', 's.push(4)', 's.pop()', 's.top.next.value = 9'])
		expect(renderListLog(log, 'c').split('\n')).toEqual(['Stack *s = stackOf(2, (int[]){3, 1});    // top first', 'push(s, 4);', 'pop(s);', 's->top->next->value = 9;'])
		const q: ListMove[] = [{ op: 'new', name: 'q', values: [], kind: 'queue' }, { op: 'enqueue', v: '5' }, { op: 'dequeue' }]
		expect(renderListLog(q, 'java').split('\n')).toEqual(['LinkedQueue q = new LinkedQueue();', 'q.enqueue(5);', 'q.dequeue();'])
	})
})
