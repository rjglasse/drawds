import { describe, expect, it } from 'vitest'
import { stateAt } from '../../nodelink/playback'
import type { Scene } from '../../nodelink/scene'
import { HEAD_KEY, NULL_KEY, listScene } from './layout'
import type { ListNode } from './list-shape-types'
import {
	NULL_BEFORE_KEY,
	appendToList,
	deleteFromList,
	detectCycle,
	endTidied,
	findInList,
	findMiddle,
	insertIntoList,
	insertSorted,
	printBackwards,
	printList,
	reverseList,
} from './operations'

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

describe('findMiddle', () => {
	const list = (n: number) => ({ ...props, nodes: Array.from({ length: n }, (_, i) => ({ id: `n${i}`, value: String(i * 10), dx: 0, dy: 0 })) })

	it('slow takes one step for fast’s two; slow ends in the middle', () => {
		const { frames, finalFlash } = findMiddle(list(5))
		expect(frames.map(where)).toEqual([
			['slow@n0', 'fast@n0'],
			['slow@n1', 'fast@n2'],
			['slow@n2', 'fast@n4'],
			['slow@n2', 'fast@n4'],
		])
		expect(frames.at(-1)!.caption).toBe("fast.next is null: fast can't take two more steps, so slow is at the middle: 20 (after 2 steps, half the list)")
		expect(finalFlash).toEqual({ n2: 'green' })
	})

	it('with an even count, fast runs off to null and slow is on the second middle', () => {
		const { frames } = findMiddle(list(4))
		expect(where(frames.at(-1)!)).toEqual(['slow@n2', `fast@${NULL_KEY}`])
		expect(frames.at(-1)!.caption).toMatch(/^fast is null, so slow is at the middle: 20/)
	})
})

describe('insertSorted', () => {
	const sorted = { ...props, nodes: ['2', '5', '8'].map((value, i) => ({ id: `n${i}`, value, dx: 0, dy: 0 })) }

	it('walks to the first value not smaller, then links the node in between', () => {
		const { frames, nodes: after } = insertSorted(sorted, 'n9', '6')
		expect(after!.map((n) => n.value)).toEqual(['2', '5', '6', '8'])
		expect(frames.map((f) => f.caption)).toEqual([
			'curr = head: 2 < 6, so keep going',
			'prev = curr, curr = curr.next: 5 < 6, so keep going',
			'prev = curr, curr = curr.next: 8 ≥ 6, so 6 goes between 5 and 8',
			'node = new Node(6): its next is null for now',
			'node.next = prev.next: the new node points at 8 too',
			'prev.next = node: 5 now points at 6. (The other way round, the rest of the list would be lost)',
		])
		expect(where(frames[4])).toEqual(['prev@n1', 'node@n9', 'curr@n2'])
	})

	it('at the head and at the end', () => {
		expect(insertSorted(sorted, 'n9', '1').nodes!.map((n) => n.value)).toEqual(['1', '2', '5', '8'])
		const end = insertSorted(sorted, 'n9', '9')
		expect(end.nodes!.map((n) => n.value)).toEqual(['2', '5', '8', '9'])
		expect(end.frames.map((f) => f.caption)).toContain('curr = null: 9 is the largest, so it goes at the end, after 8')
	})

	it('warns when the list is not sorted', () => {
		expect(insertSorted(props, 'n9', '5').frames[0].caption).toBe("Careful: 7 > 3, so the list isn't sorted and 5 may land out of order")
	})
})

