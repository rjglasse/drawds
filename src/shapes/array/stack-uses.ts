import type { MarkColor } from '../../cells/marks'
import type { Strip } from '../../nodelink/playback'
import type { Pointer } from '../../pointers/pointers'
import { recorder, withoutCell, type ArrayOperation, type ArrayState } from './operations'
import type { StackState } from './stack-queue'

// What a stack is for, step by step: are a text's brackets balanced (an opener pushed, a closer
// popping the opener it has to match), and a postfix expression's value (a number pushed, an
// operator popping its two operands and pushing what they make). Each runs on a new, empty stack
// with the drawn one's room: a fixed stack overflows when the brackets nest deeper than its
// capacity, as a hand runs out of fingers. The input is a strip under the stack, the token being
// read orange. Nothing changes: afterwards the stack is as it was drawn.

const LOOK: MarkColor = 'orange'
const DONE: MarkColor = 'green'
const GONE: MarkColor = 'red'
const PEEK: MarkColor = 'blue'

export const OPENERS = '([{'
export const CLOSERS = ')]}'

const marker = (at: number): Pointer => ({ id: '@top', name: 'top', at: String(at) })

/** A new, empty stack as big as `start`: a fixed one's slots blank, a growing one without cells. */
function fresh({ values, fixed }: StackState): ArrayState & { used: number } {
	return { values: fixed ? values.map(() => '') : [], marks: {}, used: 0 }
}

function pushed(state: ArrayState, fixed: boolean, value: string): ArrayState {
	const used = state.used ?? 0
	const values = fixed ? [...state.values] : [...state.values, '']
	values[used] = value
	return { ...state, values, used: used + 1 }
}

/** The top value off: a fixed stack leaves it in its slot (off the stack, faded), a growing one loses the cell. */
function popped(state: ArrayState, fixed: boolean): ArrayState {
	const used = state.used ?? 0
	return { ...(fixed ? state : { ...state, ...withoutCell(state, used - 1) }), used: used - 1 }
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** Whether `opener` and `closer` are a pair: ( ), [ ] or { }. */
export const matches = (opener: string, closer: string) => OPENERS.indexOf(opener) >= 0 && OPENERS.indexOf(opener) === CLOSERS.indexOf(closer)

/**
 * Are `text`'s brackets balanced? Read a character at a time: an opener is pushed; a closer pops
 * the opener on top, which has to be its own kind. A closer with the stack empty, a pair that
 * doesn't match, or openers left at the end: unbalanced. Other characters are read and passed over.
 */
export function checkBrackets(start: StackState, text: string): ArrayOperation {
	const { fixed } = start
	const capacity = start.values.length
	const code = fixed ? 'stack-balanced-fixed' : 'stack-balanced'
	const chars = [...text].filter((c) => c.trim())
	const r = recorder(fresh(start), { deepest: 0 })
	const used = () => r.state.used ?? 0
	const top = () => [marker(used() - 1)]
	// The input's colours: pairs green as they close, what makes it unbalanced red.
	const marks: Record<number, MarkColor> = {}
	const input = (reading?: number): Strip => ({ title: 'input', items: chars, marks: reading === undefined ? { ...marks } : { ...marks, [reading]: LOOK } })
	// Where each opener on the stack was read, to colour its pair.
	const from: number[] = []
	if (fixed) r.let('CAPACITY', capacity)
	r.let('text', text)
	r.step(`s = a new, empty stack. Read the text a character at a time: an opener is pushed, a closer pops the opener on top, which must be its own kind`, {
		pointers: top(),
		strips: [input()],
		line: 'new',
		ask: false,
	})
	for (const [i, c] of chars.entries()) {
		if (!OPENERS.includes(c) && !CLOSERS.includes(c)) continue
		r.let('c', `'${c}'`)
		r.let('opener', undefined)
		const ask = `Next: ${c}. What does the stack do?`
		if (OPENERS.includes(c)) {
			if (fixed && used() >= capacity) {
				marks[i] = GONE
				r.step(
					`${c} opens: push it, but all ${capacity} slots are full. Stack overflow: the text may well balance, but its brackets nest deeper than this stack's capacity`,
					{ lit: { [used() - 1]: GONE }, pointers: top(), strips: [input()], line: 'overflow', ask }
				)
				return { frames: r.frames, code }
			}
			r.set(pushed(r.state, fixed, c))
			from.push(i)
			r.counts.deepest = Math.max(r.counts.deepest, used())
			r.step(`${c} opens: push it`, { lit: { [used() - 1]: DONE }, pointers: top(), strips: [input(i)], line: 'push', ask })
			continue
		}
		if (used() === 0) {
			marks[i] = GONE
			r.step(`${c} closes, but the stack is empty: there is no opener for it to close. Unbalanced`, { pointers: top(), strips: [input()], line: 'empty', ask })
			return { frames: r.frames, code }
		}
		const opener = r.state.values[used() - 1]
		const opened = from.pop()!
		r.set(popped(r.state, fixed))
		r.let('opener', `'${opener}'`)
		const strips = (reading?: number) => [input(reading), { title: 'popped', items: [opener] }]
		r.step(`${c} closes: pop the opener on top, ${opener}, the latest one still open`, { pointers: top(), strips: strips(i), line: 'pop', ask })
		const pair = matches(opener, c)
		marks[opened] = marks[i] = pair ? DONE : GONE
		if (!pair) {
			r.step(`${opener} and ${c} don't match: ${c} closes a bracket that isn't the latest one open. Unbalanced`, {
				pointers: top(),
				strips: strips(),
				line: 'mismatch',
				ask: `Do ${opener} and ${c} match?`,
			})
			return { frames: r.frames, code }
		}
		r.step(`${opener} and ${c} match: a pair`, { pointers: top(), strips: strips(), line: 'match', ask: `Do ${opener} and ${c} match?` })
	}
	r.let('c', undefined)
	r.let('opener', undefined)
	const ask = 'The end of the text: balanced or not?'
	if (used() === 0) {
		r.step(`The end of the text, and the stack is empty: every closer closed the latest opener still open. Balanced`, {
			pointers: top(),
			strips: [input()],
			line: 'end',
			ask,
		})
		return { frames: r.frames, code }
	}
	for (const i of from) marks[i] = GONE
	r.step(`The end of the text, but ${plural(used(), 'opener is', 'openers are')} still on the stack, never closed. Unbalanced`, {
		lit: Object.fromEntries(Array.from({ length: used() }, (_, k) => [k, GONE])),
		pointers: top(),
		strips: [input()],
		line: 'end',
		ask,
	})
	return { frames: r.frames, code }
}

/** A postfix expression's tokens: numbers, operators (+ - * /) and anything else, which isn't one. */
export const postfixTokens = (text: string) => text.match(/\d+|[-+*/]|[^\s\d+*/-]+/g) ?? []

const isNumber = (token: string) => /^\d+$/.test(token)

const PRECEDENCE: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2 }

