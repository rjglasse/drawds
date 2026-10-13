import { persistedAtom } from '../data/persisted'

// The play bar's caption size (its narration, predict mode's question, the running counts): set with
// the bar's A− / A+ and kept per browser, like the playing speed, so every later play bar has it. A
// class at the back of a lecture hall can read the larger ones off the projector.

/** The sizes, in screen px, the smallest the default. */
export const CAPTION_SIZES = [13, 16, 20, 24, 30, 36] as const

const size = persistedAtom(
	'caption size',
	'drawds:caption-size',
	(stored) => (CAPTION_SIZES as readonly number[]).find((s) => s === Number(stored)) ?? CAPTION_SIZES[0],
	(px) => String(px)
)

/** The caption size, px. Reactive. */
export const captionSize = () => size.get()

/** The size a step smaller (-1) or bigger (1) than `size`, staying within the sizes. Pure. */
export function nextCaptionSize(size: number, by: -1 | 1): number {
	const i = CAPTION_SIZES.findIndex((s) => s >= size)
	const at = i < 0 ? CAPTION_SIZES.length - 1 : i
	return CAPTION_SIZES[Math.min(CAPTION_SIZES.length - 1, Math.max(0, at + by))]
}

/** The caption a size smaller or bigger, remembered. */
export function stepCaptionSize(by: -1 | 1) {
	size.set(nextCaptionSize(size.get(), by))
}
