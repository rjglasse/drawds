import { describe, expect, it } from 'vitest'
import { stateAt } from '../../nodelink/playback'
import { HEAD_KEY, listScene, SIZE_KEY, SIZE_LABEL_KEY, TAIL_KEY } from './layout'
import { listShapeMigrations, type ListNode } from './list-shape-types'
import { deleteFromList, endTidied, insertIntoList } from './operations'
import { checkInvariants, countNodes, withSizeStep } from './size'

// Lecture 5: size counted (O(n)) or kept in a field (O(1)), and the list's invariants.

const list = (...values: string[]): ListNode[] => values.map((value, i) => ({ id: `n${i}`, value, dx: 0, dy: 0 }))
const props = { nodes: list('7', '3', '9'), direction: 'right' as const, size: 'm' as const }
const sized = { ...props, showSize: true }

describe('the size field', () => {
	it('a box with the count, named, before the head label; above it on a vertical list', () => {
		const scene = listScene(sized)
		const [box, word, head] = [SIZE_KEY, SIZE_LABEL_KEY, HEAD_KEY].map((k) => scene.nodes.find((n) => n.key === k)!)
		expect(box).toMatchObject({ kind: 'box', value: '3', y: head.y })
		expect(box.x).toBeLessThan(head.x)
		expect(word).toMatchObject({ kind: 'label', value: 'size', y: head.y })
		expect(word.x).toBeLessThan(box.x)
		const down = listScene({ ...sized, direction: 'down' })
		expect(down.nodes.find((n) => n.key === SIZE_KEY)!.y).toBeLessThan(down.nodes.find((n) => n.key === HEAD_KEY)!.y)
		expect(listScene(props).nodes.some((n) => n.key === SIZE_KEY)).toBe(false)
		expect(listScene({ ...sized, nodes: [] }).nodes.find((n) => n.key === SIZE_KEY)?.value).toBe('0')
	})

	it('every add and remove keeps it: the steps show the old size, a last one does size++ or size--', () => {
		const op = insertIntoList(sized, 'n0', 'n9', '5')
		const after = { ...sized, nodes: op.nodes! }
		const frames = withSizeStep(endTidied(sized, after, op.frames), sized, after.nodes.length)
		const size = (k: number) => frames[k].scene?.nodes.find((n) => n.key === SIZE_KEY)?.value
		expect(frames.slice(0, -1).filter((f) => f.scene).every((f) => f.scene!.nodes.find((n) => n.key === SIZE_KEY)?.value === '3')).toBe(true)
		expect(size(frames.length - 1)).toBe('4')
		expect(frames.at(-1)!.caption).toBe('size++: size = 4. Every add and remove keeps it, so reading it is O(1)')
		expect(stateAt(frames, frames.length - 1).flash[SIZE_KEY]).toBe('orange')
		const gone = deleteFromList(sized, 'n1')
		expect(withSizeStep(gone.frames, sized, 2).at(-1)!.caption).toMatch(/^size--: size = 2/)
		// No field shown, no step.
		expect(withSizeStep(op.frames, props, 4)).toEqual(op.frames)
	})

	it('saved before it existed: hidden', () => {
		const step = listShapeMigrations.sequence.at(-1)!
		if (!('up' in step) || typeof step.down !== 'function') throw new Error('expected a props migration')
		const old: Record<string, unknown> = {}
		step.up(old)
		expect(old).toEqual({ showSize: false })
		step.down(old)
		expect(old).toEqual({})
	})
})

describe('counting the nodes', () => {
	it('curr walks to null, count going up: n steps, O(n); the size field says it at once', () => {
		const op = countNodes(props)
		expect(op.code).toBe('list-count')
		expect(op.frames.map((f) => f.vars?.count)).toEqual(['0', '1', '2', '3', '3'])
		expect(op.frames.at(-1)!.caption).toBe('3 nodes, counted in 3 steps, one per node: O(n). A size field that every add and remove keeps would answer in O(1)')
		expect(countNodes(sized).frames.at(-1)!.caption).toBe('3 nodes, counted in 3 steps, one per node: O(n). The size field says 3 at once: O(1), as long as every add and remove keeps it')
		expect(countNodes({ ...props, nodes: [] }).frames.at(-1)!.caption).toMatch(/^0 nodes, counted in 0 steps/)
	})
})

describe('the invariants', () => {
	it('a list with a tail: size 0, size > 0, size 1, tail.next null; each O(1)', () => {
		const one = checkInvariants({ ...sized, tail: 'tail', nodes: list('7') })
		expect(one.frames.map((f) => f.caption)).toEqual([
			'Invariant 1: size == 0? No, it is 1: nothing to check here',
			'Invariant 2: size > 0, so head and tail must point at nodes: head at 7, tail at 7. Holds',
			'Invariant 3: size == 1, so head == tail: both at 7, the only node. Holds',
			'Invariant 4: tail.next == null: nothing after the last node. Holds',
			'All hold. Each check looked only at the ends, O(1), so a list could check them after every method. Checking that size is the number of nodes would walk them all: O(n)',
		])
		const empty = checkInvariants({ ...props, tail: 'tail', nodes: [] })
		expect(empty.frames[0].caption).toBe('Invariant 1: the number of nodes == 0, so head and tail must be null: both are. Holds')
		expect(empty.frames[0].flash).toEqual({ [HEAD_KEY]: 'green', [TAIL_KEY]: 'green' })
		expect(empty.frames[0].ask).toBe('Invariant 1: if the number of nodes is 0, head and tail are null. Does it hold?')
	})

	it("a cycle breaks the last one: the list has no end; a doubly linked list's head.prev is checked too", () => {
		const cycle = checkInvariants({ ...props, cycleTo: 'n1' })
		expect(cycle.frames.at(-2)!.caption).toBe("Invariant 4: the last node's next isn't null: it points back at 3, a cycle. This list breaks the invariant: it has no end")
		expect(cycle.frames.at(-1)!.caption).toMatch(/^One invariant broken/)
		const doubly = checkInvariants({ ...props, links: 'doubly' })
		expect(doubly.frames.at(-2)!.caption).toBe('Invariant 5: head.prev == null: nothing before the first node (a doubly linked list\'s other end). Holds')
	})
})

describe("lecture 5's two bugs: forgetting the tail", () => {
	const withTail = { ...props, tail: 'tail' as const }

	it('the first insert sets head but not tail: shown, not kept', () => {
		const op = insertIntoList({ ...withTail, nodes: [] }, undefined, 'n0', '5', { forgetTail: true })
		expect(op.nodes).toBeUndefined()
		expect(op.frames.at(-1)!.caption).toMatch(/^Forgot tail = node: 5 is the only node, so tail should point at it too, but it is still null/)
		expect(op.frames.at(-1)!.scene!.edges.find((e) => e.key === `${TAIL_KEY}->`)?.to).toBe('#null')
	})

	it('deleting the only node leaves tail on it: shown, not kept', () => {
		const op = deleteFromList({ ...withTail, nodes: list('5') }, 'n0', { forgetTail: true })
		expect(op.nodes).toBeUndefined()
		expect(op.frames.at(-1)!.caption).toMatch(/^Forgot tail = null: the list is empty, but tail still points at 5/)
		expect(op.frames.at(-1)!.scene!.edges.find((e) => e.key === `${TAIL_KEY}->`)?.to).toBe('n0')
	})
})
