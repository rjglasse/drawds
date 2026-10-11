import { mulberry32 } from '../../data/random'

// A structure laid out in memory (lecture 5): a grid of cells, each with an address. An array books
// one block of cells side by side; a linked list's nodes go wherever there is room, each node its
// fields side by side (prev, value, next), and the pointers between them are chased. Other data has
// some cells already (how busy memory is): around the array, or, crowded, first, so that an array may
// find no gap big enough while a list's nodes still fit in the gaps. Where things go is seeded and stable: adding a
// node at the head moves no other node, as the lecture says.

export type MemoryBusy = 'free' | 'some' | 'crowded'

/** Cells per row. */
export const MEMORY_COLS = 4
/** Rows to start with: 16 cells, the lecture's memory. */
const START_ROWS = 4
/** The most rows memory grows to for a structure that doesn't fit. */
const MAX_ROWS = 16

export type MemoryInput =
	| { kind: 'array'; name: string; values: readonly string[] }
	| {
			kind: 'list'
			/** Every node, the list's own order (a sentinel first). */
			nodes: readonly { id: string; value: string }[]
			doubly: boolean
			/** Each node's next and prev (null: none). */
			next: Readonly<Record<string, string | null>>
			prev?: Readonly<Record<string, string | null>>
			/** The names pointing into the list (head, tail; top; front, rear) and their nodes. */
			names: readonly { name: string; at: string | null }[]
	  }

export interface MemoryCell {
	/** What it holds: a value, an address (0x6) or null; '' for nothing. */
	text: string
	role: 'free' | 'other' | 'array' | 'value' | 'next' | 'prev'
	/** The element it belongs to: an array's index, a list node's id. */
	key?: string
}

export interface MemoryLayout {
	rows: number
	cells: MemoryCell[]
	/** Cells that belong together (the array; each node), by address, outlined together. */
	blocks: { key: string; from: number; to: number }[]
	/** Pointers chased: from a next or prev cell to the node it holds the address of. */
	arrows: { from: number; to: number; prev?: boolean }[]
	/** What the names hold: a = 0x4; head = 0x6. */
	legend: string[]
	/** Why the structure isn't there (no room for the array), a line each. */
	note?: string[]
}

export const address = (a: number) => `0x${a.toString(16).toUpperCase()}`

/** A number from 0 to 1 for `key`, the same every time for this seed. */
function hash(seed: number, key: string): number {
	let h = seed >>> 0
	for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 0x9e3779b1) >>> 0
	return mulberry32(h)()
}

/**
 * Each row's cells holding other data: one a row, or crowded, two leaving a pair free; by the cells a
 * node needs side by side (a doubly linked node's three: at most one a row, at an end).
 */
const ROW_PATTERNS: Record<MemoryBusy, Record<2 | 3, number[][]>> = {
	free: { 2: [[]], 3: [[]] },
	some: { 2: [[0], [1], [2], [3]], 3: [[0], [3], []] },
	crowded: {
		2: [
			[0, 3],
			[0, 1],
			[2, 3],
		],
		3: [[0], [3]],
	},
}

/**
 * The addresses other data has in `rows` rows, leaving every row `need` cells side by side: each
 * row's pattern seeded by its row, so adding rows moves nothing.
 */
export function otherData(rows: number, busy: MemoryBusy, seed: number, need: 2 | 3 = 2): Set<number> {
	const patterns = ROW_PATTERNS[busy][need]
	const taken = new Set<number>()
	for (let r = 0; r < rows; r++) {
		const pattern = patterns[Math.floor(hash(seed, `row${r}`) * patterns.length)]
		for (const c of pattern) taken.add(r * MEMORY_COLS + c)
	}
	return taken
}

/**
 * The first address from `start` on (going round once) where `size` free cells sit side by side, else
 * -1. `inRow`: within one row of the drawing if there is such a place (a node reads best whole).
 */
function findRun(used: readonly boolean[], size: number, start: number, inRow = false): number {
	const total = used.length
	for (const whole of inRow ? [true, false] : [false]) {
		for (let k = 0; k < total; k++) {
			const a = (start + k) % total
			if (a + size > total || (whole && (a % MEMORY_COLS) + size > MEMORY_COLS)) continue
			let free = true
			for (let i = a; i < a + size && free; i++) free = !used[i]
			if (free) return a
		}
	}
	return -1
}

/** Node ids in the order they claim their cells: oldest first (n2 before n10), so a new node moves no other. */
const byAge = (a: string, b: string) => {
	const [x, y] = [/\d+$/.exec(a), /\d+$/.exec(b)]
	return x && y && a.slice(0, x.index) === b.slice(0, y.index) ? Number(x[0]) - Number(y[0]) : a < b ? -1 : a > b ? 1 : 0
}

