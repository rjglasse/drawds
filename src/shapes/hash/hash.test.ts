import { describe, expect, it } from 'vitest'
import {
	TOMBSTONE,
	buildTable,
	bucketsFor,
	chainNodeKeys,
	deleteKey,
	entriesOf,
	findKey,
	hashOf,
	insertEntry,
	keyOf,
	misplaced,
	nextPrime,
	rehash,
} from './hash'
import { hashScene } from './layout'

const captions = (op: { frames: { caption?: string }[] }) => op.frames.map((f) => f.caption)

describe('hashing', () => {
	it('integers hash to k mod m, text to its character codes added, mod m; key:value hashes the key', () => {
		expect(hashOf('23', 7)).toEqual({ index: 2, how: '23 mod 7 = 2' })
		expect(hashOf('-3', 7).index).toBe(4)
		expect(hashOf('cat', 7)).toEqual({ index: 312 % 7, how: `(99 + 97 + 116) mod 7 = ${312 % 7}` })
		expect(keyOf('cat: 3')).toBe('cat')
		expect(nextPrime(14)).toBe(17)
		expect(bucketsFor(5)).toBe(11)
	})

	it('builds a table: chains in insertion order, or the next free slot when probing', () => {
		expect(buildTable(['8', '15', '3', '22'], 7, 'chaining')).toEqual([[], ['8', '15', '22'], [], ['3'], [], [], []])
		expect(buildTable(['8', '15', '2', '22'], 7, 'probing')).toEqual([[], ['8'], ['15'], ['2'], ['22'], [], []])
		// One copy of each key.
		expect(entriesOf(buildTable(['8', '8'], 7, 'chaining'))).toEqual(['8'])
	})

	it('rings keys out of place: a chain that is not its hash, a probe run broken by an empty slot', () => {
		expect(misplaced([[], ['8', '9'], [], [], [], [], []], 'chaining')).toEqual(['k:9'])
		expect(misplaced([['5'], ['4'], ['1']], 'probing')).toEqual([])
		expect(misplaced([[], [], ['7'], [], ['8']], 'probing')).toEqual(['s4'])
		// A deleted marker doesn't break a run.
		expect(misplaced([[], ['6'], [TOMBSTONE], ['11'], []], 'probing')).toEqual([])
	})

	it('names repeated chained entries apart', () => {
		expect(chainNodeKeys([['a', 'b'], ['a']])).toEqual([['k:a', 'k:b'], ['k:a~2']])
	})
})

describe('chaining step by step', () => {
	const table = buildTable(['8', '15', '3'], 7, 'chaining')

	it('insert walks the chain, then adds the key at its end', () => {
		const op = insertEntry(table, 'chaining', '22')
		expect(captions(op)).toEqual([
			"Insert 22: h(22) = 22 mod 7 = 1: walk bucket 1's chain",
			'8 ≠ 22: on along the chain',
			'15 ≠ 22: the end of the chain',
			'Add it at the end of the chain. n = 4, m = 7: load factor 0.57',
		])
		expect(op.buckets![1]).toEqual(['8', '15', '22'])
		expect(captions(insertEntry(table, 'chaining', '15')).at(-1)).toBe('15 is in the table already: it keeps one copy of each key')
	})

	it('find stops at the key or the end of its chain; delete unlinks', () => {
		expect(findKey(table, 'chaining', '15').finalFlash).toEqual({ 'k:15': 'green' })
		expect(captions(findKey(table, 'chaining', '1')).at(-1)).toBe("1 is not in the table: not in bucket 1's chain, the only place it could be")
		expect(deleteKey(table, 'chaining', '8').buckets![1]).toEqual(['15'])
	})
})

describe('linear probing step by step', () => {
	const table = buildTable(['8', '15', '22'], 7, 'probing')

	it('a collision moves on to the next slot, counting probes', () => {
		const op = insertEntry(table, 'probing', '29')
		expect(captions(op).slice(0, 4)).toEqual([
			'Insert 29: h(29) = 29 mod 7 = 1: slot 1: 8: taken, try the next',
			'try slot 2: 15: taken, try the next',
			'try slot 3: 22: taken, try the next',
			'try slot 4: empty',
		])
		expect(op.frames[3].counts).toEqual({ probes: 4 })
		expect(op.buckets![4]).toEqual(['29'])
	})

	it('delete leaves a marker, so a key further on is still found; insert reuses the marker', () => {
		const deleted = deleteKey(table, 'probing', '8').buckets!
		expect(deleted[1]).toEqual([TOMBSTONE])
		expect(findKey(deleted, 'probing', '22').finalFlash).toEqual({ s3: 'green' })
		expect(captions(findKey(deleted, 'probing', '22'))[0]).toContain('a deleted marker: 22 may be further on, keep looking')
		const reused = insertEntry(deleted, 'probing', '1')
		expect(reused.buckets![1]).toEqual(['1'])
		expect(captions(reused).at(-1)).toMatch(/^1 isn't further on, so reuse the deleted slot 1/)
	})

	it('a find stops at an empty slot: the key would have gone there', () => {
		expect(captions(findKey(table, 'probing', '36')).at(-1)).toBe("An empty slot: 36 would have gone here, so it isn't in the table")
	})
})

describe('rehash', () => {
	it('moves every key into a table about twice the size, one at a time', () => {
		const table = buildTable(['8', '15', '3'], 7, 'chaining')
		const op = rehash(table, 'chaining')
		expect(op.buckets!.length).toBe(17)
		expect(entriesOf(op.buckets!).sort()).toEqual(['15', '3', '8'])
		expect(op.frames[0].strips).toEqual([{ title: 'keys to move', items: ['8', '15', '3'] }])
		expect(captions(op)[1]).toBe('h(8) = 8 mod 17 = 8')
	})
})

describe('hash table scene', () => {
	it('chaining: a pointer cell per bucket, chains of [key | next] nodes; probing: a slot per bucket', () => {
		const scene = hashScene({ buckets: [[], ['8', '15']], strategy: 'chaining', size: 'm' })
		expect(scene.edges.map((e) => [e.from, e.to])).toEqual([
			['b1', 'k:8'],
			['k:8', 'k:15'],
		])
		const slots = hashScene({ buckets: [['8'], [TOMBSTONE], []], strategy: 'probing', size: 'm' })
		expect(slots.nodes.filter((n) => n.kind === 'box').map((n) => n.value)).toEqual(['8', '×', ''])
		expect(slots.nodes.find((n) => n.key === '#load')?.value).toBe('n = 1, m = 3, load 0.33')
	})
})
