import { describe, expect, it } from 'vitest'
import { getTreeMetrics, nodeSize } from '../tree/layout'
import { measureTree } from '../tree/measure'
import { stepAmongChildren } from '../tree/model'
import { traverseTree } from '../tree/traverse'
import type { TreeNode } from '../tree/tree-shape-types'
import { generateGeneralTree, levelIndex, maxDepth, randomGeneralTreePaths, withArity } from './generate'
import { generalTreeBasePosition, generalTreeMarkKeys, generalTreeRootCentre, generalTreeScene } from './layout'
import { appendChild, moveAmongSiblings, removeGeneralSubtree, siblingPlace } from './model'
import { lcrsSteps, leftChildRightSibling, siblingEdgeKey } from './lcrs'

const M = getTreeMetrics('m')
const node = (id: string, children: string[] = [], value = id): TreeNode => ({ id, value, children, dx: 0, dy: 0 })
const props = (nodes: TreeNode[]) => ({ nodes, size: 'm' as const })
const at = (scene: ReturnType<typeof generalTreeScene>, key: string) => scene.nodes.find((n) => n.key === key)!

// a has four children b, c, d, e; b has f and g; e has h.
const sample = [
	node('a', ['b', 'c', 'd', 'e']),
	node('b', ['f', 'g']),
	node('c'),
	node('d'),
	node('e', ['h']),
	node('f'),
	node('g'),
	node('h'),
]

describe('maxDepth', () => {
	it('keeps a perfect tree to 64 leaves', () => {
		expect([3, 4, 5, 6].map(maxDepth)).toEqual([4, 4, 3, 3])
	})
})

describe('randomGeneralTreePaths', () => {
	it('has exactly the requested depth, and no node more children than the arity', () => {
		for (let seed = 0; seed < 20; seed++) {
			const paths = randomGeneralTreePaths(seed, 4, 0.5, 4)
			expect(Math.max(...paths.map((p) => p.length))).toBe(3)
			expect(paths.every((p) => [...p].every((slot) => Number(slot) < 4))).toBe(true)
		}
	})

	it('is a stick at fullness 0 and a perfect tree at fullness 1', () => {
		expect(randomGeneralTreePaths(7, 4, 0, 3)).toHaveLength(4)
		expect(randomGeneralTreePaths(7, 3, 1, 4)).toHaveLength(1 + 4 + 16)
	})

	it('only adds nodes as the tree gets deeper or fuller, or a node may have more children', () => {
		const shallow = new Set(randomGeneralTreePaths(3, 3, 0.5, 3))
		const deep = new Set(randomGeneralTreePaths(3, 4, 0.5, 3))
		const fuller = new Set(randomGeneralTreePaths(3, 3, 0.8, 3))
		for (const p of shallow) {
			expect(deep.has(p)).toBe(true)
			expect(fuller.has(p)).toBe(true)
		}
	})

	it('is in level order', () => {
		const lengths = randomGeneralTreePaths(11, 4, 0.6, 5).map((p) => p.length)
		expect(lengths).toEqual([...lengths].sort((a, b) => a - b))
	})
})

describe('levelIndex', () => {
	it('numbers a perfect tree in level order', () => {
		expect(['', '0', '1', '2', '00', '01', '02', '10', '22'].map((p) => levelIndex(p, 3))).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 12])
	})
})

describe('generateGeneralTree', () => {
	it('links children in slot order, with no gaps, and keeps random values per node as the tree grows', () => {
		const small = generateGeneralTree(5, 2, 0.5, 4, 'random')
		const big = generateGeneralTree(5, 4, 0.9, 4, 'random')
		const bigById = new Map(big.map((n) => [n.id, n]))
		for (const n of small) expect(bigById.get(n.id)?.value).toBe(n.value)
		for (const n of big) {
			expect(n.children.every((c) => c && bigById.has(c))).toBe(true)
			expect(n.children).toEqual([...n.children].sort())
		}
		expect(new Set(big.map((n) => n.value)).size).toBe(big.length)
	})
})