describe('operations on list variants', () => {
	const four = ['7', '3', '9', '4'].map((value, i) => ({ id: `n${i}`, value, dx: 0, dy: 0 }))
	const base = { nodes: four, direction: 'right' as const, size: 'm' as const }
	const ends = (scene: Scene | undefined) => Object.fromEntries((scene?.edges ?? []).map((e) => [e.key, e.to]))
	const captions = (op: { frames: { caption?: string }[] }) => op.frames.map((f) => f.caption)

	it('doubly linked insert: four assignments, in an order that keeps the list', () => {
		const op = insertIntoList({ ...base, links: 'doubly' }, 'n1', 'n9', '5')
		expect(captions(op).slice(2)).toEqual([
			'node.next = curr.next: the new node points at 9 too',
			'node.prev = curr: it points back at 3',
			'curr.next.prev = node: 9 points back at 5 now',
			'curr.next = node: 3 now points at 5. (The other way round, the rest of the list would be lost)',
		])
		expect(ends(op.frames.at(-1)!.scene)).toMatchObject({ 'n9->': 'n2', 'n9<-': 'n1', 'n2<-': 'n9', 'n1->': 'n9' })
	})

	it('a tail moves when a node goes in after the last one, or the last one goes', () => {
		const added = insertIntoList({ ...base, tail: 'tail' }, 'n3', 'n9', '8')
		expect(captions(added).at(-1)).toBe('tail = node: 8 is the last node now')
		expect(ends(added.frames.at(-1)!.scene)['#tail->']).toBe('n9')
		const removed = deleteFromList({ ...base, tail: 'tail' }, 'n3')
		expect(captions(removed)).toContain('tail = prev: 9 is the last node now')
	})

	it('circular: a new head means the last node points at it; deleting the head too', () => {
		const added = insertIntoList({ ...base, ends: 'circular' }, undefined, 'n9', '1')
		expect(captions(added)).toContain('last.next = node: the last node, 4, points at the new head')
		expect(ends(added.frames.at(-1)!.scene)).toMatchObject({ 'n3->': 'n9', '#head->': 'n9' })
		const removed = deleteFromList({ ...base, ends: 'circular' }, 'n0')
		expect(captions(removed)).toContain('last.next = head: the last node, 4, points at 3 now')
	})

	it('circular: arrows back to the front loop round the list in every step, clear of a new node', () => {
		const removed = deleteFromList({ ...base, ends: 'circular' }, 'n0')
		const last = removed.frames.at(-1)!.scene!
		expect(last.edges.find((e) => e.key === 'n3->')).toMatchObject({ to: 'n1', via: expect.any(Array) })
		const added = insertIntoList({ ...base, ends: 'circular' }, 'n3', 'n9', '8')
		const scene = added.frames.at(-1)!.scene!
		const [n3, n9] = ['n3', 'n9'].map((k) => scene.nodes.find((n) => n.key === k)!)
		// Just past the last node, not half-way back to the first.
		expect(n9.x).toBeGreaterThan(n3.x)
		expect(scene.edges.find((e) => e.key === 'n9->')).toMatchObject({ to: 'n0', via: expect.any(Array) })
		expect(scene.edges.find((e) => e.key === 'n3->')?.via).toBeUndefined()
		const below = Math.max(...scene.edges.find((e) => e.key === 'n9->')!.via!.map((p) => p.y))
		expect(below).toBeGreaterThan(n9.y + n9.h)
	})

	it('sentinel: inserting at the front and deleting the first value are no special case', () => {
		const added = insertIntoList({ ...base, sentinel: 'sentinel' }, undefined, 'n9', '1')
		expect(captions(added)[0]).toBe('curr = the sentinel: inserting at the front needs no special case')
		expect(ends(added.frames.at(-1)!.scene)).toMatchObject({ '#sentinel->': 'n9', 'n9->': 'n0', '#head->': '#sentinel' })
		expect(added.nodes!.map((n) => n.value)).toEqual(['1', '7', '3', '9', '4'])
		const removed = deleteFromList({ ...base, sentinel: 'sentinel' }, 'n0')
		expect(captions(removed)[0]).toBe('prev = the sentinel, curr = head.next (7): found 7')
		expect(removed.nodes!.map((n) => n.value)).toEqual(['3', '9', '4'])
	})

	it('doubly linked delete fixes the next node\'s prev too', () => {
		const op = deleteFromList({ ...base, links: 'doubly' }, 'n1')
		expect(captions(op)).toContain('curr.next.prev = prev: 9 now points back past 3, at 7')
	})

	it('find round a circle, or into a cycle, stops when it comes back', () => {
		expect(captions(findInList({ ...base, ends: 'circular' }, '5')).at(-1)).toBe('4 ≠ 5, so curr = curr.next: back at the head. 5 is not in the list')
		expect(captions(findInList({ ...base, cycleTo: 'n1' }, '5')).at(-1)).toBe(
			'4 ≠ 5, so curr = curr.next: 3 again, a node already seen: the list has a cycle. 5 is not in the list'
		)
	})

	it('reverse a doubly linked list by swapping each node\'s pointers; a tail ends on the old head', () => {
		const op = reverseList({ ...base, links: 'doubly', tail: 'tail' })
		expect(op.nodes!.map((n) => n.value)).toEqual(['4', '9', '3', '7'])
		expect(captions(op)[1]).toBe('swap curr.next and curr.prev: 7 now points forward at null, back at 3')
		expect(captions(op).at(-1)).toBe('head = the old last node, 4; tail = the old first, 7')
		expect(captions(reverseList({ ...base, sentinel: 'sentinel' })).at(-1)).toBe('sentinel.next = prev: the values start at 4, reversed')
	})
})

