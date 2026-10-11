import { describe, expect, it } from 'vitest'
import { MEMORY_COLS, address, memoryLayout, otherData, runRows, type MemoryInput } from './model'

const list = (values: string[], { doubly = false, ids = values.map((_, i) => `n${i}`) } = {}): MemoryInput => ({
	kind: 'list',
	nodes: values.map((value, i) => ({ id: ids[i], value })),
	doubly,
	next: Object.fromEntries(ids.map((id, i) => [id, ids[i + 1] ?? null])),
	prev: doubly ? Object.fromEntries(ids.map((id, i) => [id, ids[i - 1] ?? null])) : undefined,
	names: [{ name: 'head', at: ids[0] ?? null }],
})

const startsOf = (layout: ReturnType<typeof memoryLayout>) => Object.fromEntries(layout.blocks.map((b) => [b.key, b.from]))

describe('memory, as lecture 5 draws it', () => {
	it('other data: none, one cell a row, or two a row leaving two side by side; adding rows moves none', () => {
		expect(otherData(4, 'free', 1).size).toBe(0)
		for (let seed = 1; seed < 30; seed++) {
			const some = otherData(4, 'some', seed)
			expect(some.size).toBe(4)
			const crowded = otherData(6, 'crowded', seed)
			expect(crowded.size).toBe(12)
			for (let r = 0; r < 6; r++) {
				const free = [0, 1, 2, 3].filter((c) => !crowded.has(r * MEMORY_COLS + c))
				expect(free).toHaveLength(2)
				expect(free[1] - free[0]).toBe(1)
			}
			expect([...otherData(4, 'crowded', seed)].every((a) => crowded.has(a))).toBe(true)
		}
	})

	it('an array books one block of cells side by side, a[i] at its start + i', () => {
		for (let seed = 1; seed < 40; seed++) {
			for (const busy of ['free', 'some'] as const) {
				const m = memoryLayout({ kind: 'array', name: 'a', values: ['1', '2', '3'] }, busy, seed)
				const [block] = m.blocks
				expect(block.to - block.from).toBe(2)
				expect([0, 1, 2].map((i) => m.cells[block.from + i])).toEqual(['1', '2', '3'].map((text, i) => ({ text, role: 'array', key: String(i) })))
				expect(m.legend).toEqual([`a = ${address(block.from)}: a[i] at ${address(block.from)} + i`])
				// Other data around it: none in free memory, at most one cell a row.
				const other = m.cells.filter((c) => c.role === 'other').length
				expect(busy === 'free' ? other === 0 : other > 0 && other <= m.rows).toBe(true)
			}
		}
		expect(address(10)).toBe('0xA')
		expect(address(31)).toBe('0x1F')
	})

	it('in crowded memory an array of seven finds no room, and says why; elsewhere it books its block', () => {
		const seven = { kind: 'array' as const, name: 'a', values: ['1', '2', '3', '4', '5', '6', '7'] }
		for (let seed = 1; seed < 20; seed++) {
			const crowded = memoryLayout(seven, 'crowded', seed)
			expect(crowded.blocks).toEqual([])
			expect(crowded.rows).toBe(4)
			expect(crowded.note).toEqual(['No room for a: no 7 free cells side by side,', 'and an array needs its cells together'])
			const some = memoryLayout(seven, 'some', seed)
			expect(some.note).toBeUndefined()
			expect(some.blocks[0].to - some.blocks[0].from).toBe(6)
			// Bigger than memory: it grows.
			expect(memoryLayout({ ...seven, values: Array(20).fill('1') }, 'free', seed).rows).toBe(5)
		}
	})

	it('a list’s nodes go anywhere there is room, each its value and its next’s address, the pointers chased', () => {
		for (let seed = 1; seed < 40; seed++) {
			for (const busy of ['free', 'some', 'crowded'] as const) {
				const m = memoryLayout(list(['5', '8', '2']), busy, seed)
				const at = startsOf(m)
				expect(Object.keys(at)).toEqual(['n0', 'n1', 'n2'])
				expect(m.cells[at.n0]).toEqual({ text: '5', role: 'value', key: 'n0' })
				expect(m.cells[at.n0 + 1]).toEqual({ text: address(at.n1), role: 'next', key: 'n0' })
				expect(m.cells[at.n2 + 1]).toEqual({ text: 'null', role: 'next', key: 'n2' })
				expect(m.arrows).toEqual([
					{ from: at.n0 + 1, to: at.n1 },
					{ from: at.n1 + 1, to: at.n2 },
				])
				expect(m.legend).toEqual([`head = ${address(at.n0)}`])
				// No node on other data or another node.
				const taken = m.blocks.flatMap((b) => [b.from, b.to])
				expect(new Set(taken).size).toBe(taken.length)
				expect(taken.every((a) => m.cells[a].role !== 'other' && m.cells[a].role !== 'free')).toBe(true)
			}
		}
	})

	it('a node put in at the head moves no other node', () => {
		for (let seed = 1; seed < 40; seed++) {
			const before = startsOf(memoryLayout(list(['5', '8', '2']), 'some', seed))
			const after = startsOf(memoryLayout(list(['9', '5', '8', '2'], { ids: ['n3', 'n0', 'n1', 'n2'] }), 'some', seed))
			expect({ n0: after.n0, n1: after.n1, n2: after.n2 }).toEqual(before)
		}
	})

	it('a doubly linked node is prev, value, next; memory grows for a long list', () => {
		const m = memoryLayout(list(['5', '8'], { doubly: true }), 'some', 3)
		const at = startsOf(m)
		expect(m.cells.slice(at.n1, at.n1 + 3)).toEqual([
			{ text: address(at.n0), role: 'prev', key: 'n1' },
			{ text: '8', role: 'value', key: 'n1' },
			{ text: 'null', role: 'next', key: 'n1' },
		])
		expect(m.arrows).toContainEqual({ from: at.n1, to: at.n0, prev: true })
		// Crowded memory leaves every row room for one.
		for (let seed = 1; seed < 30; seed++) expect(memoryLayout(list(['5', '8', '2'], { doubly: true }), 'crowded', seed).rows).toBe(4)
		const long = memoryLayout(list(Array.from({ length: 10 }, (_, i) => String(i))), 'crowded', 3)
		expect(long.rows).toBeGreaterThan(4)
		expect(long.blocks).toHaveLength(10)
	})

	it('a run of cells drawn row by row', () => {
		expect(runRows(2, 6)).toEqual([
			{ row: 0, from: 2, to: 3 },
			{ row: 1, from: 0, to: 2 },
		])
		expect(runRows(5, 5)).toEqual([{ row: 1, from: 1, to: 1 }])
	})
})
