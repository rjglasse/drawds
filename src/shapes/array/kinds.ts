import { BUILT_IN, type Pointer } from '../../pointers/pointers'
import { usedCount, type ArrayShapeProps } from './array-shape-types'

// What kind of array: a plain one, a stack or a queue. Stacks stand upright with index 0 at the
// bottom and a top marker; queues run left to right with front and rear markers, and with a fixed
// capacity are circular buffers: the values sit in front .. front + size - 1, wrapping round.

/** How the cells run: along a row, down a column, or up a column (a stack). */
export type ArrayAxis = 'horizontal' | 'vertical' | 'up'

type KindProps = Partial<Pick<ArrayShapeProps, 'kind' | 'direction' | 'sizing' | 'used' | 'front'>> & { values?: readonly string[] }

export function arrayAxis({ kind, direction = 'horizontal' }: KindProps): ArrayAxis {
	return kind === 'stack' ? 'up' : kind === 'queue' ? 'horizontal' : direction
}

const MARKER = BUILT_IN

/** Where a queue's values start (a circular buffer's front; 0 for anything else). */
export function frontOf({ kind, sizing, front = 0, values = [] }: KindProps) {
	return kind === 'queue' && sizing === 'fixed' && values.length ? front % values.length : 0
}

const used = (props: KindProps) =>
	usedCount({ sizing: props.sizing ?? 'grows', used: props.used ?? props.values?.length ?? 0, values: props.values ?? [] })

/**
 * A stack's top (the last value, -1 when empty); a queue's front (its first value) and rear (where
 * the next one goes: past the end of a growing queue, wrapping round in a circular buffer).
 */
export function arrayMarkers(props: KindProps): Pointer[] {
	const n = props.values?.length ?? 0
	if (props.kind === 'stack') return [{ id: `${MARKER}top`, name: 'top', at: String(used(props) - 1) }]
	if (props.kind !== 'queue') return []
	const front = frontOf(props)
	const rear = props.sizing === 'fixed' ? (n ? (front + used(props)) % n : 0) : n
	return [
		{ id: `${MARKER}front`, name: 'front', at: String(front) },
		{ id: `${MARKER}rear`, name: 'rear', at: String(rear) },
	]
}

/** Whether cell i holds a value: the first `used` cells, or a circular buffer's front .. rear. */
export function isUsed(props: KindProps, i: number) {
	const n = props.values?.length ?? 0
	if (i < 0 || i >= n) return false
	if (props.kind === 'queue' && props.sizing === 'fixed') return (i - frontOf(props) + n) % n < used(props)
	return i < used(props)
}

/** The cells in use, in order: from the front of a circular buffer, else from index 0. */
export function usedIndices(props: KindProps): number[] {
	const n = props.values?.length ?? 0
	const front = frontOf(props)
	return Array.from({ length: Math.min(n, used(props)) }, (_, k) => (front + k) % Math.max(1, n))
}
