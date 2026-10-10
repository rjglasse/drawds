import type { MarkColor } from '../../cells/marks'
import type { Pointer } from '../../pointers/pointers'
import { recorder, withoutCell, type ArrayOperation, type ArrayState } from './operations'

// Stack and queue operations, step by step, narrated as the code a teacher writes: the top marker
// climbs and drops, front and rear chase each other round a circular buffer, popped or dequeued
// values land in a strip under the structure. A fixed stack overflows when full; a fixed queue is
// full when size = capacity (rear has caught up with front), which looks just like empty.

const LOOK: MarkColor = 'orange'
const DONE: MarkColor = 'green'
const GONE: MarkColor = 'red'
const PEEK: MarkColor = 'blue'

const marker = (name: string, at: number): Pointer => ({ id: `@${name}`, name, at: String(at) })

/** A stack: its values from the bottom (index 0), how many are in use, and whether its capacity is fixed. */
export interface StackState extends ArrayState {
	used: number
	fixed: boolean
}

/**
 * Push `value`: top = top + 1, then a[top] = value (over whatever an earlier pop left there). A full
 * fixed stack overflows instead. A fixed stack is lecture 6's ArrayStack: its code beside it.
 */
export function push(start: StackState, value: string): ArrayOperation {
	const { used, fixed } = start
	const capacity = start.values.length
	const r = recorder(start, {})
	const code = fixed ? 'stack-push' : undefined
	const top = used - 1
	r.let('v', value)
	if (fixed && used >= capacity) {
		r.step(`Push ${value}: top = ${top}, the last slot: the stack is full. Stack overflow (Capacity > Grow makes room)`, {
			lit: { [top]: GONE },
			pointers: [marker('top', top)],
			line: 'overflow',
		})
		return { frames: r.frames, code }
	}
	if (!fixed) r.set({ ...r.state, values: [...r.state.values, ''], used: used + 1 })
	r.step(`Push ${value}: top = top + 1 = ${top + 1}${fixed ? '' : ', a new cell on top'}`, {
		lit: { [top + 1]: LOOK },
		pointers: [marker('top', top + 1)],
		line: 'inc',
	})
	const values = [...r.state.values]
	const old = values[top + 1]
	values[top + 1] = value
	r.set({ ...r.state, values, used: used + 1 })
	r.step(`a[top] = ${value}${fixed && old ? `, over the ${old} an earlier pop left there` : ''}`, {
		lit: { [top + 1]: DONE },
		pointers: [marker('top', top + 1)],
		line: 'store',
	})
	return { frames: r.frames, result: r.state, finalFlash: { [top + 1]: DONE }, code }
}

/**
 * Pop: take a[top], then top = top - 1. In a fixed stack (an array) the value stays in its slot,
 * faded, no longer on the stack, until a push overwrites it. An empty stack underflows.
 */
export function pop(start: StackState): ArrayOperation {
	const { used, fixed } = start
	const r = recorder(start, {})
	const code = fixed ? 'stack-pop' : undefined
	const top = used - 1
	if (used === 0) {
		r.step('Pop: top = -1, the stack is empty. Stack underflow', { pointers: [marker('top', -1)], line: 'underflow' })
		return { frames: r.frames, code }
	}
	const v = start.values[top]
	const popped = [{ title: 'popped', items: [v] }]
	r.let('v', v)
	r.step(`Pop: v = a[top] = ${v}`, { lit: { [top]: LOOK }, pointers: [marker('top', top)], strips: popped, line: 'take' })
	r.set({ ...(fixed ? r.state : { ...r.state, ...withoutCell(r.state, top) }), used: used - 1 })
	r.step(
		`top = top - 1 = ${top - 1}${fixed ? `: a[${top}] still holds ${v}, but it is off the stack now, until a push overwrites it` : ', the cell goes'}. Popped ${v}, the last value pushed`,
		{ pointers: [marker('top', top - 1)], strips: popped, line: 'dec' }
	)
	return { frames: r.frames, result: r.state, code }
}

/** Peek: look at a[top] without taking it. */
export function peekStack(start: StackState): ArrayOperation {
	const r = recorder(start, {})
	const top = start.used - 1
	const code = start.fixed ? 'stack-peek' : undefined
	if (top < 0) r.step('Peek: top = -1, the stack is empty: nothing to see', { pointers: [marker('top', -1)], line: 'peek-empty' })
	else r.step(`Peek: a[top] = ${start.values[top]}, still on the stack`, { lit: { [top]: PEEK }, pointers: [marker('top', top)], line: 'peek' })
	return { frames: r.frames, code }
}

/**
 * A queue: with a fixed capacity, a circular buffer whose values sit in front .. front + used - 1
 * (mod capacity); growing, a list from index 0.
 */
export interface QueueState extends ArrayState {
	used: number
	front: number
	fixed: boolean
}

