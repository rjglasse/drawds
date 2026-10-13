import { describe, expect, it } from 'vitest'
import type { ArrayOperation } from './operations'
import { dequeue, enqueue, peekQueue, peekStack, pop, push } from './stack-queue'

const last = (op: ArrayOperation) => op.frames[op.frames.length - 1]
const at = (op: ArrayOperation, name: string) => last(op).pointers?.find((p) => p.name === name)?.at

describe('stacks', () => {
	const fixed = (values: string[], used: number) => ({ values, marks: {}, used, fixed: true })

	it('push: top = top + 1, then a[top] = value', () => {
		const op = push(fixed(['1', '2', '', ''], 2), '9')
		expect(op.frames.map((f) => f.caption)).toEqual(['Push 9: top = top + 1 = 2', 'a[top] = 9'])
		expect(op.result).toMatchObject({ values: ['1', '2', '9', ''], used: 3 })
		expect(at(op, 'top')).toBe('2')
	})

	it('a full fixed stack overflows; nothing changes', () => {
		const op = push(fixed(['1', '2'], 2), '9')
		expect(op.result).toBeUndefined()
		expect(op.frames[0].caption).toMatch(/Stack overflow/)
	})

	it('a growing stack gets a new cell on top', () => {
		const op = push({ values: ['1'], marks: {}, used: 1, fixed: false }, '9')
		expect(op.result).toMatchObject({ values: ['1', '9'], used: 2 })
		expect(op.frames[0].caption).toBe('Push 9: top = top + 1 = 1, a new cell on top')
	})

	it('pop takes the last value pushed, leaving it in its slot (off the stack); an empty stack underflows', () => {
		const op = pop(fixed(['1', '2', '3', ''], 3))
		// Lecture 6: the 3 stays in a[2] until a push overwrites it.
		expect(op.result).toMatchObject({ values: ['1', '2', '3', ''], used: 2 })
		expect(last(op).caption).toBe('top = top - 1 = 1: a[2] still holds 3, but it is off the stack now, until a push overwrites it. Popped 3, the last value pushed')
		expect(push(fixed(['1', '2', '3', ''], 2), '7').frames.at(-1)?.caption).toBe('a[top] = 7, over the 3 an earlier pop left there')
		expect([op.code, push(fixed(['1', ''], 1), '7').code]).toEqual(['stack-pop', 'stack-push'])
		expect(last(op).strips).toEqual([{ title: 'popped', items: ['3'] }])
		expect(at(op, 'top')).toBe('1')
		expect(pop(fixed(['', ''], 0)).frames[0].caption).toBe('Pop: top = -1, the stack is empty. Stack underflow')
		expect(pop({ values: ['1', '2'], marks: {}, used: 2, fixed: false }).result).toMatchObject({ values: ['1'], used: 1 })
	})

	it('peek looks without taking', () => {
		const op = peekStack(fixed(['1', '2', ''], 2))
		expect(op.result).toBeUndefined()
		expect(op.frames[0].caption).toBe('Peek: a[top] = 2, still on the stack')
	})
})

