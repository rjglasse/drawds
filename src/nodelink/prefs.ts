import { persistedAtom, persistedFlag } from '../data/persisted'

// The play bar's settings, kept per browser (`persistedAtom`): autoplay, the playing speed, predict mode.

/**
 * Operations open paused on their first step, so the teacher sets the pace: step with the arrows, or
 * press play. Autoplay plays them straight away instead.
 */
export const autoplay = persistedFlag('autoplay', 'drawds:autoplay')

/** Playing speeds: long operations (bubble sort) at 2x or 4x, or slower to talk over each step. */
export const SPEEDS = [0.5, 1, 2, 4] as const

export const speed = persistedAtom(
	'playback speed',
	'drawds:speed',
	(stored) => (SPEEDS as readonly number[]).find((s) => s === Number(stored)) ?? 1,
	(s) => String(s)
)

/**
 * Predict mode: before each step the bar asks the class what it will do, and only the next press shows
 * it. Playing (Space, autoplay) goes straight through.
 */
export const predict = persistedFlag('predict', 'drawds:predict')
