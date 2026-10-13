import type { Marks } from '../../cells/marks'

import { LOOK, DONE, GONE, type ArrayState, type ArrayOperation, ptr, recorder, copied, type Recorder, plural } from './record'

// Inserting, deleting and growing by shifting and copying, step by step (see operations.ts).

// Inserting and deleting, shifting the values after the index: one copy per value, where a linked
// list re-points two arrows.

/** Delete a[k]: each later value is copied one cell left, then the last cell is dropped. */
export function deleteAt(start: ArrayState, k: number): ArrayOperation {
	const n = start.values.length
	const r = recorder(start, { moves: 0 })
	const v = start.values[k]
	r.let('k', k)
	r.step(
		k === n - 1
			? `Delete a[${k}] = ${v}, the last value: nothing has to move`
			: `Delete a[${k}] = ${v}: every value after it moves one cell left`,
		{ lit: { [k]: GONE }, pointers: [ptr('i', k)], ask: `Delete a[${k}]: what has to happen to the values after it?`, askFocus: [k], line: 'start' }
	)
	for (let i = k; i < n - 1; i++) {
		r.set(copied(r.state, i + 1, i))
		r.counts.moves++
		r.step(`a[${i}] = a[${i + 1}] (${r.state.values[i]})`, { pointers: [ptr('i', i)], moves: [[i + 1, i]], ask: 'Which value moves next, and where to?', line: 'shift' })
	}
	// The last step shows the result, so the array stays as it is once the operation is done.
	const result = withoutCell(start, k)
	r.set(result)
	const moved = r.counts.moves
	r.step(`The array shrinks by one cell (it grows and shrinks, like a Python list). ${moved} value${moved === 1 ? '' : 's'} moved`, {
		ask: 'Every value after it has moved: what now?',
		line: 'shrink',
	})
	return { frames: r.frames, result, code: 'array-delete' }
}

/**
 * Insert `value` at index k: a cell is added at the end, the values from k on are copied one cell
 * right starting from the end (so nothing is overwritten), then a[k] = value.
 */
export function insertAt(start: ArrayState, k: number, value: string): ArrayOperation {
	const n = start.values.length
	const r = recorder({ values: [...start.values, ''], marks: start.marks }, { moves: 0 })
	r.let('k', k)
	r.let('value', value)
	r.step(
		k === n
			? `Insert ${value} at the end: the array grows by one cell, and nothing has to move`
			: `Insert ${value} at index ${k}. First the array grows by one cell, to make room`,
		{ lit: { [n]: LOOK }, ask: `Insert ${value} at index ${k}: where does the room come from?`, line: 'grow' }
	)
	for (let i = n; i > k; i--) {
		r.set(copied(r.state, i - 1, i))
		r.counts.moves++
		const why = i === n ? ': from the end, so nothing is overwritten' : ''
		r.step(`a[${i}] = a[${i - 1}] (${r.state.values[i]})${why}`, {
			pointers: [ptr('i', i)],
			moves: [[i - 1, i]],
			// The first is the lesson: copying from the front would overwrite what hasn't moved yet.
			ask: i === n ? 'There is room at the end: which value moves first?' : 'Which value moves next, and where to?',
			line: 'shift',
		})
	}
	const result = withCell(start, k, value)
	r.set(result)
	const moved = r.counts.moves
	r.step(`a[${k}] = ${value}. ${moved} value${moved === 1 ? '' : 's'} moved to make room`, {
		lit: { [k]: DONE },
		pointers: [ptr('i', k)],
		ask: `Every value from index ${k} on has moved: what now?`,
		line: 'place',
	})
	return { frames: r.frames, result, finalFlash: { [k]: DONE }, code: 'array-insert' }
}

/** The array without cell k: later values (and their marks) one index down. */
export function withoutCell({ values, marks }: ArrayState, k: number): ArrayState {
	const moved: Marks = {}
	for (const [key, color] of Object.entries(marks)) {
		const i = Number(key)
		if (i < k) moved[key] = color
		else if (i > k) moved[String(i - 1)] = color
	}
	return { values: values.filter((_, i) => i !== k), marks: moved }
}

/** The array with `value` at index k: values from k on (and their marks) one index up. */
export function withCell({ values, marks }: ArrayState, k: number, value: string): ArrayState {
	const moved: Marks = {}
	for (const [key, color] of Object.entries(marks)) moved[String(Number(key) < k ? Number(key) : Number(key) + 1)] = color
	return { values: [...values.slice(0, k), value, ...values.slice(k)], marks: moved }
}

