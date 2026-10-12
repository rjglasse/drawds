import { describe, expect, it } from 'vitest'
import { conditionOf, readsBefore, shownTest } from './tests'

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

describe('tests beside nodes', () => {
	// head -> 7 -> 9 -> 9 -> 4 -> null: two nodes hold 9.
	const list: Record<string, { value: string; next: string | null }> = {
		n0: { value: '7', next: 'n1' },
		n1: { value: '9', next: 'n2' },
		n2: { value: '9', next: 'n3' },
		n3: { value: '4', next: null },
	}
	const keys = Object.keys(list)
	const nodes = (refs: Record<string, string | null>, vars: Record<string, string> = {}) => ({
		vars,
		arrays: {},
		refs: { head: 'n0', ...refs },
		field: (node: string, f: string) =>
			f === 'value' ? { value: list[node].value } : f === 'next' ? { ref: list[node].next } : undefined,
		nodeName: (node: string) => {
			const { value } = list[node]
			return keys.filter((k) => list[k].value === value).length > 1 ? `${value}@${keys.indexOf(node)}` : value
		},
	})

	it("a list's find: curr's value, and null when it has walked off the end", () => {
		const line = '        if (curr.value == value)'
		expect(shownTest(line, 'java', nodes({ curr: 'n0' }, { value: '4' }))).toMatchObject({ result: false, parts: [{ shown: '7 == 4' }] })
		expect(shownTest(line, 'java', nodes({ curr: 'n3' }, { value: '4' }))).toMatchObject({ result: true, parts: [{ shown: '4 == 4' }] })
		const walk = '    while (curr != null && curr.value != key) {'
		expect(shownTest(walk, 'java', nodes({ curr: 'n0' }, { key: '4' }))?.parts.map((p) => p.shown)).toEqual(['7 != null', '7 != 4'])
		// Off the end: curr.value is never read.
		const off = shownTest(walk, 'java', nodes({ curr: null }, { key: '5' }))!
		expect(off.result).toBe(false)
		expect(off.parts.map((p) => p.shown)).toEqual(['null != null', undefined])
	})

	it('which node, not which value: two nodes holding 9 are not the same node, and say which they are', () => {
		const line = '        if (slow == fast)'
		const apart = shownTest(line, 'java', nodes({ slow: 'n1', fast: 'n2' }))!
		expect(apart).toMatchObject({ result: false, parts: [{ shown: '9@1 == 9@2' }] })
		expect(shownTest(line, 'java', nodes({ slow: 'n2', fast: 'n2' }))?.result).toBe(true)
		// A value of their own: plain.
		expect(shownTest('        if (curr == head)', 'java', nodes({ curr: 'n0' }))?.parts[0].shown).toBe('7 == 7')
		expect(shownTest('        if (curr == tail)', 'java', nodes({ curr: 'n3', tail: 'n3' }))?.result).toBe(true)
	})

	it('fields in a chain, C and Python spellings', () => {
		expect(shownTest('    while (curr.next != null) {', 'java', nodes({ curr: 'n3' }))).toMatchObject({ result: false, parts: [{ shown: 'null != null' }] })
		expect(shownTest('    while (curr->next != NULL) {', 'c', nodes({ curr: 'n1' }))).toMatchObject({ result: true, parts: [{ shown: '9@2 != NULL' }] })
		expect(shownTest('    while curr.next is not None:', 'python', nodes({ curr: 'n0' }))).toMatchObject({ result: true, parts: [{ shown: '9@1 is not None' }] })
		expect(shownTest('    if (head == null || head.next == null)', 'java', nodes({}))?.parts.map((p) => p.shown)).toEqual(['7 == null', '9@1 == null'])
		expect(shownTest('    if (curr.next.value > 8)', 'java', nodes({ curr: 'n0' }))?.parts[0].shown).toBe('9 > 8')
		// A field the node hasn't: nothing shown, rather than a guess.
		expect(shownTest('    if (curr.left != null)', 'java', nodes({ curr: 'n0' }))).toBeUndefined()
		// Ordering two nodes means nothing.
		expect(shownTest('    if (slow < fast)', 'java', nodes({ slow: 'n0', fast: 'n1' }))).toBeUndefined()
	})

	it('an array indexed by a vertex: visited[w], its T and F booleans', () => {
		const values = { vars: { w: 'C', v: 'A' }, arrays: { visited: ['T', 'F', 'T'] }, labels: { visited: ['A', 'B', 'C'] } }
		expect(shownTest('            if (!visited[w]) {', 'java', values)).toMatchObject({ result: false, parts: [{ shown: '!true' }] })
		expect(shownTest('            if not visited[w]:', 'python', { ...values, vars: { w: 'B' } })).toMatchObject({ result: true, parts: [{ shown: 'not False' }] })
		expect(shownTest('            if (w != parent) {', 'java', { ...values, vars: { w: 'C', parent: 'A' } })?.parts[0].shown).toBe('C != A')
		expect(shownTest('            if (!visited[x]) {', 'java', { ...values, vars: { x: 'Z' } })).toBeUndefined()
	})
})

describe('a test that acts on its own line', () => {
	it('reads the step before when one step is both the test and what it does, not for a return or a block', () => {
		expect(readsBefore('        if (key < curr.key) curr = curr.left;', 'java', 1)).toBe(true)
		expect(readsBefore('    while (s->left != NULL) s = s->left;', 'c', 1)).toBe(true)
		// Its test tagged first: a step of its own before the act.
		expect(readsBefore('            if (a[j] > a[j + 1]) swap(a, j, j + 1);', 'java', 2)).toBe(false)
		expect(readsBefore('        if (key == curr.key) return curr;', 'java', 1)).toBe(false)
		expect(readsBefore('        if (slow == fast) {', 'java', 1)).toBe(false)
		expect(readsBefore('    if (top < 1) { fprintf(stderr, "too few operands\\n"); exit(1); }', 'c', 1)).toBe(false)
		expect(readsBefore('        if key < curr.key:', 'python', 1)).toBe(false)
	})

	it("a tree's steps name nodes by value: a value one node holds is that node", () => {
		const nodes: Record<string, { value: string; left: string | null; right: string | null }> = {
			a: { value: '40', left: 'b', right: 'c' },
			b: { value: '20', left: null, right: null },
			c: { value: '50', left: null, right: null },
		}
		const values = (vars: Record<string, string>) => ({
			vars,
			arrays: {},
			field: (n: string, f: string) => (f === 'key' ? { value: nodes[n].value } : f === 'left' || f === 'right' ? { ref: nodes[n][f] } : undefined),
			nodeName: (n: string) => nodes[n].value,
			resolve: (v: string) => Object.keys(nodes).find((k) => nodes[k].value === v),
		})
		expect(shownTest('    if (key < curr.key) {', 'java', values({ key: '33', curr: '40' }))?.parts[0].shown).toBe('33 < 40')
		expect(shownTest('    if (node.left == null && node.right == null)', 'java', values({ node: '20' }))?.result).toBe(true)
		// s is node.right: the same node, though s is a value and node.right a node.
		expect(shownTest('        if (s != node.right) {', 'java', values({ s: '50', node: '40' }))).toMatchObject({ result: false, parts: [{ shown: '50 != 50' }] })
		expect(shownTest('        if (s != node.right) {', 'java', values({ s: '20', node: '40' }))?.result).toBe(true)
		// A value no node holds: nothing.
		expect(shownTest('    if (curr.left != null)', 'java', values({ curr: '99' }))).toBeUndefined()
	})
})