describe('append, print, print backwards', () => {
	const four = ['7', '3', '9', '4'].map((value, i) => ({ id: `n${i}`, value, dx: 0, dy: 0 }))
	const base = { nodes: four, direction: 'right' as const, size: 'm' as const }
	const captions = (op: { frames: { caption?: string }[] }) => op.frames.map((f) => f.caption)
	const ends = (scene: Scene | undefined) => Object.fromEntries((scene?.edges ?? []).map((e) => [e.key, e.to]))

	it('append without a tail walks to the end, counting the steps: O(n)', () => {
		const op = appendToList(base, 'n9', '8')
		expect(captions(op).slice(0, 4)).toEqual([
			'curr = head (7)',
			'curr.next != null, so curr = curr.next (3)',
			'curr.next != null, so curr = curr.next (9)',
			'curr.next != null, so curr = curr.next (4): its next is null, so it is the last node',
		])
		expect(op.frames[3].counts).toEqual({ steps: 3 })
		expect(captions(op).slice(4)).toEqual([
			'node = new Node(8): its next is null',
			'curr.next = node: 4 points at 8',
			'Appended, but finding the end took 3 steps, one per node: O(n). A tail pointer makes it O(1)',
		])
		expect(op.nodes!.map((n) => n.value)).toEqual(['7', '3', '9', '4', '8'])
		expect(ends(op.frames.at(-1)!.scene)).toMatchObject({ 'n3->': 'n9', 'n9->': NULL_KEY })
	})

	it('append with a tail: no walk, two assignments', () => {
		const op = appendToList({ ...base, tail: 'tail' }, 'n9', '8')
		expect(captions(op)).toEqual([
			'tail is at the last node, 4: no walk needed',
			'node = new Node(8): its next is null',
			'tail.next = node: 4 points at 8',
			'tail = node: 8 is the last node now',
			'Appended in O(1): 2 assignments and no walk, however long the list',
		])
		expect(ends(op.frames.at(-1)!.scene)['#tail->']).toBe('n9')
	})

	it('append to a doubly linked circular list links both ways round', () => {
		const op = appendToList({ ...base, links: 'doubly', ends: 'circular', tail: 'tail' }, 'n9', '8')
		expect(captions(op).slice(2, 6)).toEqual([
			'node.next = tail.next: the new last node points round to 7, as the old one does',
			'node.prev = tail: it points back at 4',
			'tail.next = node: 4 points at 8',
			'head.prev = node: round the circle, 7 points back at 8',
		])
		const scene = op.frames.at(-1)!.scene!
		expect(ends(scene)).toMatchObject({ 'n9->': 'n0', 'n9<-': 'n3', 'n3->': 'n9', 'n0<-': 'n9', '#tail->': 'n9' })
		expect(scene.edges.find((e) => e.key === 'n9->')?.via).toBeDefined()
	})

	it('print: while curr != null; round a circle a do-while; with a sentinel, stop at it', () => {
		const plain = printList(base)
		expect(plain.frames.at(-1)).toMatchObject({ caption: 'print 4; curr = curr.next: null, so stop', strips: [{ items: ['7', '3', '9', '4'] }] })
		const circle = printList({ ...base, ends: 'circular' })
		expect(circle.frames[0].caption).toContain('do { print; curr = curr.next } while (curr != head)')
		expect(circle.frames.at(-1)!.caption).toBe('print 4; curr = curr.next: the head again, so stop')
		expect(circle.frames.at(-1)!.pointers).toEqual([expect.objectContaining({ at: 'n0' })])
		const guarded = printList({ ...base, ends: 'circular', sentinel: 'sentinel' })
		expect(guarded.frames[0].caption).toBe('curr = head.next (past the sentinel): 7. while (curr != sentinel)')
		expect(guarded.frames.at(-1)!.caption).toBe('print 4; curr = curr.next: the sentinel, so stop')
	})

	it('print backwards from the tail, or head.prev round a circle, or after walking to the end', () => {
		const tail = printBackwards({ ...base, links: 'doubly', tail: 'tail' })
		expect(captions(tail)[0]).toBe('curr = tail (4)')
		expect(tail.frames.at(-1)).toMatchObject({ caption: 'print 7; curr = curr.prev: null, so stop', strips: [{ items: ['4', '9', '3', '7'] }] })
		expect(captions(printBackwards({ ...base, links: 'doubly', ends: 'circular' }))[0]).toContain('curr = head.prev (4)')
		const walk = printBackwards({ ...base, links: 'doubly' })
		expect(captions(walk).slice(0, 4).at(-1)).toBe('curr = curr.next (4): the last node. Now back')
		expect(captions(printBackwards({ ...base, links: 'doubly', sentinel: 'sentinel', tail: 'tail' })).at(-1)).toBe(
			'print 7; curr = curr.prev: the sentinel, so stop'
		)
	})
})