/**
 * Fixed capacity: cell k's value goes, the used values after it move down one, and the last used
 * slot becomes a blank spare one (the capacity stays).
 */
export function withoutUsedCell(state: ArrayState, k: number): ArrayState {
	const { values, marks } = withoutCell(state, k)
	return { values: [...values, ''], marks }
}

/**
 * Fixed capacity, with room (used < capacity): `value` at index k, the used values from k on move
 * up one into the first spare slot.
 */
export function withUsedCell(state: ArrayState, used: number, k: number, value: string): ArrayState {
	const { values, marks } = withCell(state, k, value)
	// The spare slot that was at index `used` is now at used + 1, and is taken.
	values.splice(used + 1, 1)
	return { values, marks }
}

// Fixed capacity, as in C and Java: the array's cells are its capacity, the first `used` hold
// values, the rest are blank spare slots. Inserting needs a spare slot; when the array is full,
// a bigger one has to be made and everything copied into it.


/**
 * Insert `value` at index k of a fixed array. With a spare slot, the used values from the end back
 * to k move right one at a time, then a[k] = value and size goes up. Full, it stops and says so.
 */
export function insertFixed(start: ArrayState, used: number, k: number, value: string): ArrayOperation {
	const capacity = start.values.length
	const r = recorder({ ...start, used }, { moves: 0 })
	if (used >= capacity) {
		r.step(`size = capacity = ${capacity}: the array is full, so there is no room for ${value}. Grow it first (Capacity > Grow)`, {
			lit: { [capacity - 1]: GONE },
			line: 'full',
		})
		return { frames: r.frames, code: 'array-insert-fixed' }
	}
	r.let('k', k)
	r.let('value', value)
	r.step(`Insert ${value} at index ${k}: size ${used} < capacity ${capacity}, so a[${used}] is free`, { lit: { [used]: LOOK }, line: 'start' })
	for (let i = used; i > k; i--) {
		r.set(copied(r.state, i - 1, i))
		r.counts.moves++
		const why = i === used ? ': from the end, so nothing is overwritten' : ''
		r.step(`a[${i}] = a[${i - 1}] (${r.state.values[i]})${why}`, { pointers: [ptr('i', i)], moves: [[i - 1, i]], line: 'shift' })
	}
	const result = { ...withUsedCell(start, used, k, value), used: used + 1 }
	r.set(result)
	r.step(`a[${k}] = ${value}; size = ${used + 1}. ${plural(r.counts.moves, 'value')} moved`, { lit: { [k]: DONE }, pointers: [ptr('i', k)], line: 'place' })
	return { frames: r.frames, result, finalFlash: { [k]: DONE }, code: 'array-insert-fixed' }
}

/** Delete a[k] of a fixed array: the used values after it move left, then the last used slot is spare. */
export function deleteFixed(start: ArrayState, used: number, k: number): ArrayOperation {
	const r = recorder({ ...start, used }, { moves: 0 })
	r.let('k', k)
	r.step(`Delete a[${k}] = ${start.values[k]}: the values after it, up to a[size - 1], move one cell left`, {
		lit: { [k]: GONE },
		pointers: [ptr('i', k)],
		line: 'start',
	})
	for (let i = k; i < used - 1; i++) {
		r.set(copied(r.state, i + 1, i))
		r.counts.moves++
		r.step(`a[${i}] = a[${i + 1}] (${r.state.values[i]})`, { pointers: [ptr('i', i)], moves: [[i + 1, i]], line: 'shift' })
	}
	const result = { ...withoutUsedCell(start, k), used: used - 1 }
	r.set(result)
	r.step(`size = ${used - 1}: a[${used - 1}] is a spare slot again. ${plural(r.counts.moves, 'value')} moved`, { line: 'shrink' })
	return { frames: r.frames, result, code: 'array-delete-fixed' }
}

/**
 * Steps of growing a fixed array to `capacity` cells: newArr appears under it, the values in use
 * are copied down (one step each, or all in one), then a = newArr takes its place. A circular
 * buffer's values are copied in queue order, from its front, so the new array's front is index 0.
 */
