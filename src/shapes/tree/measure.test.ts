import { describe, expect, it } from 'vitest'
import { stateAt } from '../../nodelink/playback'
import { measureTree } from './measure'
import { bstBuild, bstExtreme, treeHeight } from './search'
import type { TreeNode } from './tree-shape-types'

// Lecture 8a's tree: A is the root with children B and C; B has D and E. D, E and C are leaves.
const node = (id: string, value: string, children: (string | null)[] = [null, null]): TreeNode => ({ id, value, children, dx: 0, dy: 0 })
const lecture = [node('a', 'A', ['b', 'c']), node('b', 'B', ['d', 'e']), node('c', 'C'), node('d', 'D'), node('e', 'E')]
// A node with one child: B has only a left child D.
const lopsided = [node('a', 'A', ['b', 'c']), node('b', 'B', ['d', null]), node('c', 'C'), node('d', 'D')]

describe("lecture 8a's recursion that returns values", () => {
	it('count the leaves: D, E and C, each a base case returning 1, added on the way back', () => {
		const run = measureTree(lecture, 'a', 'leaves')
		expect(run.result).toBe(3)
		expect(run.frames.map((f) => f.caption).filter((c) => c?.startsWith('leaves(B) ='))).toEqual(['leaves(B) = 1 + 1 = 2 (leaves(D) = 1, leaves(E) = 1)'])
		// Every node ends with its answer as a badge.
		expect(stateAt(run.frames, run.frames.length - 1).badges).toEqual({ d: '1', e: '1', b: '2', c: '1', a: '3' })
	})

	it("height: a leaf is 0 (lecture 8 counts edges), so A is 2; a leaf counted as 1, A is 3", () => {
		expect(measureTree(lecture, 'a', 'height').result).toBe(2)
		expect(measureTree(lecture, 'a', 'height-levels').result).toBe(3)
		const run = measureTree(lecture, 'a', 'height')
		expect(run.frames.find((f) => f.caption?.startsWith('height(B) ='))?.caption).toBe('height(B) = 1 + max(0, 0) = 1 (height(D) = 0, height(E) = 0)')
		expect(run.code).toBe('tree-height')
	})

	it('a node with one child calls on null for the other: height -1 there, so B is 1 + max(0, -1) = 1', () => {
		const run = measureTree(lopsided, 'a', 'height')
		expect(run.frames.find((f) => f.caption?.startsWith('height(B) ='))?.caption).toBe('height(B) = 1 + max(0, -1) = 1 (height(D) = 0, height(null) = -1)')
		expect(run.result).toBe(2)
	})

	it('size: one call per node and per empty subtree; the end says a size field makes it constant', () => {
		const run = measureTree(lecture, 'a', 'size')
		expect(run.result).toBe(5)
		expect(run.frames.at(-1)?.caption).toBe(
			'size(A) = 5: one call for every node and every empty subtree, 11 in all: linear. Keeping a size field (+1 on insert, −1 on delete) makes it constant'
		)
	})

	it('with nulls shown, each empty subtree is a base-case step of its own; the call stack runs beside', () => {
		const run = measureTree(lopsided, 'b', 'height', { nulls: true })
		// D's two empty subtrees, then B's missing right child.
		expect(run.frames.filter((f) => f.line === 'base').map((f) => f.caption)).toEqual(Array(3).fill('height(null): an empty subtree, so return -1'))
		expect(run.frames[1].strips).toEqual([{ title: 'call stack (top on the right)', items: ['height(B)', 'height(D)'] }])
	})
})

describe('lecture 8b: min / max, and sorted keys making a stick', () => {
	// The 44 tree's left side, enough for both ways: 44 (17 (8, 32), 88 (65, 97)).
	const bst = [node('a', '44', ['b', 'c']), node('b', '17', ['d', 'e']), node('c', '88', ['f', 'g']), node('d', '8'), node('e', '32'), node('f', '65'), node('g', '97')]

	it('the minimum is as far left as it goes: two hops from the root; the maximum two hops right', () => {
		const min = bstExtreme(bst, 'a', 'min')
		expect(min.found).toBe('d')
		expect(min.frames.at(-1)?.counts).toEqual({ hops: 2 })
		expect(min.frames.map((f) => f.line)).toEqual(['loop', 'step', 'step', 'found'])
		expect(bstExtreme(bst, 'a', 'max').found).toBe('g')
	})

	it('sorted keys make a stick, height n - 1; the same keys shuffled stay low', () => {
		const keys = ['10', '20', '30', '40', '50']
		const stick = bstBuild(keys, 'sorted')
		expect(treeHeight(stick.nodes)).toBe(4)
		expect(stick.frames.at(-1)?.caption).toBe('Sorted keys: each went right of the last, so the tree is a stick, height 4 = n − 1, a linked list: finding the largest takes 4 hops')
		const bushy = bstBuild(['30', '10', '50', '20', '40'], 'shuffled')
		expect(treeHeight(bushy.nodes)).toBe(2)
		expect(bushy.nodes.map((n) => n.value).sort()).toEqual(keys)
	})
})