describe('withArity', () => {
	const sketch = { seed: 21, depth: 3, fullness: 0.6, fill: 'random' as const, range: 'medium' as const }

	it('raising the arity only adds children, their values new; lowering it takes the higher slots away', () => {
		const three = generateGeneralTree(21, 3, 0.6, 3, 'random')
		const five = withArity(three, sketch, 3, 5)
		const byId = new Map(five.map((n) => [n.id, n.value]))
		for (const n of three) expect(byId.get(n.id)).toBe(n.value)
		expect(five.length).toBeGreaterThan(three.length)
		expect(new Set(five.map((n) => n.value)).size).toBe(five.length)
		expect(withArity(five, sketch, 5, 3)).toEqual(three)
	})

	it('keeps what was typed in, but not nodes added by hand, and keeps to the arity\'s depth', () => {
		const three = generateGeneralTree(21, 3, 0.6, 3, 'random').map((n) => (n.id === 'n' ? { ...n, value: 'root' } : n))
		const added = appendChild(three, 'n', 'extra').nodes
		const four = withArity(added, sketch, 3, 4)
		expect(four[0].value).toBe('root')
		expect(four.some((n) => n.value === 'extra')).toBe(false)
		const deep = withArity(generateGeneralTree(21, 4, 0.6, 3, 'random'), { ...sketch, depth: 4 }, 3, 6)
		expect(Math.max(...deep.map((n) => n.id.length))).toBe(3)
	})
})

describe('the layout', () => {
	it('puts the root at x = 0, each level a level-height down, and a parent over its first and last child', () => {
		const scene = generalTreeScene(props(sample))
		expect(at(scene, 'a').x).toBe(0)
		expect(at(scene, 'b').y - at(scene, 'a').y).toBeCloseTo(M.levelH)
		expect(at(scene, 'f').y - at(scene, 'b').y).toBeCloseTo(M.levelH)
		expect(at(scene, 'a').x).toBeCloseTo((at(scene, 'b').x + at(scene, 'e').x) / 2)
		expect(at(scene, 'b').x).toBeCloseTo((at(scene, 'f').x + at(scene, 'g').x) / 2)
		// A lone child right under its parent: a general tree has no sides.
		expect(at(scene, 'h').x).toBeCloseTo(at(scene, 'e').x)
	})

	it('keeps children in order and apart, at every level', () => {
		for (let seed = 0; seed < 30; seed++) {
			const nodes = generateGeneralTree(seed, 4, 0.6, 4, 'random')
			const scene = generalTreeScene(props(nodes))
			const levels = new Map<number, typeof scene.nodes>()
			for (const n of scene.nodes) levels.set(Math.round(n.y), [...(levels.get(Math.round(n.y)) ?? []), n])
			for (const row of levels.values()) {
				const sorted = [...row].sort((p, q) => p.x - q.x)
				for (let i = 1; i < sorted.length; i++) {
					const gap = sorted[i].x - sorted[i].w / 2 - (sorted[i - 1].x + sorted[i - 1].w / 2)
					expect(gap).toBeGreaterThanOrEqual(M.gap - 1e-6)
				}
			}
			for (const n of nodes) {
				const xs = n.children.map((c) => at(scene, c!).x)
				expect(xs).toEqual([...xs].sort((p, q) => p - q))
			}
		}
	})

	it('spreads a small subtree between two big ones evenly, not to one side', () => {
		const nodes = [
			node('r', ['a', 'm', 'z']),
			node('a', ['a1', 'a2', 'a3']),
			node('m'),
			node('z', ['z1', 'z2', 'z3']),
			...['a1', 'a2', 'a3', 'z1', 'z2', 'z3'].map((id) => node(id)),
		]
		const scene = generalTreeScene(props(nodes))
		expect(at(scene, 'm').x).toBeCloseTo((at(scene, 'a').x + at(scene, 'z').x) / 2)
	})

	it('widens a node for a long value, drawn as large as a 3-character one', () => {
		expect(nodeSize('42', M)).toEqual({ w: M.diameter, h: M.diameter })
		const wide = nodeSize('Documents', M)
		expect(wide.w).toBeGreaterThan(M.diameter * 2)
		expect(wide.h).toBe(M.diameter)
		expect(wide.fontScale).toBeCloseTo(2.5 / 3)
		const scene = generalTreeScene(props([node('r', ['x', 'y'], '/'), node('x', [], 'Documents'), node('y', [], 'bin')]))
		expect(at(scene, 'x').w).toBeCloseTo(wide.w)
		expect(at(scene, 'y').x - at(scene, 'x').x).toBeGreaterThanOrEqual(wide.w / 2 + M.diameter / 2 + M.gap - 1e-6)
	})

	it('adds drag offsets to the automatic layout, and keeps the root where the sketch put it', () => {
		const moved = sample.map((n) => (n.id === 'c' ? { ...n, dx: 10, dy: -5 } : n))
		const base = generalTreeBasePosition(props(moved), 'c')!
		const scene = generalTreeScene(props(moved))
		expect(at(scene, 'c').x).toBeCloseTo(base.x + 10)
		expect(at(scene, 'c').y).toBeCloseTo(base.y - 5)
		expect(generalTreeRootCentre(props(sample))).toEqual({ x: 0, y: M.diameter / 2 })
	})

	it('marks nodes and the edges down to them', () => {
		expect(generalTreeMarkKeys([node('a', ['b']), node('b')])).toEqual(['a', 'b', 'edge:a->b'])
	})
})

