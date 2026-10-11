import { atom } from 'tldraw'
import { DEFAULT_TUNING, bassNotes, type Tuning } from './notes'

// The notes themselves, made with the Web Audio API (no sound files: offline as the rest of drawds):
// a soft triangle wave with a quiet sine an octave up and one an octave down (depth), a fast attack
// and a short fade, through a limiter; under each group of notes a bass, the key's root and fifth by
// turns. On for this tab only (bogosort turns it on; a reload, or the speaker's menu, turns it off),
// as are the scale and key. Notes come at most so fast and so many at once, so a busy step stays a
// ripple, not a roar.

const soundAtom = atom('sound', false)
const tuningAtom = atom<Tuning>('sound tuning', DEFAULT_TUNING)

/** Whether drawds makes sounds. Reactive. */
export const isSoundOn = () => soundAtom.get()

/** The scale and key notes are in. Reactive. */
export const soundTuning = () => tuningAtom.get()

export const setSoundTuning = (tuning: Tuning) => tuningAtom.set(tuning)

let context: AudioContext | undefined
let master: GainNode | undefined
/** When the next note may start, how many are sounding, and whether the next bass is the fifth. */
let next = 0
let voices = 0
let fifth = false

/** Notes this far apart at least, at most this many sounding, none queued further ahead than this (s). */
const SPACING = 0.035
const MAX_VOICES = 14
const MAX_AHEAD = 0.35
const LENGTH = 0.18
const BASS_LENGTH = 0.42

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

/** A voice: its tones (wave, frequency, level) under one envelope, at `at`, `length` long. */
function voice(ctx: AudioContext, tones: [OscillatorType, number, number][], at: number, loud: number, length: number, attack = 0.006) {
	const gain = ctx.createGain()
	gain.gain.setValueAtTime(0.0001, at)
	gain.gain.exponentialRampToValueAtTime(0.5 * loud, at + attack)
	gain.gain.exponentialRampToValueAtTime(0.0001, at + length)
	gain.connect(master!)
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
		osc.stop(at + length + 0.02)
		if (k === 0) osc.onended = () => voices--
	})
}

/** One blip at `frequency`: the note, a quiet octave up for shine and down for body. */
const blip = (ctx: AudioContext, frequency: number, at: number, loud: number) =>
	voice(
		ctx,
		[
			['triangle', frequency, 1],
			['sine', frequency * 2, 0.25],
			['sine', frequency / 2, 0.3],
		],
		at,
		loud,
		LENGTH
	)

/** Play `frequencies` one after another (a quick ripple), `gap` seconds apart at least, a bass note under them. */
export function play(
	frequencies: readonly number[],
	{ gap = SPACING, loud = 1, bass = true, ahead = MAX_AHEAD }: { gap?: number; loud?: number; bass?: boolean; ahead?: number } = {}
) {
	if (!soundAtom.get() || !context || !master || !frequencies.length) return
	const now = context.currentTime
	next = Math.max(next, now)
	if (bass && next <= now + ahead && voices < MAX_VOICES) {
		const [root, five] = bassNotes(tuningAtom.get())
		voice(context, [['sine', fifth ? five : root, 1], ['triangle', (fifth ? five : root) * 2, 0.15]], next, 0.7 * loud, BASS_LENGTH, 0.012)
		fifth = !fifth
	}
	for (const f of frequencies) {
		// A run (a sort's last word, a scale) may queue further ahead than steps' notes.
		if (next > now + ahead || voices >= MAX_VOICES) return
		blip(context, f, next, loud)
		next += Math.max(gap, SPACING)
	}
}
