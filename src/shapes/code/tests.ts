import { compareKeys } from '../../data/compare'
import type { CodeLanguage } from './highlight'

// A loop's or an if's test, as it is tested: when a step is on a while, for or if line, the code box
// boxes the condition (green if it holds, red if not) and writes it out again after the line with the
// values filled in (2 > 0 && 7 > 3), so the class sees the test asked and which way it went. A part
// that && or || never gets to is faded in the code (… after it): short-circuit evaluation, which is why
// insertion sort's while test can stop at j > 0 without comparing values. Worked out from the step's
// own values (its pointers, its variables, the array as it is then), so an operation says nothing
// extra; a test it can't work out (a method call, an unknown name) shows nothing rather than guess.

export interface TestPart {
	/** The part as written (at `from` .. `to` in its line), and with values for its names. */
	code: string
	from: number
	to: number
	shown?: string
	/** Its value; undefined if never evaluated (short-circuited) or unknown. */
	value?: boolean
}

export interface ShownTest {
	/** Where the condition lies in its line (characters). */
	from: number
	to: number
	kind: 'loop' | 'if'
	parts: TestPart[]
	/** The operators between the parts (&&, ||, and, or). */
	ops: string[]
	result: boolean
}

/** What the test can use: the step's variables (pointers at indexes, named values) and arrays by name. */
export interface TestValues {
	vars: Readonly<Record<string, string>>
	arrays: Readonly<Record<string, readonly string[]>>
}

interface Found {
	from: number
	to: number
	kind: 'loop' | 'if'
	/** Python's for name in range(...): the name and what it ranges over. */
	forIn?: { name: string; iter: string }
}

/** The index just past the bracket that closes the one at `open`, or -1. */
function closing(line: string, open: number): number {
	let depth = 0
	for (let k = open; k < line.length; k++) {
		if (line[k] === '(' || line[k] === '[') depth++
		else if (line[k] === ')' || line[k] === ']') {
			depth--
			if (depth === 0) return k
		}
	}
	return -1
}