function growSteps(r: Recorder, capacity: number, { oneByOne }: { oneByOne: boolean }) {
	const { values, used = values.length, front } = r.state
	const old = values.length
	const order = Array.from({ length: used }, (_, k) => ((front ?? 0) + k) % Math.max(1, old))
	const wraps = (front ?? 0) > 0
	const title = `newArr = new int[${capacity}]`
	const blank = Array<string>(capacity).fill('')
	const copied = (k: number) => [...order.slice(0, k).map((i) => values[i]), ...blank.slice(k)]
	r.set({ ...r.state, aux: { title, values: blank } })
	r.step(
		`${title}: a new array with room for ${capacity}. Arrays can't grow, so the values have to move` +
			(wraps ? ', in queue order from the front' : '')
	)
	if (oneByOne) {
		order.forEach((i, k) => {
			r.set({ ...r.state, aux: { title, values: copied(k + 1) } })
			r.counts.copies++
			const from = wraps ? `a[(front + ${k}) % ${old}] = a[${i}]` : `a[${i}]`
			r.step(`newArr[${k}] = ${from} (${values[i]})`, { pointers: [ptr('i', i)], lit: { [i]: LOOK }, moves: [[i, `aux:${k}`]] })
		})
	} else {
		r.set({ ...r.state, aux: { title, values: copied(used) } })
		r.counts.copies += used
		r.step(`Copy all ${plural(used, 'value')} into newArr`, { moves: order.map((i, k): [number, string] => [i, `aux:${k}`]) })
	}
	const marks: Marks = {}
	order.forEach((i, k) => {
		const mark = r.state.marks[String(i)]
		if (mark) marks[String(k)] = mark
	})
	r.set({ values: copied(used), marks, used, ...(front === undefined ? {} : { front: 0 }) })
	r.step(`a = newArr: capacity ${old} → ${capacity}${wraps ? ', front = 0' : ''}. The old array is garbage now`, {
		moves: order.map((_, k): [string, number] => [`aux:${k}`, k]),
	})
}

/** Grow a fixed array to twice its capacity, value by value. */
export function growFixed(start: ArrayState, used: number): ArrayOperation {
	const r = recorder({ ...start, used }, { copies: 0 })
	growSteps(r, Math.max(1, start.values.length * 2), { oneByOne: true })
	r.step(`Growing cost ${plural(r.counts.copies, 'copy', 'copies')}, one per value: doubling makes it rare`)
	return { frames: r.frames, result: { ...r.state, aux: undefined } }
}

/**
 * Append `value` to a fixed array, as ArrayList.add does: straight into a[size] when there is a
 * spare slot (nothing moves), else grow to twice the capacity first.
 */
export function appendFixed(start: ArrayState, used: number, value: string): ArrayOperation {
	const r = recorder({ ...start, used }, { copies: 0 })
	if (used >= start.values.length) {
		r.step(`Append ${value}: size = capacity = ${used}, the array is full. Grow it first, to twice the capacity`, {
			lit: { [used - 1]: GONE },
		})
		growSteps(r, Math.max(1, start.values.length * 2), { oneByOne: false })
	}
	const capacity = r.state.values.length
	r.step(`Append ${value}: size ${used} < capacity ${capacity}, so it goes straight into a[${used}]`, {
		lit: { [used]: LOOK },
		pointers: [ptr('size', used)],
	})
	const values = [...r.state.values]
	values[used] = value
	r.set({ values, marks: r.state.marks, used: used + 1 })
	r.step(`a[size] = ${value}; size = ${used + 1}. Nothing had to move`, { lit: { [used]: DONE }, pointers: [ptr('size', used + 1)] })
	return { frames: r.frames, result: r.state, finalFlash: { [used]: DONE } }
}

export type GrowthPolicy = 'double' | 'plus-one'

/**
 * Append `values` one after another to a fixed array, growing it whenever it is full: to twice the
 * capacity, or by one cell. Each grow copies every value (in one step); the counts show what that
 * costs: doubling stays under 2 copies per append (amortised O(1)), growing by one copies
 * everything every time (O(n) per append).
 */
