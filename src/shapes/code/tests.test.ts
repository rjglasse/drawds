import { describe, expect, it } from 'vitest'
import { conditionOf, shownTest } from './tests'

const at = (line: string, language: Parameters<typeof conditionOf>[1]) => {
	const c = conditionOf(line, language)
	return c && line.slice(c.from, c.to)
}

describe('the test on a line', () => {
	it('finds the condition of a while, an if, a for, in each language', () => {
		expect(at('    while (j > 0 && a[j - 1] > key) {', 'java')).toBe('j > 0 && a[j - 1] > key')
		expect(at('    for (int i = 1; i < n; i++) {', 'c')).toBe('i < n')
		expect(at('        } else if (a[mid] < key) {', 'java')).toBe('a[mid] < key')
		expect(at('        if (a[j] < a[min])', 'c')).toBe('a[j] < a[min]')
		expect(at('    while j > 0 and a[j - 1] > key:', 'python')).toBe('j > 0 and a[j - 1] > key')
		expect(at('        elif a[mid] < key:  # go right', 'python')).toBe('a[mid] < key')
		expect(conditionOf('    for i in range(1, len(a)):', 'python')?.forIn).toEqual({ name: 'i', iter: 'range(1, len(a))' })
		expect(conditionOf('        swap(a, j, j - 1);', 'java')).toBeUndefined()
		expect(conditionOf('    for (;;) {', 'java')).toBeUndefined()
	})

	it('insertion sort’s while: the values filled in, each part’s value, short-circuited at j > 0', () => {
		const a = ['1', '7', '3', '9']
		const line = '        while (j > 0 && a[j - 1] > key) {'
		expect(shownTest(line, 'java', { vars: { j: '2', key: '3' }, arrays: { a } })).toMatchObject({
			kind: 'loop',
			result: true,
			ops: ['&&'],
			parts: [
				{ code: 'j > 0', shown: '2 > 0', value: true },
				{ code: 'a[j - 1] > key', shown: '7 > 3', value: true },
			],
		})
		// 1 ≤ 3: the test fails at its second part.
		expect(shownTest(line, 'java', { vars: { j: '1', key: '3' }, arrays: { a } })?.parts.map((p) => p.value)).toEqual([true, false])
		// j = 0: && never gets to the comparison.
		const front = shownTest(line, 'java', { vars: { j: '0', key: '3' }, arrays: { a } })!
		expect(front.result).toBe(false)
		expect(front.parts).toEqual([
			{ code: 'j > 0', from: 15, to: 20, shown: '0 > 0', value: false },
			{ code: 'a[j - 1] > key', from: 24, to: 38 },
		])
		expect(line.slice(front.parts[1].from, front.parts[1].to)).toBe('a[j - 1] > key')
		expect(shownTest('        while j > 0 and a[j - 1] > key:', 'python', { vars: { j: '0', key: '3' }, arrays: { a } })?.ops).toEqual(['and'])
	})

	it('the for loop’s test, and Python’s range', () => {
		const a = ['1', '3', '7', '9', '12']
		expect(shownTest('    for (int i = 1; i < a.length; i++) {', 'java', { vars: { i: '3' }, arrays: { a } })?.parts[0]).toMatchObject({ code: 'i < a.length', shown: '3 < 5', value: true })
		expect(shownTest('    for (int i = 1; i < n; i++) {', 'c', { vars: { i: '5' }, arrays: { a } })?.result).toBe(false)
		expect(shownTest('    for i in range(1, len(a)):', 'python', { vars: { i: '3' }, arrays: { a } })?.parts[0]).toMatchObject({ shown: '3 in range(1, 5)', value: true })
		expect(shownTest('    for i in range(1, len(a)):', 'python', { vars: { i: '5' }, arrays: { a } })?.result).toBe(false)
		expect(shownTest('    for i in range(len(a) - 1, 0, -1):', 'python', { vars: { i: '0' }, arrays: { a } })?.result).toBe(false)
	})

	it('nothing when it can’t be worked out: a name with no value, a method call', () => {
		expect(shownTest('    while (curr != null) {', 'java', { vars: {}, arrays: {} })).toBeUndefined()
		expect(shownTest('    if (a[j].compareTo(key) > 0) {', 'java', { vars: { j: '1' }, arrays: { a: ['1', '2'] } })).toBeUndefined()
		// Letters compare as text; null as the language spells it.
		expect(shownTest('    if (a[i] > key) {', 'java', { vars: { i: '0', key: 'C' }, arrays: { a: ['K'] } })?.parts[0].shown).toBe('K > C')
		expect(shownTest('    while lo <= hi:', 'python', { vars: { lo: '4', hi: '3' }, arrays: {} })).toMatchObject({ result: false, parts: [{ shown: '4 <= 3' }] })
		// A list walk: curr is the value of its node, or null off the end.
		expect(shownTest('    while (curr != null) {', 'java', { vars: { curr: '42' }, arrays: {} })?.parts[0]).toMatchObject({ shown: '42 != null', value: true })
		expect(shownTest('    while curr is not None:', 'python', { vars: { curr: 'None' }, arrays: {} })?.parts[0]).toMatchObject({ shown: 'None is not None', value: false })
		expect(shownTest('    while curr is not None:', 'python', { vars: { curr: '7' }, arrays: {} })?.result).toBe(true)
		expect(shownTest('    while (curr != null) {', 'java', { vars: { curr: 'null' }, arrays: {} })?.parts[0]).toMatchObject({ shown: 'null != null', value: false })
	})
})