/** Integer arithmetic as Java and C do it: division rounds toward 0. */
export function apply(op: string, a: number, b: number) {
	return op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b : Math.trunc(a / b)
}

/** An expression as it is usually written, with only the brackets it needs (`op` its last operator). */
interface Infix {
	text: string
	op?: string
}

function infix(a: Infix, op: string, b: Infix): Infix {
	const p = PRECEDENCE[op]
	const left = a.op && PRECEDENCE[a.op] < p ? `(${a.text})` : a.text
	// On the right, the same precedence needs brackets too (a - (b - c)), but where it can't matter (a + b + c).
	const same = b.op === op && (op === '+' || op === '*')
	const right = b.op && (PRECEDENCE[b.op] < p || (PRECEDENCE[b.op] === p && !same)) ? `(${b.text})` : b.text
	return { text: `${left} ${op} ${right}`, op }
}

/**
 * A postfix expression's value: read a token at a time; a number is pushed, an operator pops b
 * (the right operand, pushed last) then a, and pushes a op b. Too few numbers for an operator, a
 * division by zero, or more than one number left at the end: no value.
 */
export function evaluatePostfix(start: StackState, text: string): ArrayOperation {
	const { fixed } = start
	const capacity = start.values.length
	const code = fixed ? 'stack-postfix-fixed' : 'stack-postfix'
	const tokens = postfixTokens(text)
	const r = recorder(fresh(start), { deepest: 0 })
	const used = () => r.state.used ?? 0
	const top = () => [marker(used() - 1)]
	const peek = () => r.state.values[used() - 1]
	const marks: Record<number, MarkColor> = {}
	const input = (reading?: number): Strip => ({ title: 'input', items: tokens, marks: reading === undefined ? { ...marks } : { ...marks, [reading]: LOOK } })
	const operands = (a: string, b: string): Strip => ({ title: 'operands', items: [a, b], labels: ['a', 'b'] })
	const odd = tokens.findIndex((t) => !isNumber(t) && !(t in PRECEDENCE))
	if (odd >= 0) {
		marks[odd] = GONE
		r.step(`${tokens[odd]} is neither a number nor an operator (+ - * /): there is nothing to evaluate`, { strips: [input()], ask: false })
		return { frames: r.frames }
	}
	if (fixed) r.let('CAPACITY', capacity)
	r.let('postfix', tokens.join(' '))
	r.step(`s = a new, empty stack. Read the expression a token at a time: a number is pushed; an operator pops two numbers and pushes what they make`, {
		pointers: top(),
		strips: [input()],
		line: 'new',
		ask: false,
	})
	// What each number on the stack stands for, as usually written.
	const written: Infix[] = []
	const lit = (color: MarkColor) => Object.fromEntries(Array.from({ length: used() }, (_, k) => [k, color]))
	for (const [i, token] of tokens.entries()) {
		r.let('token', token)
		r.let('a', undefined)
		r.let('b', undefined)
		const ask = `Next: ${token}. What does the stack do?`
		if (isNumber(token)) {
			if (fixed && used() >= capacity) {
				marks[i] = GONE
				r.step(`${token}: a number: push it, but all ${capacity} slots are full. Stack overflow`, { lit: { [used() - 1]: GONE }, pointers: top(), strips: [input()], line: 'overflow', ask })
				return { frames: r.frames, code }
			}
			const value = String(Number(token))
			r.set(pushed(r.state, fixed, value))
			written.push({ text: value })
			r.counts.deepest = Math.max(r.counts.deepest, used())
			r.step(`${token}: a number: push it`, { lit: { [used() - 1]: DONE }, pointers: top(), strips: [input(i)], line: 'push', ask })
			marks[i] = DONE
			continue
		}
		const op = token
		if (used() < 2) {
			marks[i] = GONE
			r.step(`${op}: an operator needs two numbers, but the stack has ${used() ? 'only one' : 'none'}: too few operands (a number missing before it)`, {
				lit: lit(GONE),
				pointers: top(),
				strips: [input()],
				line: 'few',
				ask,
			})
			return { frames: r.frames, code }
		}
		const b = peek()
		r.set(popped(r.state, fixed))
		r.let('b', b)
		r.step(`${op}: an operator. b = pop() = ${b}: the right operand comes off first, as it went on last`, {
			pointers: top(),
			strips: [input(i), operands('', b)],
			line: 'pop-b',
			ask,
		})
		const a = peek()
		r.set(popped(r.state, fixed))
		r.let('a', a)
		r.step(`a = pop() = ${a}, the left operand`, { pointers: top(), strips: [input(i), operands(a, b)], line: 'pop-a', ask: false })
		const sum = `${a} ${op} ${b}`
		if (op === '/' && Number(b) === 0) {
			marks[i] = GONE
			r.step(`a / b = ${sum}: division by zero, there is no value`, { pointers: top(), strips: [input(), operands(a, b)], line: 'apply', ask: `${sum}: what goes on the stack?` })
			return { frames: r.frames, code }
		}
		const value = apply(op, Number(a), Number(b))
		const rounded = op === '/' && Number(a) % Number(b) !== 0 ? ', integer division rounding toward 0' : ''
		r.set(pushed(r.state, fixed, String(value)))
		const right = written.pop()!
		written.push(infix(written.pop()!, op, right))
		r.step(`push(a ${op} b) = push(${sum}) = ${value}${rounded}`, {
			lit: { [used() - 1]: DONE },
			pointers: top(),
			strips: [input(i), operands(a, b)],
			line: 'apply',
			ask: `${sum}: what goes on the stack?`,
		})
		marks[i] = DONE
	}
	r.let('token', undefined)
	r.let('a', undefined)
	r.let('b', undefined)
	const ask = 'The end of the expression: what is its value?'
	if (used() === 1) {
		const value = peek()
		const usual = written[0].op ? `: ${written[0].text} as it is usually written` : ''
		r.step(`The end: one number on the stack, the value, ${value}${usual}`, { lit: { 0: PEEK }, pointers: top(), strips: [input()], line: 'result', ask })
		return { frames: r.frames, code }
	}
	r.step(
		used()
			? `The end, but ${used()} numbers are left on the stack: too many operands (an operator missing)`
			: 'The end, and the stack is empty: there was nothing to evaluate',
		{ lit: lit(GONE), pointers: top(), strips: [input()], line: 'many', ask }
	)
	return { frames: r.frames, code }
}
