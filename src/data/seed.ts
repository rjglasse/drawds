import { persistedAtom } from './persisted'
import { newSeed } from './random'

// A pinned seed, a per-browser setting: while one is pinned, every new sketch (of any structure)
// gets it instead of a fresh random seed, so drawing the same length again gives the same values,
// e.g. the example worked out in the lecture notes. Unpinned (the default), each sketch is random.

const SEED_KEY = 'drawds:seed'

/** The largest seed: the generators (mulberry32) take 32-bit seeds. */
const MAX_SEED = 2 ** 32 - 1

/** A seed typed in (digits, spaces ignored), or undefined if it isn't one. */
export function parseSeed(text: string): number | undefined {
	const digits = text.replace(/\s/g, '')
	if (!/^\d+$/.test(digits)) return undefined
	const seed = Number(digits)
	return seed <= MAX_SEED ? seed : undefined
}

const pinned = persistedAtom<number | null>(
	'pinned seed',
	SEED_KEY,
	(stored) => parseSeed(stored ?? '') ?? null,
	(seed) => (seed === null ? null : String(seed))
)

/** The pinned seed, or null when sketches are random. Reactive. */
export const pinnedSeed = () => pinned.get()

/** Pin a seed for every new sketch, or unpin it (null). */
export const pinSeed = (seed: number | null) => pinned.set(seed)

/** The seed a new sketch gets: the pinned one, else a fresh one. */
export const seedForSketch = () => pinned.get() ?? newSeed()