describe('queues', () => {
	const ring = (values: string[], used: number, front: number) => ({ values, marks: {}, used, front, fixed: true })

	it('enqueue writes at rear, which then wraps round past the end', () => {
		const op = enqueue(ring(['', 'a', 'b', ''], 2, 1), 'c')
		expect(op.result).toMatchObject({ values: ['', 'a', 'b', 'c'], used: 3, front: 1 })
		expect(last(op).caption).toBe('rear = (rear + 1) % 4 = 0: past the end, it wraps round to 0; size = 3')
		expect(at(op, 'rear')).toBe('0')
	})

	it('a full circular buffer refuses; rear has come round to front', () => {
		const op = enqueue(ring(['c', 'a', 'b'], 3, 1), 'd')
		expect(op.result).toBeUndefined()
		expect(op.frames[0].caption).toMatch(/the queue is full \(rear has come round to front\)/)
		expect(op.frames[0].pointers?.map((p) => p.at)).toEqual(['1', '1'])
	})

	it('dequeue takes a[front] and moves front on: nothing else moves', () => {
		const op = dequeue(ring(['c', '', 'a', 'b'], 3, 2))
		expect(op.result).toMatchObject({ values: ['c', '', '', 'b'], used: 2, front: 3 })
		expect(last(op).strips).toEqual([{ title: 'dequeued', items: ['a'] }])
		expect(dequeue(ring(['c', '', '', 'b'], 2, 3)).result).toMatchObject({ front: 0 })
		expect(dequeue(ring(['', ''], 0, 1)).frames[0].caption).toBe('Dequeue: size = 0, the queue is empty')
	})

	it('a growing queue (a list) shifts every value left to dequeue one', () => {
		const op = dequeue({ values: ['a', 'b', 'c'], marks: {}, used: 3, front: 0, fixed: false })
		expect(op.result).toMatchObject({ values: ['b', 'c'], used: 2 })
		expect(last(op).counts).toEqual({ moves: 2 })
		expect(last(op).caption).toMatch(/^The list shrinks by one cell. 2 values moved to dequeue one/)
		const added = enqueue({ values: ['a'], marks: {}, used: 1, front: 0, fixed: false }, 'b')
		expect(added.result).toMatchObject({ values: ['a', 'b'], used: 2 })
	})

	it('peek looks at the front', () => {
		expect(peekQueue(ring(['', 'a', 'b'], 2, 1)).frames[0].caption).toBe('Peek: a[front] = a, still first in line')
	})
})

describe("predict mode's questions", () => {
	const stack = (values: string[], used: number, fixed = true) => ({ values, marks: {}, used, fixed })
	const ring = (values: string[], used: number, front: number, fixed = true) => ({ values, marks: {}, used, front, fixed })
	const asks = (op: ArrayOperation) => op.frames.map((f) => f.ask)

	it('every step asks its own question, the same whether it overflows, wraps or shifts', () => {
		const ops = [
			push(stack(['1', '2', '', ''], 2), '9'),
			push(stack(['1', '2'], 2), '9'),
			push(stack(['1', '2'], 2, false), '9'),
			pop(stack(['1', '2', ''], 2)),
			pop(stack(['', ''], 0)),
			peekStack(stack(['1'], 1)),
			enqueue(ring(['', 'a', 'b'], 2, 1), 'c'),
			enqueue(ring(['a', 'b'], 2, 0), 'c'),
			dequeue(ring(['', 'a', 'b'], 2, 1)),
			dequeue(ring(['a', 'b', 'c'], 3, 0, false)),
			peekQueue(ring(['', 'a', 'b'], 2, 1)),
		]
		for (const op of ops) for (const f of op.frames) expect(f.ask, f.caption).toBeDefined()
		// Pushing onto a full stack asks what pushing onto any stack asks.
		expect(asks(push(stack(['1', '2'], 2), '9'))[0]).toBe(asks(push(stack(['1', '2', '', ''], 2), '9'))[0])
		// Lecture 6: what a pop leaves in the slot; where rear goes round the buffer.
		expect(asks(pop(stack(['1', '2', ''], 2)))).toEqual(['Which value comes off?', 'top = top - 1: what happens to the 2 in a[1]?'])
		expect(asks(enqueue(ring(['', 'a', ''], 1, 1), 'c'))[1]).toBe('rear = (rear + 1) % 3: where does rear go?')
	})

	it('dequeue asks what happens to the rest: nothing moves round a buffer, a list shifts (asked once)', () => {
		const rest = 'a is taken: what happens to the values still in the queue?'
		expect(asks(dequeue(ring(['a', 'b', 'c'], 3, 0)))).toEqual(['Which value comes off?', rest])
		expect(asks(dequeue(ring(['a', 'b', 'c'], 3, 0, false)))).toEqual(['Which value comes off?', rest, false, false])
		expect(asks(dequeue(ring(['a'], 1, 0, false)))).toEqual(['Which value comes off?', rest])
	})
})
