import type { MarkColor } from '../../cells/marks'
import { compareKeys } from '../../data/compare'
import { randomInt, type Rng } from '../../data/random'
import { lit, ptr, recorder, type ArrayOperation, type ArrayState } from './operations'

// Sorting by luck. Bogosort shuffles until sorted; bozosort swaps two values picked at random (maybe
// the same one) until sorted. Each checks pairs left to right, giving up at the first out of order; on
// n values either takes on the order of n! tries, so after a batch of them drawds gives up too (Esc
// stops it sooner). Running either is how the sounds are found (`src/sound/`).

/** Shuffles or swaps drawds tries before it gives up. */
export const LUCK_TRIES = 100

const factorial = (n: number): number => (n <= 1 ? 1 : n * factorial(n - 1))

const LOOK: MarkColor = 'orange'
const GOOD: MarkColor = 'green'
const BAD: MarkColor = 'red'

/** Try until sorted: `attempt` changes the array (a step of its own), up to `tries` times. */
function byLuck(start: ArrayState, code: string, name: string, counted: string, tries: number, attempt: (r: ReturnType<typeof recorder>) => void): ArrayOperation {
	const n = start.values.length
	const r = recorder(start, { [counted]: 0, comparisons: 0 })
	/** Is it sorted? Pairs left to right, stopping at the first out of order. */
	const sorted = () => {
		for (let i = 0; i + 1 < n; i++) {
			const [x, y] = [r.state.values[i], r.state.values[i + 1]]
			r.counts.comparisons++
			const ok = compareKeys(x, y) <= 0
			r.step(ok ? `a[${i}] = ${x} ≤ a[${i + 1}] = ${y}: so far so good` : `a[${i}] = ${x} > a[${i + 1}] = ${y}: not sorted`, {
				lit: { ...lit(0, i, GOOD), [i + 1]: ok ? GOOD : BAD, ...(ok ? {} : { [i]: BAD }) },
				pointers: [ptr('i', i)],
				ask: `a[${i}] = ${x} vs a[${i + 1}] = ${y}: in order?`,
				askFocus: [i, i + 1],
				line: 'compare',
			})
			if (!ok) return false
		}
		return true
	}
	r.step(`${name}: ${code === 'bogosort' ? 'shuffle' : 'swap two at random'} until sorted. Is a[0..${n - 1}] sorted?`, { ask: false, line: 'check' })
	while (!sorted()) {
		if (r.counts[counted] >= tries) {
			// Bogosort expects exactly n! shuffles (distinct values); bozosort's swaps grow about as fast.
			const expects = code === 'bogosort' ? 'expects n! =' : 'needs on the order of n! ='
			r.step(`Still not sorted after ${tries} ${counted}. ${name} ${expects} ${factorial(n).toLocaleString('en')} on ${n} values: drawds gives up`, {
				ask: false,
				line: 'check',
			})
			return { frames: r.frames, result: r.state, code }
		}
		attempt(r)
	}
	const tried = r.counts[counted]
	r.step(`Sorted, after ${tried} ${tried === 1 ? counted.slice(0, -1) : counted}: luck`, { lit: lit(0, n - 1, GOOD), ask: false, line: 'sorted' })
	return { frames: r.frames, result: r.state, code }
}

/** Bogosort: shuffle until sorted. */
export function bogosort(start: ArrayState, rng: Rng, tries = LUCK_TRIES): ArrayOperation {
	const n = start.values.length
	return byLuck(start, 'bogosort', 'Bogosort', 'shuffles', tries, (r) => {
		// Every value to a random place: a[k] moves to order.indexOf(k).
		const order = Array.from({ length: n }, (_, i) => i)
		for (let i = n - 1; i > 0; i--) {
			const j = randomInt(0, i, rng)
			;[order[i], order[j]] = [order[j], order[i]]
		}
		r.set({ ...r.state, values: order.map((k) => r.state.values[k]) })
		r.counts.shuffles++
		r.step(`shuffle(a): shuffle ${r.counts.shuffles}`, {
			lit: lit(0, n - 1, LOOK),
			moves: order.flatMap((k, i) => (k === i ? [] : [[String(k), String(i)] as [string, string]])),
			ask: false,
			line: 'shuffle',
		})
	})
}

/** Bozosort: swap two values picked at random (maybe the same one twice) until sorted. */
export function bozosort(start: ArrayState, rng: Rng, tries = LUCK_TRIES): ArrayOperation {
	const n = start.values.length
	return byLuck(start, 'bozosort', 'Bozosort', 'swaps', tries, (r) => {
		const [x, y] = [randomInt(0, n - 1, rng), randomInt(0, n - 1, rng)]
		const values = [...r.state.values]
		;[values[x], values[y]] = [values[y], values[x]]
		r.set({ ...r.state, values })
		r.counts.swaps++
		r.step(x === y ? `swap a[${x}] with itself: swap ${r.counts.swaps}, nothing moves` : `swap a[${x}] and a[${y}]: swap ${r.counts.swaps}`, {
			lit: { [x]: LOOK, [y]: LOOK },
			pointers: [ptr('x', x), ptr('y', y)],
			...(x === y ? {} : { swaps: [[x, y]] as [number, number][] }),
			ask: false,
			line: 'swap',
		})
	})
}
