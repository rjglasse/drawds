import { describe, expect, it } from 'vitest'
import type { Frame } from '../../nodelink/playback'
import type { ArrayOperation } from './operations'
import { apply, checkBrackets, evaluatePostfix, matches, postfixTokens } from './stack-uses'

const growing = { values: ['7', '8'], marks: {}, used: 2, fixed: false }
const fixed = (capacity: number) => ({ values: Array.from({ length: capacity }, (_, i) => String(i + 1)), marks: {}, used: capacity, fixed: true })

const last = (op: ArrayOperation) => op.frames[op.frames.length - 1]
const props = (f: Frame) => f.props as { values: string[]; used: number }
/** The stack at each step, bottom first. */
const stacks = (op: ArrayOperation) => op.frames.map((f) => props(f).values.slice(0, props(f).used).join(''))
const input = (f: Frame) => f.strips?.find((s) => s.title === 'input')
const top = (f: Frame) => f.pointers?.find((p) => p.name === 'top')?.at

describe('balanced brackets', () => {
	it('pushes each opener and pops it for its closer: balanced, the pairs green', () => {
		const op = checkBrackets(growing, '{[()()]}')
		expect(op.code).toBe('stack-balanced')
		expect(op.result).toBeUndefined()
		// A new, empty stack: not the one drawn.
		expect(stacks(op)[0]).toBe('')
		expect(top(op.frames[0])).toBe('-1')
		expect(stacks(op)).toEqual(['', '{', '{[', '{[(', '{[', '{[', '{[(', '{[', '{[', '{', '{', '', '', ''])
		expect(last(op).caption).toMatch(/Balanced$/)
		expect(last(op).line).toBe('end')
		expect(input(last(op))).toMatchObject({ items: [...'{[()()]}'], marks: Object.fromEntries([...'01234567'].map((i) => [i, 'green'])) })
		expect(last(op).counts).toEqual({ deepest: 3 })
		// Each closer: a pop, then whether the pair matches.
		expect(op.frames.slice(4, 6).map((f) => [f.line, f.caption])).toEqual([
			['pop', ') closes: pop the opener on top, (, the latest one still open'],
			['match', '( and ) match: a pair'],
		])
		expect(op.frames[4].strips?.[1]).toEqual({ title: 'popped', items: ['('] })
	})

	it('the character being read is orange; other characters are passed over', () => {
		const op = checkBrackets(growing, 'f(a[i])')
		expect(input(op.frames[1])).toMatchObject({ items: [...'f(a[i])'], marks: { 1: 'orange' } })
		expect(op.frames.filter((f) => f.line === 'push')).toHaveLength(2)
		expect(last(op).caption).toMatch(/Balanced$/)
	})

	it("a closer that isn't the latest opener's kind: unbalanced, the pair red", () => {
		const op = checkBrackets(growing, '([)]')
		expect(last(op).line).toBe('mismatch')
		expect(last(op).caption).toBe("[ and ) don't match: ) closes a bracket that isn't the latest one open. Unbalanced")
		expect(input(last(op))?.marks).toEqual({ 1: 'red', 2: 'red' })
	})

	it('a closer with the stack empty, or openers left at the end: unbalanced', () => {
		const extra = checkBrackets(growing, '())')
		expect(last(extra).line).toBe('empty')
		expect(input(last(extra))?.marks).toEqual({ 0: 'green', 1: 'green', 2: 'red' })
		const left = checkBrackets(growing, '(()')
		expect(last(left).caption).toBe('The end of the text, but 1 opener is still on the stack, never closed. Unbalanced')
		expect(input(last(left))?.marks).toEqual({ 0: 'red', 1: 'green', 2: 'green' })
		expect(last(left).flash).toEqual({ 0: 'red' })
	})

	it('a fixed stack overflows when the brackets nest deeper than its capacity (lecture 6: a hand of five fingers)', () => {
		const op = checkBrackets(fixed(5), '((((((')
		expect(op.code).toBe('stack-balanced-fixed')
		// Its slots blank, as a new ArrayStack's are.
		expect(props(op.frames[0]).values).toEqual(['', '', '', '', ''])
		expect(last(op).line).toBe('overflow')
		expect(last(op).caption).toMatch(/^\( opens: push it, but all 5 slots are full\. Stack overflow/)
		expect(last(op).vars).toMatchObject({ CAPACITY: '5' })
		expect(checkBrackets(fixed(5), '(((((())))))').frames.at(-1)?.line).toBe('overflow')
		expect(checkBrackets(fixed(5), '((((()))))(())').frames.at(-1)?.caption).toMatch(/Balanced$/)
	})

	it('a fixed stack keeps a popped opener in its slot, faded, until a push overwrites it', () => {
		const op = checkBrackets(fixed(3), '()[')
		expect(props(op.frames[2])).toMatchObject({ values: ['(', '2', '3'].map((v, i) => (i ? '' : v)), used: 0 })
		expect(props(last(op))).toMatchObject({ values: ['[', '', ''], used: 1 })
	})

	it('predict mode asks the same question whichever way the step goes', () => {
		const ok = checkBrackets(growing, '()')
		const bad = checkBrackets(growing, ')')
		expect(ok.frames[2].ask).toBe('Next: ). What does the stack do?')
		expect(bad.frames[1].ask).toBe('Next: ). What does the stack do?')
		expect(ok.frames[0].ask).toBe(false)
	})

	it('matches only a pair of the same kind', () => {
		expect([matches('(', ')'), matches('[', ']'), matches('{', '}')]).toEqual([true, true, true])
		expect([matches('(', ']'), matches(')', '('), matches('a', 'a')]).toEqual([false, false, false])
	})
})

describe('postfix evaluation', () => {
	it('pushes numbers; an operator pops b, then a, and pushes a op b', () => {
		const op = evaluatePostfix(growing, '5 1 2 + 4 * + 3 -')
		expect(op.code).toBe('stack-postfix')
		expect(op.result).toBeUndefined()
		expect(op.frames.map((f) => f.line)).toEqual([
			'new',
			'push',
			'push',
			'push',
			'pop-b',
			'pop-a',
			'apply',
			'push',
			'pop-b',
			'pop-a',
			'apply',
			'pop-b',
			'pop-a',
			'apply',
			'push',
			'pop-b',
			'pop-a',
			'apply',
			'result',
		])
		expect(op.frames[4].caption).toBe('+: an operator. b = pop() = 2: the right operand comes off first, as it went on last')
		expect(op.frames[5].strips?.[1]).toEqual({ title: 'operands', items: ['1', '2'], labels: ['a', 'b'] })
		expect(op.frames[6].caption).toBe('push(a + b) = push(1 + 2) = 3')
		expect(last(op).caption).toBe('The end: one number on the stack, the value, 14: 5 + (1 + 2) * 4 - 3 as it is usually written')
		expect(stacks(op).at(-1)).toBe('14')
		expect(last(op).counts).toEqual({ deepest: 3 })
	})

	it('the order matters: b comes off first', () => {
		expect(last(evaluatePostfix(growing, '9 4 -')).caption).toMatch(/the value, 5: 9 - 4 as/)
		expect(last(evaluatePostfix(growing, '7 2 /')).caption).toMatch(/the value, 3: 7 \/ 2 as/)
		expect(evaluatePostfix(growing, '7 2 /').frames.at(-2)?.caption).toBe('push(a / b) = push(7 / 2) = 3, integer division rounding toward 0')
	})

	it('division rounds toward 0, as Java and C divide', () => {
		expect([apply('/', 7, 2), apply('/', -7, 2), apply('-', 2, 9), apply('*', 3, 4)]).toEqual([3, -3, -7, 12])
	})

	it('writes the expression with only the brackets it needs', () => {
		const usual = (text: string) => (last(evaluatePostfix(growing, text)).caption ?? '').match(/value, -?\d+: (.*) as it is usually written/)?.[1]
		expect(usual('3 4 + 2 *')).toBe('(3 + 4) * 2')
		expect(usual('3 4 2 * +')).toBe('3 + 4 * 2')
		expect(usual('9 4 2 - -')).toBe('9 - (4 - 2)')
		expect(usual('9 4 - 2 -')).toBe('9 - 4 - 2')
		expect(usual('1 2 3 + +')).toBe('1 + 2 + 3')
		expect(usual('8 2 2 * /')).toBe('8 / (2 * 2)')
		expect(usual('2 9 4 / *')).toBe('2 * (9 / 4)')
		expect(last(evaluatePostfix(growing, '42')).caption).toBe('The end: one number on the stack, the value, 42')
	})

	it('too few operands, too many, a division by zero: no value', () => {
		const few = evaluatePostfix(growing, '1 +')
		expect(last(few).line).toBe('few')
		expect(last(few).caption).toBe('+: an operator needs two numbers, but the stack has only one: too few operands (a number missing before it)')
		const many = evaluatePostfix(growing, '1 2 3 +')
		expect(last(many).line).toBe('many')
		expect(last(many).caption).toBe('The end, but 2 numbers are left on the stack: too many operands (an operator missing)')
		const zero = evaluatePostfix(growing, '4 0 /')
		expect(last(zero).caption).toBe('a / b = 4 / 0: division by zero, there is no value')
		expect(input(last(zero))?.marks).toEqual({ 0: 'green', 1: 'green', 2: 'red' })
	})

	it('a token that is neither a number nor an operator: nothing to evaluate', () => {
		const op = evaluatePostfix(growing, '3 x +')
		expect(op.frames).toHaveLength(1)
		expect(op.frames[0].caption).toBe('x is neither a number nor an operator (+ - * /): there is nothing to evaluate')
		expect(op.code).toBeUndefined()
	})

	it('a fixed stack overflows with more numbers waiting than its capacity', () => {
		const op = evaluatePostfix(fixed(2), '1 2 3 + +')
		expect(op.code).toBe('stack-postfix-fixed')
		expect(last(op).line).toBe('overflow')
		expect(last(evaluatePostfix(fixed(2), '1 2 + 3 +')).line).toBe('result')
	})

	it('reads tokens with or without spaces', () => {
		expect(postfixTokens('34+2*')).toEqual(['34', '+', '2', '*'])
		expect(postfixTokens(' 3  4 + ')).toEqual(['3', '4', '+'])
		expect(postfixTokens('3 abc +')).toEqual(['3', 'abc', '+'])
	})
})
