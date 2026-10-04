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

	it('pop takes the last value pushed, freeing its slot; an empty stack underflows', () => {
		const op = pop(fixed(['1', '2', '3', ''], 3))
		expect(op.result).toMatchObject({ values: ['1', '2', '', ''], used: 2 })
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
