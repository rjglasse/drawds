import { describe, expect, it } from 'vitest'
import { edgeCellKey } from '../../nodelink/scene'
import { heapScene } from '../heap/layout'
import { heapShapeMigrations } from '../heap/heap-shape-types'
import { depthKey, legendKey, TERMS_SUMMARY_KEY, treeScene } from './layout'
import { pathAndSubtree, termMarks, termsSummary, treeTerms } from './terms'
import { treeShapeMigrations, type TreeNode } from './tree-shape-types'

// Lecture 8a's terms: A(B(D, E), C), as the lecture draws it: D, E and C leaves, B internal, A the root.

const node = (id: string, value: string, children: (string | null)[] = [null, null]): TreeNode => ({ id, value, children, dx: 0, dy: 0 })
const lecture = [node('n', 'A', ['nL', 'nR']), node('nL', 'B', ['nLL', 'nLR']), node('nR', 'C'), node('nLL', 'D'), node('nLR', 'E')]

describe('tree terms', () => {
	it('root, internal, leaf; depths from the root (0); heights in edges down (a leaf 0)', () => {
		const terms = treeTerms(lecture)
		expect(Object.fromEntries(terms.term)).toEqual({ n: 'root', nL: 'internal', nR: 'leaf', nLL: 'leaf', nLR: 'leaf' })
		expect(Object.fromEntries(terms.depth)).toEqual({ n: 0, nL: 1, nR: 1, nLL: 2, nLR: 2 })
		expect(Object.fromEntries(terms.height)).toEqual({ n: 2, nL: 1, nR: 0, nLL: 0, nLR: 0 })
		expect(terms.levels).toBe(3)
		expect(termsSummary(terms)).toBe('5 nodes: the root, 1 internal, 3 leaves. Height 2 (edges down, a leaf 0), or 3 counting levels')
		expect(termMarks(terms)).toEqual({ n: 'red', nL: 'blue', nR: 'green', nLL: 'green', nLR: 'green' })
		expect(termsSummary(treeTerms([node('n', 'A')]))).toBe('1 node: the root, also a leaf. Height 0 (edges down, a leaf 0), or 1 counting levels')
	})

	it("pointing at a node: its path from the root orange, its subtree's edges green", () => {
		expect(pathAndSubtree(lecture, 'nL')).toEqual({
			n: 'orange',
			nL: 'orange',
			[edgeCellKey('n->nL')]: 'orange',
			[edgeCellKey('nL->nLL')]: 'green',
			[edgeCellKey('nL->nLR')]: 'green',
		})
		expect(pathAndSubtree(lecture, 'nLR')).toEqual({ n: 'orange', nL: 'orange', nLR: 'orange', [edgeCellKey('n->nL')]: 'orange', [edgeCellKey('nL->nLR')]: 'orange' })
		expect(pathAndSubtree(lecture, '#legend:root')).toEqual({})
	})

	it("beside the tree: a depth per level on the left, the legend above, the summary below; the tree doesn't move", () => {
		const plain = treeScene({ nodes: lecture, nulls: 'hide', size: 'm' })
		const shown = treeScene({ nodes: lecture, nulls: 'hide', size: 'm', terms: true })
		const at = (scene: typeof plain, key: string) => scene.nodes.find((n) => n.key === key)!
		expect(at(shown, 'n')).toMatchObject({ x: at(plain, 'n').x, y: at(plain, 'n').y })
		expect([0, 1, 2].map((d) => at(shown, depthKey(d)).value)).toEqual(['depth 0', 'depth 1', 'depth 2'])
		expect(at(shown, depthKey(1)).y).toBe(at(shown, 'nL').y)
		expect(at(shown, depthKey(0)).x).toBeLessThan(Math.min(...lecture.map((n) => at(shown, n.id).x)))
		expect(at(shown, legendKey('root')).y).toBeLessThan(at(shown, 'n').y)
		expect(at(shown, TERMS_SUMMARY_KEY).y).toBeGreaterThan(at(shown, 'nLL').y)
		// A heap's tree too, its array below the summary.
		const heap = heapScene({ values: ['1', '5', '3', '9'], size: 'm', terms: true })
		expect(heap.nodes.find((n) => n.key === 'a0')!.y).toBeGreaterThan(heap.nodes.find((n) => n.key === TERMS_SUMMARY_KEY)!.y)
	})

	it('saved before the terms: hidden', () => {
		for (const migrations of [treeShapeMigrations, heapShapeMigrations]) {
			const step = migrations.sequence.at(-1)!
			if (!('up' in step) || typeof step.down !== 'function') throw new Error('expected a props migration')
			const old: Record<string, unknown> = {}
			step.up(old)
			expect(old).toEqual({ terms: false })
			step.down(old)
			expect(old).toEqual({})
		}
	})
})
