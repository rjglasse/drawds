import { describe, expect, it } from 'vitest'
import { generateTree, levelIndex, randomTreePaths } from './generate'
import { getTreeMetrics, nullKey, treeBasePosition, treeRootCentre, treeScene } from './layout'
import { addChild, childId, levelOrder, removeSubtree } from './model'
import type { TreeNode } from './tree-shape-types'

const M = getTreeMetrics('m')
const node = (id: string, children: (string | null)[] = [null, null], value = id): TreeNode => ({
	id,
	value,
	children,
	dx: 0,
	dy: 0,
})
const props = (nodes: TreeNode[], nulls: 'hide' | 'show' = 'hide') => ({ nodes, nulls, size: 'm' as const })
const at = (scene: ReturnType<typeof treeScene>, key: string) => scene.nodes.find((n) => n.key === key)!

describe('randomTreePaths', () => {
	it('has exactly the requested depth', () => {
		for (let seed = 0; seed < 20; seed++) {
			const paths = randomTreePaths(seed, 4, 0.5)
			expect(Math.max(...paths.map((p) => p.length))).toBe(3)
		}
	})

	it('is a stick at fullness 0 and perfect at fullness 1', () => {
		expect(randomTreePaths(7, 5, 0)).toHaveLength(5)
		expect(randomTreePaths(7, 4, 1)).toHaveLength(15)
	})

	it('only adds nodes as the tree gets deeper or fuller', () => {
		const shallow = new Set(randomTreePaths(3, 3, 0.5))
		const deep = new Set(randomTreePaths(3, 4, 0.5))
		const fuller = new Set(randomTreePaths(3, 3, 0.8))
		for (const p of shallow) {
			expect(deep.has(p)).toBe(true)
			expect(fuller.has(p)).toBe(true)
		}
	})

	it('is in level order', () => {
		const lengths = randomTreePaths(11, 5, 0.6).map((p) => p.length)
		expect(lengths).toEqual([...lengths].sort((a, b) => a - b))
	})
})

describe('levelIndex', () => {
	it('numbers a perfect tree in level order', () => {
		expect(['', 'L', 'R', 'LL', 'LR', 'RL', 'RR'].map(levelIndex)).toEqual([0, 1, 2, 3, 4, 5, 6])
	})
})

describe('generateTree', () => {
	it('links children by id and keeps random values per node as the tree grows', () => {
		const small = generateTree(5, 3, 0.5, 'random')
		const big = generateTree(5, 5, 0.9, 'random')
		const bigById = new Map(big.map((n) => [n.id, n]))
		for (const n of small) expect(bigById.get(n.id)?.value).toBe(n.value)
		for (const n of big) for (const c of n.children) if (c) expect(bigById.has(c)).toBe(true)
		expect(new Set(big.map((n) => n.value)).size).toBe(big.length)
	})
})

describe('model', () => {
	const tree = [node('n', ['nL', 'nR']), node('nL', ['nLL', null]), node('nR'), node('nLL')]

	it('lists nodes in level order', () => {
		expect(levelOrder(tree).map((n) => n.id)).toEqual(['n', 'nL', 'nR', 'nLL'])
	})

	it('removes a subtree and empties the slot', () => {
		const pruned = removeSubtree(tree, 'nL')
		expect(pruned.map((n) => n.id)).toEqual(['n', 'nR'])
		expect(pruned[0].children).toEqual([null, 'nR'])
	})

	it('adds a child in an empty slot with a unique id', () => {
		const { nodes, id } = addChild(tree, 'nR', 1, '42')
		expect(id).toBe('nRR')
		expect(nodes.find((n) => n.id === 'nR')!.children).toEqual([null, 'nRR'])
		expect(childId([...tree, node('nRR')], 'nR', 1)).toBe('nRR2')
	})
})

describe('treeScene', () => {
	it('puts a lone child on its own side', () => {
		const leftOnly = treeScene(props([node('n', ['nL', null]), node('nL')]))
		expect(at(leftOnly, 'nL').x).toBeLessThan(at(leftOnly, 'n').x)
		const rightOnly = treeScene(props([node('n', [null, 'nR']), node('nR')]))
		expect(at(rightOnly, 'nR').x).toBeGreaterThan(at(rightOnly, 'n').x)
	})

	it("keeps a lone child nearer its own parent than its parent's sibling", () => {
		const scene = treeScene(props([node('n', ['nL', 'nR']), node('nL', [null, 'nLR']), node('nR'), node('nLR')]))
		const x = (k: string) => at(scene, k).x
		expect(Math.abs(x('nLR') - x('nL'))).toBeLessThan(Math.abs(x('nLR') - x('nR')))
		expect(x('nLR')).toBeGreaterThan(x('nL'))
	})

	it('centres a parent over two children and levels by depth', () => {
		const scene = treeScene(props([node('n', ['nL', 'nR']), node('nL'), node('nR')]))
		expect(at(scene, 'n').x).toBeCloseTo((at(scene, 'nL').x + at(scene, 'nR').x) / 2)
		expect(at(scene, 'nL').y - at(scene, 'n').y).toBeCloseTo(M.levelH)
	})

	it('never overlaps nodes on the same level', () => {
		for (const fullness of [0.3, 0.6, 1]) {
			const scene = treeScene(props(generateTree(9, 5, fullness, 'random'), 'show'))
			const levels = new Map<number, typeof scene.nodes>()
			for (const n of scene.nodes) levels.set(Math.round(n.y), [...(levels.get(Math.round(n.y)) ?? []), n])
			for (const row of levels.values()) {
				const sorted = [...row].sort((a, b) => a.x - b.x)
				for (let i = 1; i < sorted.length; i++) {
					expect(sorted[i].x - sorted[i].w / 2).toBeGreaterThanOrEqual(sorted[i - 1].x + sorted[i - 1].w / 2 + M.gap - 1e-6)
				}
			}
		}
	})

	it('shows null markers in empty slots when asked, joined to their parent', () => {
		const scene = treeScene(props([node('n', ['nL', null]), node('nL')], 'show'))
		expect(scene.nodes.filter((n) => n.kind === 'null').map((n) => n.key).sort()).toEqual(
			[nullKey('n', 1), nullKey('nL', 0), nullKey('nL', 1)].sort()
		)
		expect(scene.edges.map((e) => e.to)).toContain(nullKey('n', 1))
	})

	it('normalises to (0, 0) and applies drag offsets; nulls follow their parent', () => {
		const nodes = [node('n', ['nL', null]), { ...node('nL'), dx: 30, dy: 10 }]
		const scene = treeScene(props(nodes, 'show'))
		const base = treeScene(props([node('n', ['nL', null]), node('nL')], 'show'))
		expect(Math.min(...base.nodes.map((n) => n.x - n.w / 2))).toBeCloseTo(0)
		expect(at(scene, 'nL').x - at(base, 'nL').x).toBe(30)
		expect(at(scene, nullKey('nL', 0)).y - at(base, nullKey('nL', 0)).y).toBe(10)
		expect(treeBasePosition(props(nodes), 'nL')).toEqual(treeBasePosition(props([node('n', ['nL', null]), node('nL')]), 'nL'))
	})

	it('finds the root centre', () => {
		const p = props([node('n', ['nL', 'nR']), node('nL'), node('nR')])
		expect(treeRootCentre(p)).toEqual({ x: at(treeScene(p), 'n').x, y: at(treeScene(p), 'n').y })
	})
})
