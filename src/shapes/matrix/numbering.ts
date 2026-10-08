// Labels that carry on numbering: a header labelled with a number (0x0, 1, Q1, 2024) makes the
// unlabelled ones after it continue it (0x1, 0x2...); two labelled in a row set the step (0x00, 0x04:
// 0x08, 0x0C...). The continued ones aren't stored, so a matrix that grows carries on counting.

/** A label's number with the text around it, and how it is written. */
interface Numbered {
	prefix: string
	n: number
	suffix: string
	hex: boolean
	/** Digits to pad to with zeros (0x00: 2); 1 when it isn't padded. */
	width: number
	/** Hex digits in capitals (unless the label wrote them small). */
	upper: boolean
}

/** The number in a label (hex after 0x, else its last run of digits), or undefined if it has none. */
export function parseNumbered(label: string): Numbered | undefined {
	const hex = /^(.*?0[xX])([0-9a-fA-F]+)(.*)$/.exec(label)
	const dec = hex ? undefined : /^(.*?)(\d+)(\D*)$/.exec(label)
	const m = hex ?? dec
	if (!m) return undefined
	const digits = m[2]
	return {
		prefix: m[1],
		n: parseInt(digits, hex ? 16 : 10),
		suffix: m[3],
		hex: !!hex,
		width: digits.length > 1 && digits.startsWith('0') ? digits.length : 1,
		upper: !/[a-f]/.test(digits),
	}
}

/** The label written the same way with number `n`, or undefined below zero. */
export function withNumber(at: Numbered, n: number): string | undefined {
	if (n < 0 || !Number.isSafeInteger(n)) return undefined
	const digits = n.toString(at.hex ? 16 : 10).padStart(at.width, '0')
	return at.prefix + (at.upper ? digits.toUpperCase() : digits) + at.suffix
}

const sameKind = (a: Numbered, b: Numbered) => a.prefix === b.prefix && a.suffix === b.suffix && a.hex === b.hex

/** What a header shows: a label (typed, or continuing the numbering above it) or its index. */
export interface HeaderText {
	text: string
	labelled: boolean
	/** A number the next one could follow on from (typed or continued). */
	numbered: boolean
}

/**
 * Each of `count` headers' text. A typed label shows as typed; an unlabelled header after a numbered
 * one continues the numbering, by 1, or by the difference of two numbered labels typed one after the
 * other (same prefix and base); anything else shows its index.
 */
export function headerTexts(labels: readonly string[] | undefined, count: number): HeaderText[] {
	const out: HeaderText[] = []
	let run: { at: Numbered; step: number } | undefined
	let typedAbove: Numbered | undefined
	for (let i = 0; i < count; i++) {
		const label = labels?.[i]
		if (label) {
			const at = parseNumbered(label)
			const step = at && typedAbove && sameKind(at, typedAbove) && at.n !== typedAbove.n ? at.n - typedAbove.n : 1
			run = at && { at, step }
			typedAbove = at
			out.push({ text: label, labelled: true, numbered: !!at })
			continue
		}
		typedAbove = undefined
		const n = run ? run.at.n + run.step : 0
		const text = run && withNumber(run.at, n)
		if (run && text !== undefined) {
			run = { at: { ...run.at, n }, step: run.step }
			out.push({ text, labelled: true, numbered: true })
		} else {
			run = undefined
			out.push({ text: String(i), labelled: false, numbered: false })
		}
	}
	return out
}
