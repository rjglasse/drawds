/// <reference types="node" />
import { execFileSync, spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { ARRAY_CODE } from '../shapes/array/code'
import { hashCodeId } from '../shapes/hash/code'
import { buildTable } from '../shapes/hash/hash'
import { heapCode } from '../shapes/heap/code'
import { unionFindCode } from '../shapes/union-find/code'
import type { ArrayMove } from './array-moves'
import type { GraphMove } from './graph-moves'
import type { HashMove } from './hash-moves'
import type { HeapMove } from './heap-moves'
import type { ListMove } from './list-moves'
import type { MatrixMove } from './matrix-moves'
import { boardScript, type Logged } from './script'
import type { TreeMove, TreeShape } from './tree-moves'
import { diffGeneralTree, generalShapeOf, type GeneralTreeMove } from './general-tree-moves'
import { generateGeneralTree } from '../shapes/general-tree/generate'
import { appendChild, moveAmongSiblings, removeGeneralSubtree, siblingPlace } from '../shapes/general-tree/model'
import { mulberry32 } from '../data/random'
import type { TreeNode } from '../shapes/tree/tree-shape-types'
import type { UnionFindMove } from './union-find-moves'

// The board's script, run by python3: every kind's code beside it, with the classes the script puts
// first, leaves the structure as drawds has it.

const hasPython = spawnSync('python3', ['--version']).status === 0

/** What the script prints, a line per structure: `name = value`, as a map. */
function run(structures: Logged[]): Record<string, string> {
	const out = execFileSync('python3', ['-'], { input: boardScript(structures), encoding: 'utf8' })
	return Object.fromEntries(
		out
			.trim()
			.split('\n')
			.map((line) => {
				const at = line.indexOf(' = ')
				return [line.slice(0, at), line.slice(at + 3)]
			})
	)
}

const v = (...xs: (number | string)[]) => xs.map(String)
const array = (log: ArrayMove[], kind = 'array'): Logged => ({ shape: { type: 'array', props: { kind } }, log })
const node = (value: number, l: TreeShape = null, r: TreeShape = null): TreeShape => ({ v: String(value), l, r })

/** Python's repr of a list of ints and strings. */
const repr = (xs: readonly (string | number | null)[]): string =>
	`[${xs.map((x) => (x === null ? 'None' : typeof x === 'number' || /^-?\d+$/.test(x) ? String(Number(x)) : `'${x}'`)).join(', ')}]`

describe.skipIf(!hasPython)('the board as one Python script', () => {
	it("every sort's code, as drawds shows it, sorts: the functions come with the script", () => {
		const sorts = Object.keys(ARRAY_CODE).filter((id) => /(^|-)sort$|^quicksort/.test(id) && id !== 'all-unique-sorted')
		expect(sorts.length).toBeGreaterThan(5)
		const boards = sorts.map((algorithm, k) =>
			array([
				{ op: 'new', name: `a${k}`, values: v(5, 3, 8, 1, 9, 2) },
				{ op: 'call', algorithm, label: algorithm, effect: [{ op: 'sort' }] },
			])
		)
		const shuffled = array([
			{ op: 'new', name: 'r', values: v(1, 2, 3) },
			{ op: 'shuffle', values: v(3, 1, 2) },
		])
		const out = run([...boards, shuffled])
		sorts.forEach((_, k) => expect(out[`a${k}`]).toBe('[1, 2, 3, 5, 8, 9]'))
		// A shuffle can't come out the same twice: the board's order is put after it.
		expect(out.r).toBe('[3, 1, 2]')
	})

	it('linked lists, stacks and queues, fixed and linked: their own methods, a cycle printed once', () => {
		const list: ListMove[] = [
			{ op: 'new', name: 'b', values: v(3, 1, 4) },
			{ op: 'set', i: 1, v: '42' },
			{ op: 'insertAtHead', v: '5' },
			{ op: 'append', v: '9' },
			{ op: 'insert', i: 2, v: '7' },
			{ op: 'remove', i: 0, v: '5', first: true },
			{ op: 'reverse' },
			{ op: 'call', algorithm: 'list-insert-tail', label: 'insert', effect: [{ op: 'insert', i: 1, v: '8' }] },
			{ op: 'call', algorithm: 'list-reverse-tail', label: 'reverse', effect: [{ op: 'reverse' }] },
			{ op: 'remove', i: 2, v: '42', first: false },
			{ op: 'cycle', last: 4, to: 1 },
		]
		const out = run([
			{ shape: { type: 'linked-list', props: {} }, log: list },
			array(
				[
					{ op: 'new', name: 's', values: v(3, 1), fixed: { as: 'stack', capacity: 5, front: 0 } },
					{ op: 'push', v: '4' },
					{ op: 'pop' },
					{ op: 'set', i: 1, v: '9' },
				],
				'stack'
			),
			array(
				[
					{ op: 'new', name: 'q', values: v(3, 1), fixed: { as: 'queue', capacity: 4, front: 0 } },
					{ op: 'enqueue', v: '4' },
					{ op: 'dequeue' },
				],
				'queue'
			),
			{
				shape: { type: 'linked-list', props: {} },
				log: [{ op: 'new', name: 'ls', values: v(3, 1), kind: 'stack' }, { op: 'push', v: '4' }, { op: 'pop' }, { op: 'set', i: 1, v: '9' }],
			},
			{ shape: { type: 'linked-list', props: {} }, log: [{ op: 'new', name: 'lq', values: v(3, 1), kind: 'queue' }, { op: 'enqueue', v: '4' }, { op: 'dequeue' }] },
		])
		expect(out.b).toBe("LinkedList([3, 7, 4, 8, 9, '... back to 7'])")
		expect(out.s).toBe('ArrayStack(5, [3, 9])')
		expect(out.q).toBe('ArrayQueue(4, [1, 4])')
		expect(out.ls).toBe('LinkedStack([3, 9])')
		expect(out.lq).toBe('LinkedQueue([1, 4])')
	})

	it("binary trees and BSTs: a BST's insert and delete its own code; a hash chain laid out beside a tree's nodes", () => {
		const bst: TreeMove[] = [
			{ op: 'new', name: 't', tree: node(8, node(3, node(1), node(6)), node(10, null, node(14))) },
			{ op: 'set', path: 'LR', v: '7' },
			{ op: 'add', path: 'RL', v: '9' },
			{ op: 'call', algorithm: 'bst-insert', label: 'insert', effect: [], args: { key: '5' } },
			{ op: 'call', algorithm: 'bst-delete', label: 'delete', effect: [], args: { node: 'R' } },
		]
		const plain: TreeMove[] = [
			{ op: 'new', name: 'p', tree: node(1, node(2), node(3)) },
			{ op: 'swap', path: '' },
			{ op: 'mirror', path: '' },
			{ op: 'remove', path: 'L', v: '2' },
		]
		const laidOut: HashMove[] = [{ op: 'new', name: 'h', table: { strategy: 'chaining', code: 'sum', compress: 'mod', m: 5, buckets: [v(10, 3), [], [], [], []] } }]
		const out = run([
			{ shape: { type: 'binary-tree', props: { kind: 'bst' } }, log: bst },
			{ shape: { type: 'binary-tree', props: {} }, log: plain },
			{ shape: { type: 'hash-table', props: {} }, log: laidOut },
		])
		// 10 (two children) goes: 14, its right child, takes its place with 9 under it.
		expect(out.t).toBe('Tree(Node(8, Node(3, Node(1), Node(7, Node(5), None)), Node(14, Node(9), None)))')
		expect(out.p).toBe('Tree(Node(1, None, Node(3)))')
		expect(out.h).toBe('ChainingHashTable(5, [[10, 3], [], [], [], []])')
	})

	it('general trees: a Node and its children, TreeNode beside a list\'s nodes; random edits rebuild the drawn tree', () => {
		const fs: GeneralTreeMove[] = [
			{ op: 'new', name: 'g', tree: { v: '/', c: [{ v: 'bin', c: [] }, { v: 'home', c: [{ v: 'alice', c: [] }] }] } },
			{ op: 'add', path: '1.1', v: 'bob' },
			{ op: 'set', path: '0', v: 'etc' },
			{ op: 'swap', path: '', i: 0, j: 1 },
			{ op: 'remove', path: '0.0', v: 'alice' },
		]
		const alone = run([{ shape: { type: 'general-tree', props: {} }, log: fs }])
		expect(alone.g).toBe("Node('/', [Node('home', [Node('bob')]), Node('etc')])")
		const beside = run([
			{ shape: { type: 'general-tree', props: {} }, log: fs },
			{ shape: { type: 'linked-list', props: {} }, log: [{ op: 'new', name: 'b', values: v(3, 1) }] },
		])
		expect(beside.g).toBe("TreeNode('/', [TreeNode('home', [TreeNode('bob')]), TreeNode('etc')])")
		expect(beside.b).toBe('LinkedList([3, 1])')

		// Random edits as a teacher makes them, each change read as moves: the script ends on the tree drawn.
		const reprOf = (nodes: readonly TreeNode[]): string => {
			const write = (t: { v: string; c: { v: string; c: unknown[] }[] }): string =>
				t.c.length ? `Node(${t.v}, [${t.c.map((c) => write(c as never)).join(', ')}])` : `Node(${t.v})`
			return write(generalShapeOf(nodes) as never)
		}
		const boards: Logged[] = []
		const expected: Record<string, string> = {}
		for (let k = 0; k < 60; k++) {
			const rng = mulberry32(k + 1)
			let nodes = generateGeneralTree(k + 1, 3, 0.6, 3, 'random')
			const log: GeneralTreeMove[] = [{ op: 'new', name: `t${k}`, tree: generalShapeOf(nodes) }]
			for (let step = 0; step < 12; step++) {
				const at = nodes[Math.floor(rng() * nodes.length)]
				const pick = rng()
				const place = siblingPlace(nodes, at.id)
				let next: TreeNode[]
				if (pick < 0.3) next = nodes.map((n) => (n.id === at.id ? { ...n, value: String(Math.floor(rng() * 100)) } : n))
				else if (pick < 0.6) next = appendChild(nodes, at.id, String(100 + step)).nodes
				else if (pick < 0.8 && place) next = removeGeneralSubtree(nodes, at.id)
				else if (place) next = moveAmongSiblings(nodes, at.id, rng() < 0.5 ? -1 : 1)
				else continue
				log.push(...diffGeneralTree(nodes, next))
				nodes = next
			}
			expect(log.some((m) => m.op === 'assign')).toBe(false)
			boards.push({ shape: { type: 'general-tree', props: {} }, log })
			expected[`t${k}`] = reprOf(nodes)
		}
		expect(run(boards)).toEqual(expected)
	})

	it("heaps, hash tables (a class per scheme), union-find, graphs and matrices: each as drawds' own model has it", () => {
		const heap: HeapMove[] = [
			{ op: 'new', name: 'h', type: 'min', values: v(1, 3, 4, 8, 5) },
			{ op: 'set', i: 4, v: '0' },
			{ op: 'shuffle', values: v(4, 1, 3, 0, 8) },
			{ op: 'call', algorithm: heapCode('build', 'min'), label: 'build heap', effect: [] },
			{ op: 'call', algorithm: heapCode('insert', 'min'), label: 'insert', effect: [], args: { value: '2' } },
			{ op: 'call', algorithm: heapCode('extract', 'min'), label: 'remove', effect: [], args: { i: '0' } },
			{ op: 'call', algorithm: heapCode('remove', 'min'), label: 'remove', effect: [], args: { i: '2' } },
		]
		const maxHeap: HeapMove[] = [
			{ op: 'new', name: 'x', type: 'max', values: v(1, 2, 3) },
			{ op: 'build' },
			{ op: 'call', algorithm: heapCode('extract', 'max'), label: 'remove', effect: [], args: { i: '0' } },
		]
		const sumMod = { code: 'sum', compress: 'mod' } as const
		const chaining = (op: 'insert' | 'delete' | 'rehash') => hashCodeId(op, { strategy: 'chaining', ints: true, ...sumMod })
		const chained: HashMove[] = [
			{ op: 'new', name: 'c', table: { strategy: 'chaining', ...sumMod, m: 7, keys: v(8, 15, 3, 10) } },
			{ op: 'set', b: 1, at: 1, key: '22' },
			{ op: 'clear', b: 3, at: 1 },
			{ op: 'clear', b: 1, at: 0 },
			{ op: 'call', algorithm: chaining('insert'), label: 'insert', effect: [], args: { key: '5' } },
			{ op: 'call', algorithm: chaining('delete'), label: 'delete', effect: [], args: { key: '3' } },
			{ op: 'call', algorithm: chaining('rehash'), label: 'rehash', effect: [{ op: 'rehash' }] },
		]
		const probing: HashMove[] = [
			{ op: 'new', name: 'pt', table: { strategy: 'probing', code: 'sum', compress: 'mad', m: 17, keys: v(5, 22) } },
			{ op: 'set', b: 3, at: 0, key: '9' },
			{ op: 'clear', b: 3, at: 0 },
		]
		const words = ['misused', 'horsemints', 'cat']
		const java: HashMove[] = [{ op: 'new', name: 'w', table: { strategy: 'chaining', code: 'java', compress: 'mod', m: 7, keys: words } }]
		const uf: UnionFindMove[] = [
			{ op: 'new', name: 'u', state: { parent: [0, 1, 2, 3], sizes: [1, 1, 1, 1], ranks: [0, 0, 0, 0], by: 'size', compress: true } },
			{ op: 'call', algorithm: unionFindCode('union', 'size', true), label: 'union', effect: [], args: { a: '0', b: '1' } },
			{ op: 'call', algorithm: unionFindCode('union', 'size', true), label: 'union', effect: [], args: { a: '2', b: '3' } },
			{ op: 'by', by: 'rank' },
			{ op: 'compress', on: false },
			{ op: 'call', algorithm: unionFindCode('union', 'rank', false), label: 'union', effect: [], args: { a: '0', b: '2' } },
			{ op: 'makeSet' },
			{ op: 'call', algorithm: unionFindCode('find', 'rank', false), label: 'find', effect: [], args: { i: '0' } },
			// Same set?: a call too, its finds as this kind's.
			{ op: 'call', algorithm: unionFindCode('connected', 'rank', false), label: 'connected', effect: [], args: { a: '0', b: '3' } },
		]
		const graph: GraphMove[] = [
			{ op: 'new', name: 'g', vertices: ['A', 'B'], edges: [['A', 'B', '4']] },
			{ op: 'addVertex', v: 'C' },
			{ op: 'addEdge', from: 'B', to: 'C', weight: '7' },
			{ op: 'weight', from: 'A', to: 'B', weight: '9' },
			{ op: 'rename', from: 'C', to: 'D' },
			{ op: 'removeEdge', from: 'A', to: 'B' },
			{ op: 'removeVertex', v: 'A' },
		]
		const digraph: GraphMove[] = [{ op: 'new', name: 'd', vertices: ['A', 'B', 'C'], edges: [['A', 'B', '1'], ['C', 'A', '1']] }]
		const matrix: MatrixMove[] = [
			{ op: 'new', name: 'm', values: [v(1, 2), v(3, 4)] },
			{ op: 'appendRow', values: v(5, 6) },
			{ op: 'appendCol', values: v(7, 8, 9) },
			{ op: 'transpose' },
			{ op: 'deleteRow', at: 0 },
			{ op: 'set', r: 0, c: 0, v: '0' },
		]
		const out = run([
			{ shape: { type: 'heap', props: {} }, log: heap },
			{ shape: { type: 'heap', props: {} }, log: maxHeap },
			{ shape: { type: 'hash-table', props: {} }, log: chained },
			{ shape: { type: 'hash-table', props: {} }, log: probing },
			{ shape: { type: 'hash-table', props: {} }, log: java },
			{ shape: { type: 'union-find', props: {} }, log: uf },
			{ shape: { type: 'graph', props: { weights: 'weighted' } }, log: graph },
			{ shape: { type: 'graph', props: { direction: 'directed' } }, log: digraph },
			{ shape: { type: 'matrix', props: {} }, log: matrix },
		])
		expect(out.h).toBe('MinHeap([1, 3, 8, 4])')
		expect(out.x).toBe('MaxHeap([2, 1])')
		// Rehashed into next_prime(2 * 7 + 1) = 17 buckets, 22 then 5 into bucket 5.
		expect(out.c).toBe(`ChainingHashTable(17, [${Array.from({ length: 17 }, (_, i) => (i === 5 ? '[22, 5]' : '[]')).join(', ')}])`)
		// A probing table's slots, a chaining table of words: as drawds' own model builds them.
		const slots = buildTable(v(5, 22), 17, { strategy: 'probing', code: 'sum', compress: 'mad' }).map((b) => (b.length ? Number(b[0]) : null))
		expect(out.pt).toBe(`ProbingHashTable(17, ${repr(slots)})`)
		const chains = buildTable(words, 7, { strategy: 'chaining', code: 'java', compress: 'mod' })
		expect(out.w).toBe(`ChainingHashTable2(7, [${chains.map(repr).join(', ')}])`)
		expect(out.u).toBe('UnionFind(parent=[1, 3, 3, 3, 4])')
		expect(out.g).toBe("Graph(['B', 'D'], edges=[('B', 'D', 7)])")
		expect(out.d).toBe("DiGraph(['A', 'B', 'C'], edges=[('A', 'B'), ('C', 'A')])")
		expect(out.m).toBe('[[0, 4, 6], [7, 8, 9]]')
	})

	it('names two structures apart when they share one, and imports random only when it shuffles', () => {
		const one = (values: string[]) => array([{ op: 'new', name: 'a', values }])
		const script = boardScript([one(v(1)), one(v(2))])
		expect(script).toContain('a = [1]')
		expect(script).toContain('a2 = [2]')
		expect(script).not.toContain('import random')
		expect(run([one(v(1)), one(v(2))])).toEqual({ a: '[1]', a2: '[2]' })
	})
})