/** The structure in memory: `busy` says how much other data there is, `seed` where things go. */
export function memoryLayout(input: MemoryInput, busy: MemoryBusy, seed: number): MemoryLayout {
	for (let rows = START_ROWS; ; rows++) {
		const placed = place(input, busy, seed, rows)
		// Memory grows for what doesn't fit, but crowded memory doesn't for an array: that is the point.
		if (placed || rows >= MAX_ROWS || (input.kind === 'array' && busy === 'crowded')) return placed ?? noRoom(input, busy, seed, rows)
	}
}

/** The cells a list's node takes side by side (value and next; prev first in a doubly linked one), else 2. */
const nodeSize = (input: MemoryInput) => (input.kind === 'list' && input.doubly ? 3 : 2)

function emptyCells(rows: number, busy: MemoryBusy, seed: number, need: 2 | 3): MemoryCell[] {
	const other = otherData(rows, busy, seed, need)
	return Array.from({ length: rows * MEMORY_COLS }, (_, a) => ({ text: '', role: other.has(a) ? 'other' : 'free' }))
}

function noRoom(input: MemoryInput, busy: MemoryBusy, seed: number, rows: number): MemoryLayout {
	const n = input.kind === 'array' ? input.values.length : input.nodes.length
	const note =
		input.kind === 'array' ? [`No room for ${input.name}: no ${n} free cells side by side,`, 'and an array needs its cells together'] : [`No room for ${n} nodes`]
	return { rows, cells: emptyCells(rows, busy, seed, nodeSize(input)), blocks: [], arrows: [], legend: [], note }
}

/** Everything in `rows` rows, or undefined if it doesn't fit. */
function place(input: MemoryInput, busy: MemoryBusy, seed: number, rows: number): MemoryLayout | undefined {
	const cells = emptyCells(rows, busy, seed, nodeSize(input))
	const used = cells.map((c) => c.role !== 'free')
	const total = cells.length
	if (input.kind === 'array') {
		const n = input.values.length
		const { name } = input
		if (!n) return { rows, cells, blocks: [], arrows: [], legend: [`${name}: no cells`] }
		// Crowded, the first gap big enough from a seeded address on; else it books its block first, the
		// other data around it.
		const start = busy === 'crowded' ? findRun(used, n, Math.floor(hash(seed, 'array') * total)) : n > total ? -1 : Math.floor(hash(seed, 'array') * (total - n + 1))
		if (start < 0) return undefined
		input.values.forEach((v, i) => (cells[start + i] = { text: v, role: 'array', key: String(i) }))
		return {
			rows,
			cells,
			blocks: [{ key: 'array', from: start, to: start + n - 1 }],
			arrows: [],
			legend: [`${name} = ${address(start)}: ${name}[i] at ${address(start)} + i`],
		}
	}
	const size = nodeSize(input)
	const starts = new Map<string, number>()
	// Each node from its own seeded address on, oldest first; within the first 16 cells, so growing moves none.
	for (const { id } of [...input.nodes].sort((a, b) => byAge(a.id, b.id))) {
		const start = findRun(used, size, Math.floor(hash(seed, id) * START_ROWS * MEMORY_COLS), true)
		if (start < 0) return undefined
		for (let i = start; i < start + size; i++) used[i] = true
		starts.set(id, start)
	}
	const pointer = (to: string | null | undefined) => (to != null && starts.has(to) ? address(starts.get(to)!) : 'null')
	const blocks: MemoryLayout['blocks'] = []
	const arrows: MemoryLayout['arrows'] = []
	for (const { id, value } of input.nodes) {
		const start = starts.get(id)!
		const [prevAt, valueAt, nextAt] = input.doubly ? [start, start + 1, start + 2] : [-1, start, start + 1]
		const [next, prev] = [input.next[id], input.prev?.[id]]
		cells[valueAt] = { text: value, role: 'value', key: id }
		cells[nextAt] = { text: pointer(next), role: 'next', key: id }
		if (next != null && starts.has(next)) arrows.push({ from: nextAt, to: starts.get(next)! })
		if (input.doubly) {
			cells[prevAt] = { text: pointer(prev), role: 'prev', key: id }
			if (prev != null && starts.has(prev)) arrows.push({ from: prevAt, to: starts.get(prev)!, prev: true })
		}
		blocks.push({ key: id, from: start, to: start + size - 1 })
	}
	return { rows, cells, blocks, arrows, legend: input.names.map(({ name, at }) => `${name} = ${pointer(at)}`) }
}

/** Every address in a run of cells, for drawing it row by row. */
export function runRows(from: number, to: number): { row: number; from: number; to: number }[] {
	const rows: { row: number; from: number; to: number }[] = []
	for (let a = from; a <= to; ) {
		const row = Math.floor(a / MEMORY_COLS)
		const end = Math.min(to, row * MEMORY_COLS + MEMORY_COLS - 1)
		rows.push({ row, from: a % MEMORY_COLS, to: end % MEMORY_COLS })
		a = end + 1
	}
	return rows
}
