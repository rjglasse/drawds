import { compareKeys } from '../data/compare'

// What drawds sounds like, once bogosort has been run (an easter egg, after the sorting videos that
// play a tone for every comparison and swap): each value a note, pitched by its rank among the
// structure's values on a scale, in a key (the speaker's menu picks them; some music theory along
// with the algorithms), low to high over two and a half octaves; a bass under each group of notes,
// the key's root and fifth by turns.

export interface Scale {
	id: string
	name: string
	/** Semitones above the root, within an octave. */
	steps: number[]
	/** Its intervals as musicians write them. */
	intervals: string
	/** What it is, in a line. */
	about: string
}

export const SCALES: Scale[] = [
	{ id: 'major-pentatonic', name: 'Major pentatonic', steps: [0, 2, 4, 7, 9], intervals: '1 2 3 5 6', about: 'No semitones, so no two notes clash: folk tunes' },
	{ id: 'minor-pentatonic', name: 'Minor pentatonic', steps: [0, 3, 5, 7, 10], intervals: '1 ♭3 4 5 ♭7', about: "Rock's and the blues' lead guitar scale" },
	{ id: 'blues', name: 'Blues', steps: [0, 3, 5, 6, 7, 10], intervals: '1 ♭3 4 ♭5 5 ♭7', about: 'Minor pentatonic with the ♭5 added: the blue note' },
	{ id: 'dorian', name: 'Dorian', steps: [0, 2, 3, 5, 7, 9, 10], intervals: '1 2 ♭3 4 5 6 ♭7', about: 'A minor mode with a bright 6th: jazz, Scarborough Fair' },
	{ id: 'hirajoshi', name: 'Hirajoshi', steps: [0, 2, 3, 7, 8], intervals: '1 2 ♭3 5 ♭6', about: "A Japanese pentatonic, from the koto's tuning" },
	{ id: 'whole-tone', name: 'Whole tone', steps: [0, 2, 4, 6, 8, 10], intervals: '1 2 3 ♯4 ♯5 ♭7', about: 'Every step a whole tone: no home note, dreamy (Debussy)' },
]

export const KEYS = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B']

export interface Tuning {
	scale: string
	/** The root, in semitones above C (0 to 11). */
	key: number
}

export const DEFAULT_TUNING: Tuning = { scale: 'major-pentatonic', key: 0 }

const scaleOf = (tuning: Tuning) => SCALES.find((s) => s.id === tuning.scale) ?? SCALES[0]

/** Notes a structure's values spread over: two and a half octaves of the scale. */
export const degreesOf = (tuning: Tuning) => Math.round(scaleOf(tuning).steps.length * 2.5) + 1

/** C4. */
const C4 = 261.63

/** The root's frequency: the key from C4, the keys past F♯ an octave down, so every key sits in about the same range. */
const rootOf = (tuning: Tuning) => C4 * 2 ** ((tuning.key <= 6 ? tuning.key : tuning.key - 12) / 12)

/** The frequency of scale degree `d` (0 = the root), below 0 going on down. */
export function frequencyOf(d: number, tuning: Tuning = DEFAULT_TUNING): number {
	const { steps } = scaleOf(tuning)
	const octave = Math.floor(d / steps.length)
	const step = steps[((d % steps.length) + steps.length) % steps.length]
	return rootOf(tuning) * 2 ** ((octave * 12 + step) / 12)
}

/** Each value's note: its rank among the distinct values, spread over the scale (numbers by size, else alphabetically). */
export function pitches(values: readonly string[], tuning: Tuning = DEFAULT_TUNING): (value: string) => number {
	const degrees = degreesOf(tuning)
	const distinct = [...new Set(values.filter((v) => v.trim() !== ''))].sort(compareKeys)
	const rank = new Map(distinct.map((v, i) => [v, i]))
	const spread = (r: number) => (distinct.length < 2 ? Math.floor(degrees / 2) : Math.round((r / (distinct.length - 1)) * (degrees - 1)))
	return (value) => {
		const r = rank.get(value)
		if (r !== undefined) return frequencyOf(spread(r), tuning)
		// A value not among them (a new one): between its neighbours.
		const below = distinct.filter((v) => compareKeys(v, value) < 0).length
		return frequencyOf(spread(Math.max(0, Math.min(distinct.length - 1, below - 0.5))), tuning)
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
export function sweep(values: readonly string[], tuning: Tuning = DEFAULT_TUNING): number[] {
	const pitch = pitches(values, tuning)
	return [...values].filter((v) => v.trim() !== '').sort(compareKeys).map(pitch)
}

/** Giving up: three notes down from the middle. */
export function giveUp(tuning: Tuning = DEFAULT_TUNING): number[] {
	const mid = Math.floor(degreesOf(tuning) / 2)
	return [mid + 1, mid - 1, mid - 3].map((d) => frequencyOf(d, tuning))
}

/** A value gone: below the scale. */
export const gone = (tuning: Tuning = DEFAULT_TUNING) => frequencyOf(-3, tuning)

/** A mark: a short high tick. */
export const tick = (tuning: Tuning = DEFAULT_TUNING) => frequencyOf(degreesOf(tuning) + 2, tuning)

/**
 * The bass: the root two octaves down, and the fifth (the scale's note nearest seven semitones up:
 * the whole tone scale has none, so its ♯5), by turns.
 */
export function bassNotes(tuning: Tuning = DEFAULT_TUNING): [number, number] {
	const { steps } = scaleOf(tuning)
	const fifth = steps.reduce((best, s) => (Math.abs(s - 7) <= Math.abs(best - 7) ? s : best), steps[0])
	const root = rootOf(tuning) / 4
	return [root, root * 2 ** (fifth / 12)]
}

/** The scale itself, up an octave and back: what a scale picked sounds like. */
export function scaleRun(tuning: Tuning): number[] {
	const n = scaleOf(tuning).steps.length
	const up = Array.from({ length: n + 1 }, (_, d) => frequencyOf(d, tuning))
	return [...up, ...up.slice(0, -1).reverse()]
}
