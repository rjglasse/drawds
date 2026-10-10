import { atom } from 'tldraw'
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

function readPinned() {
	try {
		return typeof window === 'undefined' ? null : (parseSeed(window.localStorage.getItem(SEED_KEY) ?? '') ?? null)
	} catch {
		return null
	}
}

const pinnedAtom = atom<number | null>('pinned seed', readPinned())

/** The pinned seed, or null when sketches are random. Reactive. */
export const pinnedSeed = () => pinnedAtom.get()

/** Pin a seed for every new sketch, or unpin it (null). */
export function pinSeed(seed: number | null) {
	pinnedAtom.set(seed)
	try {
		if (seed === null) window.localStorage.removeItem(SEED_KEY)
		else window.localStorage.setItem(SEED_KEY, String(seed))
	} catch {
		// Private windows can refuse storage: the pin still holds until the page reloads.
	}
}

/** The seed a new sketch gets: the pinned one, else a fresh one. */
export const seedForSketch = () => pinnedAtom.get() ?? newSeed()