describe('edits', () => {
	it('adds a last child with an id of its own', () => {
		const { nodes, id } = appendChild(sample, 'b', '9')
		expect(id).toBe('b0')
		expect(nodes.find((n) => n.id === 'b')!.children).toEqual(['f', 'g', 'b0'])
		expect(appendChild(nodes, 'b', '8').id).toBe('b1')
	})

	it('removes a subtree, its siblings closing up', () => {
		const nodes = removeGeneralSubtree(sample, 'b')
		expect(nodes.map((n) => n.id)).toEqual(['a', 'c', 'd', 'e', 'h'])
		expect(nodes[0].children).toEqual(['c', 'd', 'e'])
	})

	it('moves a node among its siblings, its subtree with it', () => {
		expect(siblingPlace(sample, 'c')).toEqual({ index: 1, count: 4 })
		expect(siblingPlace(sample, 'a')).toBeUndefined()
		expect(moveAmongSiblings(sample, 'c', -1)[0].children).toEqual(['c', 'b', 'd', 'e'])
		expect(moveAmongSiblings(sample, 'e', 1)[0].children).toEqual(['b', 'c', 'd', 'e'])
		expect(moveAmongSiblings(sample, 'b', 1).find((n) => n.id === 'b')!.children).toEqual(['f', 'g'])
	})
})

describe('traversals', () => {
	it('visit every child in order: pre-order, post-order, level order', () => {
		const values = (order: 'pre' | 'post' | 'level') => traverseTree(sample, 'a', order, { general: true }).visited.join('')
		expect(values('pre')).toBe('abfgcdeh')
		expect(values('post')).toBe('fgbcdhea')
		expect(values('level')).toBe('abcdefgh')
	})

	it('name their own code, each call made from the loop over the children', () => {
		const run = traverseTree(sample, 'a', 'post', { general: true })
		expect(run.code).toBe('general-tree-post')
		const arrive = run.frames.find((f) => f.caption?.startsWith('Go down to b'))!
		expect(arrive.line).toBe('child')
		// The loop runs in a's call: node is a, child b.
		expect(arrive.vars).toEqual({ node: 'a', child: 'b' })
		expect(run.frames.some((f) => f.caption?.includes('its children are done: visit'))).toBe(true)
		expect(traverseTree(sample, 'a', 'level', { general: true }).frames[1].caption).toBe('Dequeue a: visit it (1), queue b, c, d and e')
	})
})