describe("Floyd's cycle detection", () => {
	const nodes = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `n${i}`, value: String(10 * (i + 1)), dx: 0, dy: 0 }))
	const base = { direction: 'right' as const, size: 'm' as const }
	const where = (op: ReturnType<typeof detectCycle>) => op.frames.map((f) => f.pointers!.map((p) => `${p.name}:${p.at}`).join(' '))

	it('fast runs off the end of a list without a cycle', () => {
		const op = detectCycle({ ...base, nodes: nodes(4) })
		expect(where(op)).toEqual(['slow:n0 fast:n0', 'slow:n1 fast:n2', `slow:n2 fast:${NULL_KEY}`, `slow:n2 fast:${NULL_KEY}`])
		expect(op.frames.at(-1)!.caption).toBe('fast is null, so it ran off the end: no cycle')
		expect(op.finalFlash).toBeUndefined()
	})

	it('slow and fast meet in the cycle; from the head and the meeting point they meet at its start', () => {
		const op = detectCycle({ ...base, nodes: nodes(5), cycleTo: 'n1' })
		expect(where(op)).toEqual([
			'slow:n0 fast:n0',
			'slow:n1 fast:n2',
			'slow:n2 fast:n4',
			'slow:n3 fast:n2',
			'slow:n4 fast:n4',
			'slow:n0 fast:n4',
			'slow:n1 fast:n1',
			'slow:n1 fast:n1',
		])
		expect(op.frames[4].caption).toContain('they meet')
		expect(op.frames.at(-1)!.caption).toMatch(/^They meet at 20: the cycle starts here/)
		expect(op.finalFlash).toEqual({ n1: 'green' })
	})

	it('round a circular list the cycle starts at the head', () => {
		const op = detectCycle({ ...base, nodes: nodes(4), ends: 'circular' })
		expect(op.finalFlash).toEqual({ n0: 'green' })
		expect(op.frames.at(-1)!.counts).toEqual({ steps: 4 })
	})
})

