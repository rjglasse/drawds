import { describe, expect, it } from 'vitest'
import { stateAt } from '../../nodelink/playback'
import type { Scene } from '../../nodelink/scene'
import { HEAD_KEY, NULL_KEY } from './layout'
import type { ListNode } from './list-shape-types'
import { NULL_BEFORE_KEY, deleteFromList, findInList, insertIntoList, reverseList } from './operations'

const nodes: ListNode[] = ['7', '3', '9', '4'].map((value, i) => ({ id: `n${i}`, value, dx: 0, dy: 0 }))
const props = { nodes, direction: 'right' as const, size: 'm' as const }

/** Where each arrow points in a step's scene: node id (or #head) -> target. */
const targets = (scene: Scene | undefined) =>
	Object.fromEntries((scene?.edges ?? []).map((e) => [e.key === `${HEAD_KEY}->` ? HEAD_KEY : e.from, e.to]))
const where = (frame: { pointers?: { name: string; at: string }[] }) => frame.pointers?.map((p) => `${p.name}@${p.at}`)

describe('findInList', () => {
	it('walks curr from the head and stops on the value', () => {
		const { frames, finalFlash } = findInList(props, '9')
		expect(frames.map(where)).toEqual([['curr@n0'], ['curr@n1'], ['curr@n2'], ['curr@n2']])
		expect(frames[1].caption).toBe('7 ≠ 9, so curr = curr.next (3). Is it 9?')
		expect(frames.at(-1)!.caption).toBe('Yes: 9 is node 3 from the head')
		expect(finalFlash).toEqual({ n2: 'green' })
	})

	it('walks off the end to null when the value is missing', () => {
		const { frames } = findInList(props, '5')
		expect(where(frames.at(-1)!)).toEqual([`curr@${NULL_KEY}`])
		expect(frames.at(-1)!.caption).toBe('4 ≠ 5, so curr = curr.next: null. 5 is not in the list')
	})
})

describe('insertIntoList', () => {
	it('new node, then node.next = curr.next, then curr.next = node', () => {
		const { frames, nodes: after } = insertIntoList(props, 'n1', 'n9', '5')
		expect(after!.map((n) => n.value)).toEqual(['7', '3', '5', '9', '4'])
		const [, created, linked, done] = frames
		expect(created.caption).toBe('node = new Node(5): its next is null for now')
		expect(targets(created.scene).n9).toBeUndefined()
		expect(targets(linked.scene)).toMatchObject({ n9: 'n2', n1: 'n2' })
		expect(targets(done.scene)).toMatchObject({ n9: 'n2', n1: 'n9' })
		// The new node sits beside the list (below a list running right).
		const fresh = created.scene!.nodes.find((n) => n.key === 'n9')!
		const n1 = created.scene!.nodes.find((n) => n.key === 'n1')!
		expect(fresh.y).toBeGreaterThan(n1.y)
	})

	it('at the head: node.next = head, then head = node', () => {
		const { frames, nodes: after } = insertIntoList(props, undefined, 'n9', '1')
		expect(after!.map((n) => n.value)).toEqual(['1', '7', '3', '9', '4'])
		expect(frames.map((f) => f.caption)).toEqual([
			'node = new Node(1): its next is null for now',
			'node.next = head: the new node points at 7',
			'head = node: 1 is the first node now',
		])
		expect(targets(frames[2].scene)[HEAD_KEY]).toBe('n9')
	})
})

describe('deleteFromList', () => {
	it('prev and curr walk to the node, then prev.next = curr.next goes round it', () => {
		const { frames, nodes: after } = deleteFromList(props, 'n2')
		expect(after!.map((n) => n.id)).toEqual(['n0', 'n1', 'n3'])
		expect(frames.slice(0, 3).map(where)).toEqual([['curr@n0'], ['prev@n0', 'curr@n1'], ['prev@n1', 'curr@n2']])
		const bypass = frames[3]
		expect(bypass.caption).toBe('prev.next = curr.next: 3 now points past 9, at 4')
		expect(targets(bypass.scene).n1).toBe('n3')
		expect(bypass.scene!.edges.find((e) => e.from === 'n1')!.bend).toBeGreaterThan(0)
	})

	it('deleting the head is head = head.next', () => {
		const { frames, nodes: after } = deleteFromList(props, 'n0')
		expect(after!.map((n) => n.id)).toEqual(['n1', 'n2', 'n3'])
		expect(frames[1].caption).toBe('head = head.next: the list starts at 3 now')
		expect(targets(frames[1].scene)[HEAD_KEY]).toBe('n1')
	})
})

describe('reverseList', () => {
	it('turns every arrow round, then head = prev; the list is drawn the other way', () => {
		const { frames, nodes: after, direction } = reverseList(props)
		expect(after!.map((n) => n.value)).toEqual(['4', '9', '3', '7'])
		expect(direction).toBe('left')
		expect(frames).toHaveLength(3 * nodes.length + 2)
		expect(targets(frames.at(-1)!.scene)).toMatchObject({ n0: NULL_BEFORE_KEY, n1: 'n0', n2: 'n1', n3: 'n2', [HEAD_KEY]: 'n3' })
		expect(frames[0].caption).toBe('prev = null, curr = head')
		expect(frames[2].caption).toBe('curr.next = prev: 7 now points back, at null')
		expect(where(frames[3])).toEqual(['prev@n0', 'curr@n1', 'next@n1'])
		// Nothing is left lit at the end but the head arrow that just moved.
		expect(stateAt(frames, frames.length - 1).flash).toEqual({ [`edge:${HEAD_KEY}->`]: 'orange' })
	})
})
