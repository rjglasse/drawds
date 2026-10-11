import { compareKeys } from '../data/compare'

// What drawds sounds like, once bogosort has been run (an easter egg, after the sorting videos that
// play a tone for every comparison and swap): each value a note, pitched by its rank among the
// structure's values on a major pentatonic scale (any notes sound well together), low to high.

/** The major pentatonic scale's steps within an octave (semitones). */
const PENTATONIC = [0, 2, 4, 7, 9]

/** Notes a structure's values spread over: C4 up to E6, two and a half octaves. */
export const DEGREES = 13

/** C4. */
const BASE = 261.63

/** The frequency of scale degree `d` (0 = C4), below 0 going on down. */
export function frequencyOf(d: number): number {
	const octave = Math.floor(d / PENTATONIC.length)
	const step = PENTATONIC[((d % PENTATONIC.length) + PENTATONIC.length) % PENTATONIC.length]
	return BASE * 2 ** ((octave * 12 + step) / 12)
}

/** Each value's note: its rank among the distinct values, spread over the scale (numbers by size, else alphabetically). */
export function pitches(values: readonly string[]): (value: string) => number {
	const distinct = [...new Set(values.filter((v) => v.trim() !== ''))].sort(compareKeys)
	const rank = new Map(distinct.map((v, i) => [v, i]))
	const spread = (r: number) => (distinct.length < 2 ? Math.floor(DEGREES / 2) : Math.round((r / (distinct.length - 1)) * (DEGREES - 1)))
	return (value) => {
		const r = rank.get(value)
		if (r !== undefined) return frequencyOf(spread(r))
		// A value not among them (a new one): between its neighbours.
		const below = distinct.filter((v) => compareKeys(v, value) < 0).length
		return frequencyOf(spread(Math.max(0, Math.min(distinct.length - 1, below - 0.5))))
	}
}

/** What a step touches, in order: what it lights, what it swaps, where values move to (each once). */
export function touchedKeys(frame: { flash?: Record<string, string | null>; swaps?: [string, string][]; moves?: [string, string][] }): string[] {
	const keys = [
		...Object.entries(frame.flash ?? {}).flatMap(([key, color]) => (color ? [key] : [])),
		...(frame.swaps ?? []).flat(),
		...(frame.moves ?? []).map(([, to]) => to),
	]
	return [...new Set(keys.filter((k) => !k.startsWith('edge:') && !k.startsWith('#') && !k.startsWith('aux:')))]
}

/** A sort's last word: up through its values in order. */
export function sweep(values: readonly string[]): number[] {
	const pitch = pitches(values)
	return [...values].filter((v) => v.trim() !== '').sort(compareKeys).map(pitch)
}

/** Giving up: three notes down from the middle. */
export const GIVE_UP = [frequencyOf(7), frequencyOf(5), frequencyOf(3)]

/** A value gone: below the scale. */
export const GONE = frequencyOf(-3)

/** A mark: a short high tick. */
export const TICK = frequencyOf(DEGREES + 2)