/** Where a line's condition is, if it is a while, for or if line. */
export function conditionOf(line: string, language: CodeLanguage): Found | undefined {
	const trim = (from: number, to: number) => {
		while (from < to && line[from] === ' ') from++
		while (to > from && line[to - 1] === ' ') to--
		return [from, to] as const
	}
	if (language === 'python') {
		const forIn = /^(\s*for\s+)(\w+)(\s+in\s+)(.+?):\s*(#.*)?$/.exec(line)
		if (forIn) {
			const from = forIn[1].length
			const to = from + forIn[2].length + forIn[3].length + forIn[4].length
			return { from, to, kind: 'loop', forIn: { name: forIn[2], iter: forIn[4].trim() } }
		}
		const m = /^(\s*(while|if|elif)\s+)(.+?):\s*(#.*)?$/.exec(line)
		if (!m) return undefined
		const [from, to] = trim(m[1].length, m[1].length + m[3].length)
		return { from, to, kind: m[2] === 'while' ? 'loop' : 'if' }
	}
	const m = /^(\s*(?:\}\s*)?(?:else\s+)?)(while|if|for)\s*\(/.exec(line)
	if (!m) return undefined
	const open = line.indexOf('(', m[1].length)
	const close = closing(line, open)
	if (close < 0) return undefined
	if (m[2] !== 'for') {
		const [from, to] = trim(open + 1, close)
		return { from, to, kind: m[2] === 'while' ? 'loop' : 'if' }
	}
	// for (init; condition; step): the middle one.
	const first = line.indexOf(';', open)
	const second = first < 0 ? -1 : line.indexOf(';', first + 1)
	if (second < 0 || second > close) return undefined
	const [from, to] = trim(first + 1, second)
	return from < to ? { from, to, kind: 'loop' } : undefined
}

// A tiny evaluator for the conditions algorithms test: numbers and names, a[i], a.length, len(a),
// arithmetic, comparisons, not / !, null / None, true / false.

type Value = number | string | boolean | null

interface Parsed {
	value: Value | undefined
	shown: string
}

const TOKEN = /\s*(\d+(?:\.\d+)?|[A-Za-z_]\w*|==|!=|<=|>=|&&|\|\||[-+*/%<>!()[\].,])/y

function tokens(text: string): string[] | undefined {
	const out: string[] = []
	TOKEN.lastIndex = 0
	let at = 0
	while (at < text.length) {
		if (!text.slice(at).trim()) break
		TOKEN.lastIndex = at
		const m = TOKEN.exec(text)
		if (!m) return undefined
		out.push(m[1])
		at = TOKEN.lastIndex
	}
	return out
}

const KEYWORDS: Record<string, Value> = { null: null, None: null, true: true, false: false, True: true, False: false }

function evaluateExpr(text: string, values: TestValues, language: CodeLanguage): Parsed {
	const ts = tokens(text)
	if (!ts) return { value: undefined, shown: text }
	let k = 0
	const peek = () => ts[k]
	const take = () => ts[k++]
	const fail: Parsed = { value: undefined, shown: text }
	const literal = (v: Value | undefined): string => (v === undefined ? '?' : v === null ? (language === 'python' ? 'None' : 'null') : typeof v === 'boolean' ? (language === 'python' ? (v ? 'True' : 'False') : String(v)) : String(v))
	// A variable that holds null (a list walk's curr off the end) is null, whichever way it is spelled.
	const asValue = (raw: string | undefined): Value | undefined =>
		raw === undefined || raw === '' ? undefined : raw === 'null' || raw === 'None' ? null : Number.isFinite(Number(raw)) ? Number(raw) : raw
	const length = (name: string) => values.arrays[name]?.length

	const atom = (): Parsed | undefined => {
		const t = take()
		if (t === undefined) return undefined
		if (t === '(') {
			const inner = comparison()
			if (!inner || take() !== ')') return undefined
			return { value: inner.value, shown: `(${inner.shown})` }
		}
		if (/^\d/.test(t)) return { value: Number(t), shown: t }
		if (!/^[A-Za-z_]/.test(t)) return undefined
		if (t in KEYWORDS) return { value: KEYWORDS[t], shown: literal(KEYWORDS[t]) }
		// len(a)
		if (t === 'len' && peek() === '(') {
			take()
			const name = take()
			if (take() !== ')' || !name) return undefined
			const n = length(name)
			return n === undefined ? undefined : { value: n, shown: String(n) }
		}
		// a.length
		if (peek() === '.') {
			take()
			if (take() !== 'length') return undefined
			const n = length(t)
			return n === undefined ? undefined : { value: n, shown: String(n) }
		}
		// a[i]
		if (peek() === '[') {
			take()
			const index = sum()
			if (!index || take() !== ']' || typeof index.value !== 'number') return undefined
			const v = asValue(values.arrays[t]?.[index.value])
			return v === undefined ? undefined : { value: v, shown: literal(v) }
		}
		// C's n: the array's length.
		const v = t in values.vars ? asValue(values.vars[t]) : t === 'n' && values.arrays.a ? values.arrays.a.length : undefined
		return v === undefined ? undefined : { value: v, shown: literal(v) }
	}
	const unary = (): Parsed | undefined => {
		if (peek() === '-') {
			take()
			const a = unary()
			return a && typeof a.value === 'number' ? { value: -a.value, shown: `-${a.shown}` } : undefined
		}
		if (peek() === '!' || peek() === 'not') {
			const op = take()
			const a = unary()
			return a && typeof a.value === 'boolean' ? { value: !a.value, shown: `${op === 'not' ? 'not ' : '!'}${a.shown}` } : undefined
		}
		return atom()
	}
	const term = (): Parsed | undefined => {
		let a = unary()
		while (a && (peek() === '*' || peek() === '/' || peek() === '%')) {
			const op = take()
			const b = unary()
			if (!b || typeof a.value !== 'number' || typeof b.value !== 'number') return undefined
			const value = op === '*' ? a.value * b.value : op === '/' ? Math.trunc(a.value / b.value) : a.value % b.value
			a = { value, shown: `${a.shown} ${op} ${b.shown}` }
		}
		return a
	}
	const sum = (): Parsed | undefined => {
		let a = term()
		while (a && (peek() === '+' || peek() === '-')) {
			const op = take()
			const b = term()
			if (!b || typeof a.value !== 'number' || typeof b.value !== 'number') return undefined
			a = { value: op === '+' ? a.value + b.value : a.value - b.value, shown: `${a.shown} ${op} ${b.shown}` }
		}
		return a
	}
	const comparison = (): Parsed | undefined => {
		const a = sum()
		let op = peek()
		// Python's is / is not: == / != on what they refer to.
		let written = op
		if (op === 'is') {
			take()
			const not = peek() === 'not'
			if (not) take()
			;[op, written] = not ? ['!=', 'is not'] : ['==', 'is']
		} else {
			if (!a || !['<', '>', '<=', '>=', '==', '!='].includes(op ?? '')) return a
			take()
		}
		if (!a) return undefined
		const b = sum()
		if (!b || a.value === undefined || b.value === undefined) return undefined
		const [x, y] = [a.value, b.value]
		let value: boolean
		if (op === '==' || op === '!=') value = (x === y) === (op === '==')
		else {
			if (x === null || y === null || typeof x === 'boolean' || typeof y === 'boolean') return undefined
			const c = compareKeys(String(x), String(y))
			value = op === '<' ? c < 0 : op === '>' ? c > 0 : op === '<=' ? c <= 0 : c >= 0
		}
		return { value, shown: `${a.shown} ${written} ${b.shown}` }
	}
	const result = comparison()
	return result && k === ts.length ? result : fail
}

/** A condition's parts, split at its top-level && / || (and / or); mixed ones stay whole. */
function split(cond: string, language: CodeLanguage): { parts: string[]; ops: string[] } {
	const [and, or] = language === 'python' ? [' and ', ' or '] : ['&&', '||']
	const top = (op: string) => {
		const at: number[] = []
		let depth = 0
		for (let k = 0; k < cond.length; k++) {
			const ch = cond[k]
			if (ch === '(' || ch === '[') depth++
			else if (ch === ')' || ch === ']') depth--
			else if (depth === 0 && cond.startsWith(op, k)) at.push(k)
		}
		return at
	}
	const [ands, ors] = [top(and), top(or)]
	if (ands.length && ors.length) return { parts: [cond], ops: [] }
	const [at, op] = ands.length ? [ands, and] : [ors, or]
	if (!at.length) return { parts: [cond], ops: [] }
	const parts: string[] = []
	let from = 0
	for (const k of at) {
		parts.push(cond.slice(from, k).trim())
		from = k + op.length
	}
	parts.push(cond.slice(from).trim())
	return { parts, ops: at.map(() => op.trim()) }
}

/** Python's range(...) as start, stop, step. */
function rangeOf(iter: string, values: TestValues, language: CodeLanguage): { args: number[]; shown: string } | undefined {
	const m = /^range\((.*)\)$/.exec(iter)
	if (!m) return undefined
	const args: Parsed[] = []
	let depth = 0
	let from = 0
	const inner = m[1]
	for (let k = 0; k <= inner.length; k++) {
		const ch = inner[k]
		if (ch === '(' || ch === '[') depth++
		else if (ch === ')' || ch === ']') depth--
		if (k === inner.length || (ch === ',' && depth === 0)) {
			args.push(evaluateExpr(inner.slice(from, k).trim(), values, language))
			from = k + 1
		}
	}
	if (!args.length || args.length > 3 || args.some((a) => typeof a.value !== 'number')) return undefined
	return { args: args.map((a) => a.value as number), shown: `range(${args.map((a) => a.shown).join(', ')})` }
}

/** The test on a line, as the step's values make it; undefined if it isn't a test line or can't be worked out. */
export function shownTest(line: string, language: CodeLanguage, values: TestValues): ShownTest | undefined {
	const found = conditionOf(line, language)
	if (!found) return undefined
	if (found.forIn) {
		// for i in range(...): is i (the step's i) one of the range's values?
		const i = Number(values.vars[found.forIn.name])
		const range = rangeOf(found.forIn.iter, values, language)
		if (!range || !Number.isFinite(i)) return undefined
		const [start, stop, step = 1] = range.args.length === 1 ? [0, range.args[0]] : range.args
		const value = step > 0 ? i >= start && i < stop && (i - start) % step === 0 : i <= start && i > stop && (start - i) % -step === 0
		return { from: found.from, to: found.to, kind: 'loop', parts: [{ code: line.slice(found.from, found.to), from: found.from, to: found.to, shown: `${i} in ${range.shown}`, value }], ops: [], result: value }
	}
	const cond = line.slice(found.from, found.to)
	const { parts: texts, ops } = split(cond, language)
	const parts: TestPart[] = []
	let result: boolean | undefined
	let at = found.from
	for (const [k, code] of texts.entries()) {
		const from = line.indexOf(code, at)
		const place = { code, from, to: from + code.length }
		at = place.to
		// Short-circuit: && stops at the first false part, || at the first true one.
		if (k > 0 && result !== undefined && (ops[k - 1] === '&&' || ops[k - 1] === 'and' ? !result : result)) {
			parts.push(place)
			continue
		}
		const e = evaluateExpr(code, values, language)
		if (typeof e.value !== 'boolean') return undefined
		parts.push({ ...place, shown: e.shown, value: e.value })
		result = e.value
	}
	return result === undefined ? undefined : { from: found.from, to: found.to, kind: found.kind, parts, ops, result }
}
