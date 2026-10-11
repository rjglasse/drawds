import { buildTable, entriesOf, isTombstone, keyOf, nextPrime, type HashScheme } from '../shapes/hash/hash'

// A hash table's moves, as its transcript keeps them (as `array-moves.ts` for arrays): its keys
// bucket by bucket (a value carried as key:value rides along, as in its code), and how keys find
// their place. Where a key lands depends on what went in before it (a chain's order, a probe), so a
// table is written as keys put in, in an order that is checked to give this very table; one that
// no order gives (a key typed into the wrong bucket, a deleted marker) is laid out bucket by bucket.

/** What a hash table's transcript follows: its scheme and its keys, bucket by bucket (deleted markers kept). */
export interface HashState extends HashScheme {
	buckets: string[][]
}

/** A table as the transcript makes it: m buckets and the keys put in, in order; or, if no order gives it, its buckets as they are. */
export type HashTable = HashScheme & { m: number } & ({ keys: string[] } | { buckets: string[][] })

export type HashMove =
	| { op: 'new'; name: string; table: HashTable }
	/** A key typed over the one at place `at` of bucket `b`'s chain (probing: slot b). */
	| { op: 'set'; b: number; at: number; key: string }
	/** The key at place `at` of bucket `b`'s chain unlinked (probing: slot b emptied), as typing it away does. */
	| { op: 'clear'; b: number; at: number }
	/** Grown to the next prime past 2m and every key put in again, as the code's rehash does. */
	| { op: 'rehash' }
	/** A new table (the keys refilled, another scheme). */
	| { op: 'assign'; table: HashTable }
	/** An operation played step by step and put in: its algorithm's call, with the key it worked on. */
	| { op: 'call'; algorithm: string; label: string; effect: HashMove[]; args?: { key?: string } }

export const hashState = ({ strategy, code, compress, buckets }: HashState): HashState => ({
	strategy,
	code,
	compress,
	buckets: buckets.map((bucket) => bucket.map((e) => (isTombstone(e) ? e : keyOf(e)))),
})

const sameBuckets = (a: readonly (readonly string[])[], b: readonly (readonly string[])[]) =>
	a.length === b.length && a.every((bucket, i) => bucket.length === b[i].length && bucket.every((e, j) => e === b[i][j]))

const sameScheme = (a: HashScheme, b: HashScheme) => a.strategy === b.strategy && a.code === b.code && a.compress === b.compress

export const sameHash = (a: HashState, b: HashState) => sameScheme(a, b) && sameBuckets(a.buckets, b.buckets)

const schemeOf = ({ strategy, code, compress }: HashScheme): HashScheme => ({ strategy, code, compress })

/**
 * The table as the transcript makes it: its keys put in, in the first order that gives these very
 * buckets (`hint`, the order they had before; bucket by bucket; probing, slot by slot from just past
 * an empty one, so a key that collided goes in after what it collided with); else as it is.
 */
export function tableOf(s: HashState, hint: readonly string[] = []): HashTable {
	const { buckets } = s
	const scheme = schemeOf(s)
	const m = buckets.length
	const keys = entriesOf(buckets)
	const slotOrder = (start: number) => Array.from({ length: m }, (_, k) => buckets[(start + k) % m]).flatMap((slot) => entriesOf([slot]))
	const empty = buckets.findIndex((b) => !b.length)
	const orders = [
		[...hint.filter((k) => keys.includes(k)), ...keys.filter((k) => !hint.includes(k))],
		keys,
		...(s.strategy === 'probing' ? (empty >= 0 ? [slotOrder(empty + 1)] : buckets.map((_, start) => slotOrder(start))) : []),
	]
	const order = orders.find((o) => o.length === keys.length && sameBuckets(buildTable(o, m, scheme), buckets))
	return order ? { ...scheme, m, keys: order } : { ...scheme, m, buckets: buckets.map((b) => [...b]) }
}

/**
 * The moves that take a table from `prev` to `next`: a key typed over another or away, the table
 * grown and rehashed; else a new table.
 */
export function diffHash(prev: HashState, next: HashState): HashMove[] {
	if (sameHash(prev, next)) return []
	const [a, b] = [prev.buckets, next.buckets]
	if (sameScheme(prev, next) && a.length === b.length) {
		const changed = a.flatMap((bucket, i) => (sameBuckets([bucket], [b[i]]) ? [] : [i]))
		if (changed.length === 1) {
			const [i] = changed
			const [was, now] = [a[i], b[i]]
			// A slot holds one key (or a deleted marker), or none.
			if (next.strategy === 'probing') return [now.length ? { op: 'set', b: i, at: 0, key: now[0] } : { op: 'clear', b: i, at: 0 }]
			if (now.length === was.length) {
				const at = was.findIndex((e, j) => e !== now[j])
				if (was.every((e, j) => j === at || e === now[j])) return [{ op: 'set', b: i, at, key: now[at] }]
			}
			if (now.length === was.length - 1) {
				let at = 0
				while (at < now.length && was[at] === now[at]) at++
				if (now.every((e, j) => e === was[j < at ? j : j + 1])) return [{ op: 'clear', b: i, at }]
			}
		}
	}
	if (sameScheme(prev, next) && b.length === nextPrime(2 * a.length + 1) && sameBuckets(buildTable(entriesOf(a), b.length, next), b)) return [{ op: 'rehash' }]
	return [{ op: 'assign', table: tableOf(next, entriesOf(a)) }]
}

/** What can be told of an operation's parameters from what it did: the one key put in or taken out. */
export function hashArgs(prev: HashState, next: HashState): { key?: string } {
	// Counted: a key typed into the wrong bucket may be in the table twice.
	const less = (a: string[], b: string[]) => {
		const left = [...a]
		for (const k of b) if (left.includes(k)) left.splice(left.indexOf(k), 1)
		return left
	}
	const [before, after] = [entriesOf(prev.buckets), entriesOf(next.buckets)]
	const [added, gone] = [less(after, before), less(before, after)]
	if (added.length + gone.length !== 1) return {}
	return { key: [...added, ...gone][0] }
}
