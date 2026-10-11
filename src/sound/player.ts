import { atom } from 'tldraw'

// The notes themselves, made with the Web Audio API (no sound files: offline as the rest of drawds):
// a soft triangle wave with a quiet sine an octave up, a fast attack and a short fade, through a
// limiter. On for this tab only (bogosort turns it on; a reload, or the speaker button, turns it off).
// Notes come at most so fast and so many at once, so a busy step stays a ripple, not a roar.

const soundAtom = atom('sound', false)

/** Whether drawds makes sounds. Reactive. */
export const isSoundOn = () => soundAtom.get()

let context: AudioContext | undefined
let master: GainNode | undefined
/** When the next note may start, and how many are sounding. */
let next = 0
let voices = 0

/** Notes this far apart at least, at most this many sounding, none queued further ahead than this (s). */
const SPACING = 0.035
const MAX_VOICES = 14
const MAX_AHEAD = 0.35
const LENGTH = 0.18

/** Turn sound on: from a click (browsers only let a page make sound once someone has clicked or typed). */
export function startSound() {
	const Context = typeof window === 'undefined' ? undefined : window.AudioContext
	if (!Context) return
	if (!context) {
		context = new Context()
		const limiter = context.createDynamicsCompressor()
		limiter.threshold.value = -12
		limiter.ratio.value = 8
		master = context.createGain()
		master.gain.value = 0.5
		master.connect(limiter)
		limiter.connect(context.destination)
	}
	void context.resume()
	soundAtom.set(true)
}

export function stopSound() {
	soundAtom.set(false)
}

/** One blip at `frequency`, at time `at` (the context's clock). */
function blip(ctx: AudioContext, frequency: number, at: number, loud: number) {
	const gain = ctx.createGain()
	gain.gain.setValueAtTime(0.0001, at)
	gain.gain.exponentialRampToValueAtTime(0.5 * loud, at + 0.006)
	gain.gain.exponentialRampToValueAtTime(0.0001, at + LENGTH)
	gain.connect(master!)
	const tones: [OscillatorType, number, number][] = [
		['triangle', frequency, 1],
		['sine', frequency * 2, 0.25],
	]
	voices++
	tones.forEach(([type, f, level], k) => {
		const osc = ctx.createOscillator()
		osc.type = type
		osc.frequency.value = f
		const tone = ctx.createGain()
		tone.gain.value = level
		osc.connect(tone)
		tone.connect(gain)
		osc.start(at)
		osc.stop(at + LENGTH + 0.02)
		if (k === 0) osc.onended = () => voices--
	})
}

/** Play `frequencies` one after another (a quick ripple), `gap` seconds apart at least. */
export function play(frequencies: readonly number[], { gap = SPACING, loud = 1 }: { gap?: number; loud?: number } = {}) {
	if (!soundAtom.get() || !context || !master) return
	const now = context.currentTime
	next = Math.max(next, now)
	for (const f of frequencies) {
		if (next > now + MAX_AHEAD || voices >= MAX_VOICES) return
		blip(context, f, next, loud)
		next += Math.max(gap, SPACING)
	}
}