export function appendMany(start: ArrayState, used: number, values: readonly string[], policy: GrowthPolicy): ArrayOperation {
	const r = recorder({ ...start, used }, { appends: 0, copies: 0 })
	const how = policy === 'double' ? 'doubling the capacity when full' : 'growing by one cell when full'
	// Lecture 7's aggregate method: each append's cost (1 for the write, plus any copies), in a row.
	const costs: string[] = []
	const strips = () => [{ title: 'cost of each append', items: [...costs] }]
	r.step(`Append ${plural(values.length, 'value')}, ${how}: size ${used}, capacity ${start.values.length}`, { strips: strips() })
	for (const value of values) {
		const size = r.state.used ?? used
		const capacity = r.state.values.length
		const before = r.counts.copies
		if (size >= capacity) {
			const next = policy === 'double' ? Math.max(1, capacity * 2) : capacity + 1
			r.step(`Append ${value}: full (size = capacity = ${capacity}), so grow to ${next} first`, { lit: { [capacity - 1]: GONE }, strips: strips() })
			growSteps(r, next, { oneByOne: false })
		}
		const after = [...r.state.values]
		after[size] = value
		r.set({ values: after, marks: r.state.marks, used: size + 1 })
		r.counts.appends++
		const copied = r.counts.copies - before
		costs.push(String(1 + copied))
		r.step(`Append ${value}: a[${size}] = ${value}; size = ${size + 1}. Cost ${1 + copied}${copied ? `: 1 for the write, ${copied} for the copies` : ''}`, {
			lit: { [size]: DONE },
			pointers: [ptr('size', size + 1)],
			strips: strips(),
		})
	}
	const { appends, copies } = r.counts
	const total = appends + copies
	const each = (total / Math.max(1, appends)).toFixed(1)
	const sum = `${appends} write${appends === 1 ? '' : 's'} + ${copies} cop${copies === 1 ? 'y' : 'ies'} = ${total}`
	r.step(
		policy === 'double'
			? `${plural(appends, 'append')} cost ${sum}, ${each} each: the copies (1 + 2 + 4 + …) add up to less than 2n, so n appends cost under 3n: amortised O(1)`
			: `${plural(appends, 'append')} cost ${sum}, ${each} each: growing by one copies everything every time, so each append costs O(n)`,
		{ strips: strips() }
	)
	return { frames: r.frames, result: r.state }
}

/**
 * Lecture 7's accounting method: every append pays 3 kr, 1 for its write and 2 saved on its cell (a
 * badge). When the array is full, doubling copies every value at 1 kr each, paid from what the
 * values added since the last doubling saved: exactly enough, so the bank (in the play bar) is
 * never in debt and each append costs at most 3: amortised O(1). Values already there are counted
 * as if added this way.
 */
export function appendAccounting(start: ArrayState, used: number, values: readonly string[]): ArrayOperation {
	const capacity0 = start.values.length
	// Saved so far, as if every value had been appended this way: 2 kr on each added since the last doubling.
	const since = Math.max(0, used - Math.floor(capacity0 / 2))
	const saved: Record<string, string> = Object.fromEntries(Array.from({ length: since }, (_, k) => [String(used - since + k), '2 kr']))
	const r = recorder({ ...start, used }, { appends: 0, copies: 0, 'bank (kr)': 2 * since })
	r.step(`Each append pays 3 kr: 1 for its write, 2 saved on its cell for later copies. Saved so far: ${2 * since} kr`, { badges: { ...saved } })
	for (const value of values) {
		const size = r.state.used ?? used
		const capacity = r.state.values.length
		if (size >= capacity) {
			const next = Math.max(1, capacity * 2)
			const bank = r.counts['bank (kr)']
			r.step(`Append ${value}: full, so double to ${next}: ${plural(size, 'copy', 'copies')} at 1 kr each, ${size} kr, and the bank holds ${bank} kr`, {
				lit: { [capacity - 1]: GONE },
			})
			growSteps(r, next, { oneByOne: false })
			// The copies are paid for: the credit on the cells is spent.
			r.counts['bank (kr)'] -= size
			const spent = Object.fromEntries(Object.keys(saved).map((k) => [k, '']))
			for (const k of Object.keys(saved)) delete saved[k]
			r.step(`The ${size} kr saved paid for the ${plural(size, 'copy', 'copies')}: bank ${bank} → ${r.counts['bank (kr)']} kr, never in debt`, {
				badges: spent,
			})
		}
		const after = [...r.state.values]
		after[size] = value
		r.set({ values: after, marks: r.state.marks, used: size + 1 })
		r.counts.appends++
		r.counts['bank (kr)'] += 2
		saved[String(size)] = '2 kr'
		r.step(`Append ${value}: pay 3 kr, 1 for a[${size}] = ${value}, 2 saved on its cell. Bank ${r.counts['bank (kr)']} kr`, {
			lit: { [size]: DONE },
			pointers: [ptr('size', size + 1)],
			badges: { [String(size)]: '2 kr' },
		})
	}
	const { appends, copies } = r.counts
	r.step(
		`${plural(appends, 'append')} paid ${3 * appends} kr for ${appends} writes and ${copies} copies, with ${r.counts['bank (kr)']} kr left: never in debt, so each append costs at most 3, amortised O(1)`,
		{ ask: false }
	)
	return { frames: r.frames, result: r.state }
}
