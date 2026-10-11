import type { MarkColor } from '../../cells/marks'
import { compareKeys } from '../../data/compare'
import { randomInt, type Rng } from '../../data/random'
import { lit, ptr, recorder, type ArrayOperation, type ArrayState } from './operations'

// Bogosort: shuffle until sorted. Checked left to right, each shuffle is given up at the first pair out
// of order; on n values it takes n! shuffles on average, so after a batch of them drawds gives up too
// (Esc stops it sooner). Running it is how the sounds are found (`src/sound/`).

/** Shuffles drawds tries before it gives up. */
export const BOGO_SHUFFLES = 100

const factorial = (n: number): number => (n <= 1 ? 1 : n * factorial(n - 1))

const LOOK: MarkColor = 'orange'
const GOOD: MarkColor = 'green'
const BAD: MarkColor = 'red'

export function bogosort(start: ArrayState, rng: Rng, shuffles = BOGO_SHUFFLES): ArrayOperation {
	const n = start.values.length
	const r = recorder(start, { shuffles: 0, comparisons: 0 })
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
	r.step(`Bogosort: shuffle until sorted. Is a[0..${n - 1}] sorted?`, { ask: false, line: 'check' })
	while (!sorted()) {
		if (r.counts.shuffles >= shuffles) {
			r.step(`Still not sorted after ${shuffles} shuffles. Bogosort expects n! = ${factorial(n).toLocaleString('en')} on ${n} values: drawds gives up`, {
				ask: false,
				line: 'check',
			})
			return { frames: r.frames, result: r.state, code: 'bogosort' }
		}
		// Every value to a random place: a[k] moves to order.indexOf(k).
		const order = Array.from({ length: n }, (_, i) => i)
		for (let i = n - 1; i > 0; i--) {
			const j = randomInt(0, i, rng)
			;[order[i], order[j]] = [order[j], order[i]]
		}
		const values = order.map((k) => r.state.values[k])
		r.set({ ...r.state, values })
		r.counts.shuffles++
		r.step(`shuffle(a): shuffle ${r.counts.shuffles}`, {
			lit: lit(0, n - 1, LOOK),
			moves: order.flatMap((k, i) => (k === i ? [] : [[String(k), String(i)] as [string, string]])),
			ask: false,
			line: 'shuffle',
		})
	}
	r.step(`Sorted, after ${r.counts.shuffles} shuffle${r.counts.shuffles === 1 ? '' : 's'}: luck`, { lit: lit(0, n - 1, GOOD), ask: false, line: 'sorted' })
	return { frames: r.frames, result: r.state, code: 'bogosort' }
}