const queueMarkers = (front: number, rear: number) => [marker('front', front), marker('rear', rear)]

/**
 * Enqueue `value`. Circular buffer: a[rear] = value, then rear = (rear + 1) % capacity, wrapping
 * round to 0 past the end; full when size = capacity. Growing: a new cell at the end.
 */
export function enqueue(start: QueueState, value: string): ArrayOperation {
	const { used, front, fixed } = start
	const capacity = start.values.length
	const r = recorder(start, {})
	if (!fixed) {
		r.set({ ...r.state, values: [...r.state.values, value], used: used + 1 })
		r.step(`Enqueue ${value}: the list grows by one cell at the end, a[${used}] = ${value}`, {
			lit: { [used]: DONE },
			pointers: queueMarkers(0, used + 1),
		})
		return { frames: r.frames, result: r.state, finalFlash: { [used]: DONE } }
	}
	const rear = (front + used) % capacity
	if (used >= capacity) {
		r.step(`Enqueue ${value}: size = capacity = ${capacity}, the queue is full (rear has come round to front)`, {
			lit: { [rear]: GONE },
			pointers: queueMarkers(front, rear),
		})
		return { frames: r.frames }
	}
	const values = [...r.state.values]
	values[rear] = value
	r.set({ ...r.state, values })
	r.step(`Enqueue ${value}: a[rear] = a[${rear}] = ${value}`, { lit: { [rear]: DONE }, pointers: queueMarkers(front, rear) })
	const next = (rear + 1) % capacity
	r.set({ ...r.state, used: used + 1 })
	const wrap = next === 0 ? `: past the end, it wraps round to 0` : ''
	const full = used + 1 === capacity ? '. size = capacity: the queue is full now' : ''
	r.step(`rear = (rear + 1) % ${capacity} = ${next}${wrap}; size = ${used + 1}${full}`, {
		lit: { [rear]: DONE },
		pointers: queueMarkers(front, next),
	})
	return { frames: r.frames, result: r.state, finalFlash: { [rear]: DONE } }
}

/**
 * Dequeue: take a[front]. Circular buffer: its slot is free again and front = (front + 1) %
 * capacity: nothing moves. Growing: every other value moves one cell left, which is what makes a
 * list a slow queue.
 */
export function dequeue(start: QueueState): ArrayOperation {
	const { used, front, fixed } = start
	const capacity = start.values.length
	const r = recorder(start, { moves: 0 })
	const rear = fixed ? (front + used) % Math.max(1, capacity) : used
	if (used === 0) {
		r.step('Dequeue: size = 0, the queue is empty', { pointers: queueMarkers(front, rear) })
		return { frames: r.frames }
	}
	const v = start.values[front]
	const taken = [{ title: 'dequeued', items: [v] }]
	r.step(`Dequeue: v = a[front] = a[${front}] = ${v}`, { lit: { [front]: LOOK }, pointers: queueMarkers(front, rear), strips: taken })
	if (fixed) {
		const next = (front + 1) % capacity
		r.set({ ...r.state, values: r.state.values.map((x, i) => (i === front ? '' : x)), used: used - 1, front: next })
		const wrap = next === 0 ? `: past the end, it wraps round to 0` : ''
		r.step(`front = (front + 1) % ${capacity} = ${next}${wrap}; size = ${used - 1}. Nothing moved: dequeued ${v}, the first in`, {
			pointers: queueMarkers(next, rear),
			strips: taken,
		})
		return { frames: r.frames, result: r.state }
	}
	// A list: a[0] goes, and every value after it moves one cell left.
	for (let i = 0; i < used - 1; i++) {
		const values = [...r.state.values]
		values[i] = values[i + 1]
		r.set({ ...r.state, values })
		r.counts.moves++
		r.step(`a[${i}] = a[${i + 1}] (${values[i]})`, { pointers: queueMarkers(0, used), moves: [[i + 1, i]], strips: taken })
	}
	r.set({ ...r.state, values: r.state.values.slice(0, used - 1), used: used - 1 })
	const moved = r.counts.moves
	r.step(
		`The list shrinks by one cell. ${moved} value${moved === 1 ? '' : 's'} moved to dequeue one: a circular buffer moves none (fixed capacity)`,
		{ pointers: queueMarkers(0, used - 1), strips: taken }
	)
	return { frames: r.frames, result: r.state }
}

/** Peek: look at a[front] without taking it. */
export function peekQueue(start: QueueState): ArrayOperation {
	const { used, front, fixed } = start
	const r = recorder(start, {})
	const rear = fixed ? (front + used) % Math.max(1, start.values.length) : used
	if (used === 0) r.step('Peek: size = 0, the queue is empty: nothing to see', { pointers: queueMarkers(front, rear) })
	else r.step(`Peek: a[front] = ${start.values[front]}, still first in line`, { lit: { [front]: PEEK }, pointers: queueMarkers(front, rear) })
	return { frames: r.frames }
}
