import { describe, expect, it } from 'vitest'
import { stateAt } from '../../nodelink/playback'
import { elementKey, elementOfKey, forestPositions, parentKey, unionFindScene, weightKey } from './layout'
import { findSteps, unionSteps } from './operations'
import { canSetParent, compress, findPath, randomUnions, recount, rootOf, singletons, toCompress, union, type Forest } from './union-find'
import { mulberry32 } from '../../data/random'

/** 0 <- 1 <- 2 <- 3 (a chain: 3's way up is 3, 2, 1, 0), and 4 on its own. */
const chain = (): Forest => ({ parent: [0, 0, 1, 2, 4], sizes: [4, 1, 1, 1, 1], ranks: [3, 0, 0, 0, 0] })

const props = (f: Forest, more: Partial<{ unionBy: 'size' | 'rank' | 'naive'; compression: 'on' | 'off' }> = {}) => ({
	labels: f.parent.map(String),
	...f,
	unionBy: 'size' as const,
	compression: 'on' as const,
	size: 'm' as const,
	...more,
})

describe('union-find model', () => {
	it('starts with every element its own root', () => {
		const f = singletons(4)
		expect(f.parent).toEqual([0, 1, 2, 3])
		expect([0, 1, 2, 3].map((i) => rootOf(f.parent, i))).toEqual([0, 1, 2, 3])
	})

	it('finds the way up and compresses it', () => {
		const { parent } = chain()
		expect(findPath(parent, 3)).toEqual([3, 2, 1, 0])
		expect(toCompress(parent, [3, 2, 1, 0])).toEqual([3, 2])
		expect(compress(parent, [3, 2, 1, 0])).toEqual([0, 0, 0, 0, 4])
	})

	it('unions by size: the smaller tree under the bigger root, sizes added', () => {
		const link = union(chain(), 4, 3, 'size')
		expect(link).toMatchObject({ ra: 4, rb: 0, child: 4, root: 0 })
		expect(link.forest.parent[4]).toBe(0)
		expect(link.forest.sizes[0]).toBe(5)
	})

	it('unions by rank: equal ranks tie, and the new root ranks up', () => {
		const link = union(singletons(2), 0, 1, 'rank')
		expect(link).toMatchObject({ child: 0, root: 1, tie: true })
		expect(link.forest.ranks).toEqual([0, 1])
		expect(union(link.forest, 1, 0, 'rank').child).toBeUndefined()
	})

	it("unions naively: a's root under b's, whatever the sizes", () => {
		expect(union(chain(), 3, 4, 'naive')).toMatchObject({ child: 0, root: 4 })
	})

	it('refuses parent pointers that would loop', () => {
		const { parent } = chain()
		expect(canSetParent(parent, 0, 3)).toBe(false)
		expect(canSetParent(parent, 3, 4)).toBe(true)
		expect(canSetParent(parent, 2, 2)).toBe(true)
		expect(canSetParent(parent, 2, 9)).toBe(false)
	})

	it('recounts sizes and heights for a forest set by hand', () => {
		expect(recount([0, 0, 1, 2, 4])).toEqual({ sizes: [4, 3, 2, 1, 1], ranks: [3, 2, 1, 0, 0] })
	})

	it('random unions keep a forest', () => {
		const f = randomUnions(singletons(10), 'size', 8, mulberry32(3))
		for (let i = 0; i < 10; i++) expect(findPath(f.parent, i).length).toBeLessThanOrEqual(10)
		expect(new Set(f.parent.map((_, i) => rootOf(f.parent, i))).size).toBeLessThan(10)
	})
})

describe('union-find layout', () => {
	it('puts roots on top, children under their parent, trees side by side', () => {
		const { x, depth } = forestPositions([0, 0, 0, 3], 10, 5, 20)
		expect(depth).toEqual([0, 1, 1, 0])
		expect(x[0]).toBeCloseTo((x[1] + x[2]) / 2)
		expect(x[3]).toBeGreaterThan(x[2] + 20)
	})

	it('draws elements, parent pointers and the parent array, cells at fixed places', () => {
		const scene = unionFindScene(props(chain()))
		const at = (k: string) => scene.nodes.find((n) => n.key === k)!
		expect(scene.edges.map((e) => [e.from, e.to])).toEqual([
			['1', '0'],
			['2', '1'],
			['3', '2'],
		])
		expect(at(parentKey(3)).value).toBe('2')
		expect(at(weightKey(0)).value).toBe('4')
		expect(at(parentKey(0)).x).toBe(24)
		expect(at(parentKey(1)).x - at(parentKey(0)).x).toBe(48)
		expect(at(parentKey(0)).y).toBeGreaterThan(at(elementKey(3)).y)
		expect(at('#weight').value).toBe('size')
		expect(unionFindScene(props(chain(), { unionBy: 'naive' })).nodes.some((n) => n.key.startsWith('w'))).toBe(false)
	})

	it('maps keys to elements', () => {
		expect(['3', 'p3', 'w3', 'e3', '#i3'].map(elementOfKey)).toEqual([3, 3, 3, undefined, undefined])
	})
})

describe('union-find steps', () => {
	it('find walks up, counts the steps, then compresses one arrow at a time and tidies', () => {
		const { frames, forest, root, hops } = findSteps(props(chain()), chain(), 3)
		expect(root).toBe(0)
		expect(hops).toBe(3)
		// Start, three steps up, the root, compression: its plan, two arrows, the tidy trees.
		expect(frames.map((f) => f.pointers?.at(-1)?.at)).toEqual(['3', '2', '1', '0', '0', '0', '0', '0', '0'])
		// The re-pointing steps keep the nodes where they are: a scene, the arrows bent onto the root.
		const repoint = frames.filter((f) => f.scene)
		expect(repoint).toHaveLength(2)
		expect(repoint[1].scene!.edges.filter((e) => e.to === '0').map((e) => e.key).sort()).toEqual(['e1', 'e2', 'e3'])
		expect(forest.parent).toEqual([0, 0, 0, 0, 4])
		expect(frames.at(-1)!.props).toMatchObject({ parent: [0, 0, 0, 0, 4] })
	})

	it('find without compression just walks up', () => {
		const { frames, forest } = findSteps(props(chain(), { compression: 'off' }), chain(), 3)
		expect(frames).toHaveLength(5)
		expect(forest.parent).toEqual(chain().parent)
	})

	it('union links the smaller tree under the bigger root; one set already: nothing to link', () => {
		const joined = unionSteps(props(chain()), 4, 3)
		expect(joined.forest.parent).toEqual([0, 0, 0, 0, 0])
		expect(joined.frames.at(-1)!.caption).toBe("size 1 vs 4: parent[4] = 0, so 4's tree goes under 0; size[0] = 5")
		const same = unionSteps(props(chain(), { compression: 'off' }), 1, 3)
		expect(same.forest.parent).toEqual(chain().parent)
		expect(same.frames.at(-1)!.caption).toContain('in one set already')
		// While b's root is found, the way up to a's root is no longer lit; a's root is.
		const state = stateAt(joined.frames, joined.frames.findIndex((f) => f.pointers?.some((p) => p.name === 'b')))
		expect(state.flash[elementKey(4)]).toBe('green')
	})
})