describe('the tidy last step', () => {
	const four = ['7', '3', '9', '4'].map((value, i) => ({ id: `n${i}`, value, dx: 0, dy: 0 }))
	const base = { nodes: four, direction: 'right' as const, size: 'm' as const }
	const at = (scene: Scene, key: string) => {
		const n = scene.nodes.find((n) => n.key === key)!
		return { x: Math.round(n.x), y: Math.round(n.y) }
	}

	it('draws the result in a line, the nodes that stay where they are now', () => {
		const op = insertIntoList(base, undefined, 'n9', '1')
		const frames = endTidied(base, { ...base, nodes: op.nodes! }, op.frames)
		expect(frames).toHaveLength(op.frames.length + 1)
		const tidy = frames.at(-1)!
		const before = listScene(base)
		for (const key of ['n0', 'n1', 'n2', 'n3']) expect(at(tidy.scene!, key)).toEqual(at(before, key))
		// The new node in line, a step before the old head.
		expect(at(tidy.scene!, 'n9').y).toBe(at(before, 'n0').y)
		expect(at(tidy.scene!, 'n9').x).toBeLessThan(at(before, 'n0').x)
		expect(tidy.caption).toBe('Tidied up: the same links, drawn in a line')
	})

	it("puts out the arrows' lights, keeps the nodes'", () => {
		const op = deleteFromList({ ...base, ends: 'circular' }, 'n2')
		const tidy = endTidied(base, { ...base, ends: 'circular', nodes: op.nodes! }, op.frames).at(-1)!
		expect(tidy.scene!.nodes.some((n) => n.key === 'n2')).toBe(false)
		expect(Object.keys(tidy.flash!).every((k) => k.startsWith('edge:'))).toBe(true)
		expect(Object.values(tidy.flash!).every((c) => c === null)).toBe(true)
	})

	it("a closing remark that changes nothing stays the last word, on the tidy step", () => {
		const op = appendToList({ ...base, tail: 'tail' }, 'n9', '8')
		const frames = endTidied({ ...base, tail: 'tail' }, { ...base, tail: 'tail', nodes: op.nodes! }, op.frames)
		expect(frames).toHaveLength(op.frames.length)
		expect(frames.at(-1)!.caption).toBe('Appended in O(1): 2 assignments and no walk, however long the list')
		expect(at(frames.at(-1)!.scene!, 'n9').y).toBe(at(listScene(base), 'n3').y)
	})

	it('is left out when the last step already looks like the result', () => {
		const frames = [{ scene: listScene(base) }]
		expect(endTidied(base, base, frames)).toEqual(frames)
	})
})

describe("predict mode's questions", () => {
	it('find asks whether curr has found it or where it goes, the same either way', () => {
		const { frames } = findInList(props, '9')
		expect(frames.map((f) => f.ask)).toEqual([
			'Find 9: where does curr start?',
			'curr is at 7: found 9, or where does curr go?',
			'curr is at 3: found 9, or where does curr go?',
			'curr is at 9: found 9, or where does curr go?',
		])
		expect(frames[3].askFocus).toEqual(['n2'])
	})

	it('insert asks which line comes next at every assignment (the order is the lesson)', () => {
		const { frames } = insertIntoList(props, 'n1', 'n9', '5')
		expect(frames[0].ask).toBe(false)
		expect(frames.slice(1).every((f) => f.ask === 'Which line comes next?')).toBe(true)
		expect(frames.length).toBeGreaterThan(3)
	})

	it('reverse asks where prev and curr start, then which line of the loop comes next', () => {
		const { frames } = reverseList(props)
		expect(frames[0].ask).toBe('Reverse the list: where do prev and curr start?')
		expect(frames.slice(1).every((f) => f.ask === 'Which line comes next?')).toBe(true)
	})
})
