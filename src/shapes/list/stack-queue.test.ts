import { describe, expect, it } from 'vitest'
import type { Scene } from '../../nodelink/scene'
import { HEAD_KEY, NULL_KEY, TAIL_KEY } from './layout'
import { dequeueFrom, enqueueOnto, peekAt, popFrom, pushOnto } from './stack-queue'

const nodes = (...values: string[]) => values.map((value, i) => ({ id: `n${i}`, value, dx: 0, dy: 0 }))
const base = { direction: 'right' as const, size: 'm' as const }
const captions = (op: { frames: { caption?: string }[] }) => op.frames.map((f) => f.caption)
const ends = (scene: Scene | undefined) => Object.fromEntries((scene?.edges ?? []).map((e) => [e.key, e.to]))
const HEAD = `${HEAD_KEY}->`
const TAIL = `${TAIL_KEY}->`

describe('linked stack', () => {
	const stack = { ...base, kind: 'stack' as const }

	it('push: node.next = top, top = node; onto an empty stack node.next is null', () => {
		const op = pushOnto({ ...stack, nodes: nodes('7', '3') }, 'n9', '5')
		expect(captions(op)).toEqual([
			'node = new Node(5)',
			'node.next = top: the new node points at 7',
			'top = node: 5 is on top. O(1): nothing walks, nothing moves',
		])
		expect(op.nodes!.map((n) => n.value)).toEqual(['5', '7', '3'])
		expect(ends(op.frames.at(-1)!.scene)).toMatchObject({ [HEAD]: 'n9', 'n9->': 'n0' })
		const empty = pushOnto({ ...stack, nodes: [] }, 'n0', '5')
		expect(captions(empty)[1]).toBe('node.next = top: null, as the stack is empty')
		expect(empty.nodes).toEqual([{ id: 'n0', value: '5', dx: 0, dy: 0 }])
	})

	it('pop: v = top.value, top = top.next, the node drops out; popping the last empties it; empty underflows', () => {
		const op = popFrom({ ...stack, nodes: nodes('7', '3') })
		expect(captions(op)).toEqual(['v = top.value = 7', 'top = top.next: 3 is on top now', 'Nothing points at 7 any more: popped 7, the last value pushed. O(1)'])
		expect(op.frames[0].strips).toEqual([{ title: 'popped', items: ['7'] }])
		expect(op.nodes!.map((n) => n.value)).toEqual(['3'])
		const last = popFrom({ ...stack, nodes: nodes('3') })
		expect(captions(last)[1]).toBe('top = top.next: null, so the stack is empty now')
		expect(last.nodes).toEqual([])
		expect(popFrom({ ...stack, nodes: [] })).toEqual({ frames: [{ caption: 'Pop: top is null, the stack is empty. Stack underflow' }] })
	})

	it('a doubly linked stack keeps its prev links', () => {
		expect(captions(pushOnto({ ...stack, links: 'doubly', nodes: nodes('7') }, 'n9', '5'))).toContain('top.prev = node: 7 points back at 5')
		expect(captions(popFrom({ ...stack, links: 'doubly', nodes: nodes('7', '3') }))).toContain('top.prev = null: nothing comes before 3 now')
	})

	it('peek looks at the top and changes nothing', () => {
		expect(peekAt({ ...stack, nodes: nodes('7', '3') })).toMatchObject({ frames: [{ caption: 'Peek: top.value = 7, still on the stack' }], finalFlash: { n0: 'blue' } })
		expect(peekAt({ ...stack, nodes: [] }).frames[0].caption).toBe('Peek: top is null, the stack is empty: nothing to see')
	})
})

describe('linked queue', () => {
	const queue = { ...base, kind: 'queue' as const }

	it('enqueue: rear.next = node, rear = node; into an empty queue front = rear = node', () => {
		const op = enqueueOnto({ ...queue, nodes: nodes('7', '3') }, 'n9', '5')
		expect(captions(op)).toEqual([
			'node = new Node(5): its next is null',
			'rear.next = node: 3 points at 5',
			'rear = node: 5 is last in line. O(1): the rear pointer saves walking to the end',
		])
		expect(op.nodes!.map((n) => n.value)).toEqual(['7', '3', '5'])
		expect(ends(op.frames.at(-1)!.scene)).toMatchObject({ 'n1->': 'n9', [TAIL]: 'n9', [HEAD]: 'n0' })
		const empty = enqueueOnto({ ...queue, nodes: [] }, 'n0', '5')
		expect(captions(empty).slice(1)).toEqual(['rear is null, so the queue is empty: front = node', 'rear = node: 5 is first and last in line'])
		expect(ends(empty.frames.at(-1)!.scene)).toMatchObject({ [HEAD]: 'n0', [TAIL]: 'n0' })
	})

	it('dequeue: front = front.next; taking the last one sets rear = null too', () => {
		const op = dequeueFrom({ ...queue, nodes: nodes('7', '3') })
		expect(captions(op)).toEqual(['v = front.value = 7', 'front = front.next: 3 is first in line now', 'Nothing points at 7 any more: dequeued 7, the first in. O(1)'])
		const last = dequeueFrom({ ...queue, nodes: nodes('7') })
		expect(captions(last).slice(1, 3)).toEqual([
			'front = front.next: null, so the queue is empty now',
			'front is null, so rear = null too: else it would still point at 7, a node no longer in the list',
		])
		expect(ends(last.frames.at(-1)!.scene)).toMatchObject({ [HEAD]: NULL_KEY, [TAIL]: NULL_KEY })
		expect(last.nodes).toEqual([])
		expect(dequeueFrom({ ...queue, nodes: [] }).frames[0].caption).toBe('Dequeue: front is null, the queue is empty')
	})

	it('peek looks at the front', () => {
		expect(peekAt({ ...queue, nodes: nodes('7', '3') }).frames[0].caption).toBe('Peek: front.value = 7, still first in line')
	})
})