describe('height, size and leaves', () => {
	const run = (measure: 'height' | 'height-levels' | 'leaves' | 'size', start = 'a') => measureTree(sample, start, measure, { general: true })

	it('work over every child, one call per node (no calls on null)', () => {
		expect(run('height').result).toBe(2)
		expect(run('height-levels').result).toBe(3)
		expect(run('leaves').result).toBe(5)
		expect(run('size').result).toBe(8)
		expect(run('size', 'b').result).toBe(3)
		expect(run('size').frames.at(-1)!.counts).toEqual({ calls: 8 })
		expect(run('size').code).toBe('general-tree-size')
	})

	it('a leaf returns at once, its loop never running; a parent combines all its children', () => {
		const height = run('height')
		expect(height.frames.find((f) => f.caption?.startsWith('height(c)'))!.caption).toBe(
			'height(c): c has no children, so the loop never runs: return 1 + (-1) = 0'
		)
		expect(height.frames.find((f) => f.caption?.startsWith('height(a) ='))!.caption).toBe(
			'height(a) = 1 + max(1, 0, 0, 1) = 2 (height(b) = 1, height(c) = 0, height(d) = 0, height(e) = 1)'
		)
		const size = run('size')
		expect(size.frames.find((f) => f.caption?.startsWith('size(e) ='))!.caption).toBe('size(e) = 1 + 1 = 2 (size(h) = 1)')
		expect(size.frames.find((f) => f.caption?.startsWith('size(e) ='))!.vars).toEqual({ node: 'e', child: 'e', s: '2' })
		expect(run('leaves').frames.find((f) => f.caption?.startsWith('leaves(e) ='))!.caption).toBe('leaves(e) = 1 (leaves(h) = 1)')
	})
})

describe('left child, right sibling', () => {
	it('makes a binary tree: a node\'s left its first child, its right its next sibling', () => {
		const binary = leftChildRightSibling(sample)
		const by = new Map(binary.map((n) => [n.value, n]))
		const valueOf = (id: string | null) => (id ? binary.find((n) => n.id === id)!.value : null)
		expect(binary[0].id).toBe('n')
		expect(binary).toHaveLength(sample.length)
		// a's first child b; b's sibling c, c's d, d's e; b's first child f, f's sibling g; e's child h.
		expect(by.get('a')!.children.map(valueOf)).toEqual(['b', null])
		expect(by.get('b')!.children.map(valueOf)).toEqual(['f', 'c'])
		expect(by.get('d')!.children.map(valueOf)).toEqual([null, 'e'])
		expect(by.get('e')!.children.map(valueOf)).toEqual(['h', null])
		expect(by.get('f')!.children.map(valueOf)).toEqual([null, 'g'])
	})

	it('pre-order visits it as the general tree, and in-order as post-order does', () => {
		const binary = leftChildRightSibling(sample)
		const values = (nodes: TreeNode[], visited: string[]) => visited.map((id) => nodes.find((n) => n.id === id)!.value).join('')
		const general = (order: 'pre' | 'post') => values(sample, traverseTree(sample, 'a', order, { general: true }).visited)
		expect(values(binary, traverseTree(binary, 'n', 'pre').visited)).toBe(general('pre'))
		expect(values(binary, traverseTree(binary, 'n', 'in').visited)).toBe(general('post'))
	})

	it('step by step on the tree as drawn: each parent keeps its first edge, its children linked across', () => {
		const scene = generalTreeScene(props(sample))
		const frames = lcrsSteps(sample, scene)
		// The opening, a step for each node with children (a, b, e), the summing-up.
		expect(frames).toHaveLength(5)
		const atB = frames[2]
		expect(atB.caption).toBe("b: f, its first child, is its left; g is f's right (the next sibling)")
		expect(atB.dim).toEqual(['edge:b->g'])
		expect(atB.scene!.edges.map((e) => e.key)).toContain(siblingEdgeKey('f', 'g'))
		const last = frames.at(-1)!.scene!.edges.map((e) => e.key).sort()
		expect(last).toEqual(['a->b', 'b->f', 'e->h', siblingEdgeKey('b', 'c'), siblingEdgeKey('c', 'd'), siblingEdgeKey('d', 'e'), siblingEdgeKey('f', 'g')].sort())
	})
})

describe('a pointer stepped with the arrow keys', () => {
	it('goes up to the parent, down to the first child, left and right among the siblings', () => {
		expect(stepAmongChildren(sample, 'c', 'up')).toBe('a')
		expect(stepAmongChildren(sample, 'b', 'down')).toBe('f')
		expect(stepAmongChildren(sample, 'c', 'left')).toBe('b')
		expect(stepAmongChildren(sample, 'c', 'right')).toBe('d')
		// Not past the ends, nor above the root or below a leaf.
		expect(stepAmongChildren(sample, 'b', 'left')).toBeUndefined()
		expect(stepAmongChildren(sample, 'e', 'right')).toBeUndefined()
		expect(stepAmongChildren(sample, 'a', 'up')).toBeUndefined()
		expect(stepAmongChildren(sample, 'c', 'down')).toBeUndefined()
	})
})
