import type { MarkColor } from '../../cells/marks'
import type { Frame, Strip } from '../../nodelink/playback'
import type { Pointer } from '../../pointers/pointers'
import { MAX_BUCKETS, type HashStrategy } from './hash-shape-types'

// A hash table, pure: the hash function (with how it was worked out, for the captions), building
// a table, finding keys out of place, and insert / find / delete / rehash as frames.
//
// Chaining: each bucket holds a chain of entries. Linear probing: each slot holds at most one, and a
// collision moves on to the next slot; a deleted entry leaves a TOMBSTONE, so finds keep going past it.

export const TOMBSTONE = '\u0000deleted'
export const isTombstone = (entry: string | undefined) => entry === TOMBSTONE

/** An entry's key: the part before a colon (`cat:3` is key cat, value 3). */
export const keyOf = (entry: string) => entry.split(':')[0].trim()

/** h(key) for a table of m buckets, and how it was worked out. Integers: k mod m; text: the sum of its character codes mod m. */
export function hashOf(key: string, m: number): { index: number; how: string } {
	if (/^-?\d+$/.test(key)) {
		const index = ((Number(key) % m) + m) % m
		return { index, how: `${key} mod ${m} = ${index}` }
	}
	const codes = [...key].map((ch) => ch.codePointAt(0)!)
	const sum = codes.reduce((a, b) => a + b, 0)
	const index = sum % m
	const shown = codes.length <= 4 ? `(${codes.join(' + ')})` : `${sum} (its character codes added)`
	return { index, how: `${shown} mod ${m} = ${index}` }
}

const isPrime = (n: number) => {
	if (n < 2) return false
	for (let d = 2; d * d <= n; d++) if (n % d === 0) return false
	return true
}

/** The smallest prime at least n (bucket counts are prime, so keys spread over all of them). */
export function nextPrime(n: number) {
	let p = Math.max(2, Math.ceil(n))
	while (!isPrime(p)) p++
	return p
}

/** Every entry, bucket by bucket (tombstones left out). */
export function entriesOf(buckets: readonly (readonly string[])[]): string[] {
	return buckets.flat().filter((e) => !isTombstone(e))
}

/** Stable scene keys for chained entries: `k:<entry>` (a repeated entry gets `~2`, `~3`...). */
export function chainNodeKeys(buckets: readonly (readonly string[])[]): string[][] {
	const seen = new Map<string, number>()
	return buckets.map((chain) =>
		chain.map((entry) => {
			const n = (seen.get(entry) ?? 0) + 1
			seen.set(entry, n)
			return n === 1 ? `k:${entry}` : `k:${entry}~${n}`
		})
	)
}

export const slotKey = (i: number) => `s${i}`
export const bucketKey = (i: number) => `b${i}`

/** Where linear probing puts `key` (or finds it): the slots it looks at, and how it ends. */
function probe(buckets: readonly (readonly string[])[], key: string) {
	const m = buckets.length
	const start = hashOf(key, m).index
	const path: number[] = []
	let tomb: number | undefined
	for (let k = 0; k < m; k++) {
		const i = (start + k) % m
		path.push(i)
		const entry = buckets[i][0]
		if (entry === undefined) return { path, end: 'empty' as const, at: i, tomb }
		if (isTombstone(entry)) tomb ??= i
		else if (keyOf(entry) === key) return { path, end: 'found' as const, at: i, tomb }
	}
	return { path, end: 'full' as const, at: undefined, tomb }
}

/** The table holding `entries`, put in in order, with m buckets. */
export function buildTable(entries: readonly string[], m: number, strategy: HashStrategy): string[][] {
	const buckets: string[][] = Array.from({ length: m }, () => [])
	for (const entry of entries) {
		const key = keyOf(entry)
		if (strategy === 'chaining') {
			const chain = buckets[hashOf(key, m).index]
			if (!chain.some((e) => keyOf(e) === key)) chain.push(entry)
			continue
		}
		const p = probe(buckets, key)
		const at = p.end === 'found' ? undefined : (p.tomb ?? p.at)
		if (at !== undefined) buckets[at] = [entry]
	}
	return buckets
}

/** A bucket count with room for n keys at a comfortable load (about 0.7). */
export const bucketsFor = (n: number) => Math.min(MAX_BUCKETS, nextPrime(Math.max(5, Math.ceil(n / 0.7))))

/**
 * Scene keys of entries that aren't where the table would look for them (typed in by hand, say):
 * a chained key in a bucket that isn't its hash; a probed key with an empty slot between its hash
 * and its slot, so a find would stop before reaching it.
 */
export function misplaced(buckets: readonly (readonly string[])[], strategy: HashStrategy): string[] {
	const m = buckets.length
	if (strategy === 'chaining') {
		const keys = chainNodeKeys(buckets)
		return buckets.flatMap((chain, b) => chain.flatMap((entry, j) => (hashOf(keyOf(entry), m).index === b ? [] : [keys[b][j]])))
	}
	return buckets.flatMap((slot, j) => {
		const entry = slot[0]
		if (entry === undefined || isTombstone(entry)) return []
		for (let i = hashOf(keyOf(entry), m).index; i !== j; i = (i + 1) % m) if (buckets[i][0] === undefined) return [slotKey(j)]
		return []
	})
}

/** How full the table is: n keys over m buckets. */
export function loadLine(n: number, m: number) {
	const load = n / m
	const note = load > 0.75 ? ': getting full, time to grow and rehash' : ''
	return `n = ${n}, m = ${m}: load factor ${load.toFixed(2)}${note}`
}

const LOOK: MarkColor = 'orange'
const FOUND: MarkColor = 'green'
const GONE: MarkColor = 'red'

export interface HashOperation {
	frames: Frame[]
	/** The table afterwards, if the operation changes it. */
	buckets?: string[][]
	finalFlash?: Record<string, MarkColor>
}

const at = (i: number): Pointer[] => [{ id: '#i', name: 'i', at: slotKey(i) }]

/**
 * Look for `key`, as insert, find and delete all start: hash it, then walk its bucket's chain, or
 * probe slot after slot. Returns the frames and where the walk ended.
 */
function walk(buckets: string[][], strategy: HashStrategy, key: string, verb: string) {
	const m = buckets.length
	const { index: b, how } = hashOf(key, m)
	const frames: Frame[] = []
	const hashed = `${verb} ${key}: h(${key}) = ${how}`
	// Predict mode: the class works out the hash first.
	const where = `${verb} ${key}: with m = ${m}, which ${strategy === 'chaining' ? 'bucket' : 'slot'} does h(${key}) give?`
	if (strategy === 'chaining') {
		const chain = buckets[b]
		const keys = chainNodeKeys(buckets)[b]
		if (!chain.length) {
			frames.push({ flash: { [bucketKey(b)]: LOOK }, counts: { compared: 0 }, caption: `${hashed}: bucket ${b}, which is empty`, ask: where })
			return { frames, b, found: undefined as number | undefined, compared: 0 }
		}
		frames.push({ flash: { [bucketKey(b)]: LOOK }, counts: { compared: 0 }, caption: `${hashed}: walk bucket ${b}'s chain`, ask: where })
		for (const [j, entry] of chain.entries()) {
			const same = keyOf(entry) === key
			frames.push({
				flash: { [j ? keys[j - 1] : bucketKey(b)]: null, [keys[j]]: same ? FOUND : LOOK },
				counts: { compared: j + 1 },
				caption: same ? `${keyOf(entry)} = ${key}: found it` : `${keyOf(entry)} ≠ ${key}${j + 1 < chain.length ? ': on along the chain' : ': the end of the chain'}`,
			})
			if (same) return { frames, b, found: j, compared: j + 1 }
		}
		return { frames, b, found: undefined, compared: chain.length }
	}
	const p = probe(buckets, key)
	let previous: string | undefined
	for (const [k, i] of p.path.entries()) {
		const entry = buckets[i][0]
		const step = k === 0 ? `${hashed}: slot ${i}` : `try slot ${i}${i === 0 && k > 0 ? ' (round to the start)' : ''}`
		const what =
			entry === undefined
				? `empty`
				: isTombstone(entry)
					? `a deleted marker: ${key} may be further on, keep looking`
					: keyOf(entry) === key
						? `${key}: found it`
						: `${keyOf(entry)}: taken, try the next`
		frames.push({
			pointers: at(i),
			flash: { ...(previous ? { [previous]: null } : {}), [slotKey(i)]: entry !== undefined && keyOf(entry) === key ? FOUND : LOOK },
			counts: { probes: k + 1 },
			caption: `${step}: ${what}`,
			ask: k === 0 ? where : `Slot ${p.path[k - 1]} didn't settle it: which slot next?`,
		})
		previous = slotKey(i)
	}
	return { frames, b, probe: p, found: p.end === 'found' ? p.at : undefined, compared: p.path.length }
}

/** Insert `entry` (a key, or key:value): where its hash sends it, unless the key is already there. */
export function insertEntry(buckets: string[][], strategy: HashStrategy, entry: string): HashOperation {
	const key = keyOf(entry)
	const w = walk(buckets, strategy, key, 'Insert')
	const { frames } = w
	const n = entriesOf(buckets).length
	if (w.found !== undefined) {
		frames.push({ caption: `${key} is in the table already: it keeps one copy of each key` })
		return { frames }
	}
	const after = buckets.map((bucket) => [...bucket])
	if (strategy === 'chaining') {
		after[w.b].push(entry)
		const node = chainNodeKeys(after)[w.b].at(-1)!
		frames.push({
			props: { buckets: after },
			flash: { [node]: FOUND },
			caption: `${buckets[w.b].length ? 'Add it at the end of the chain' : `It starts bucket ${w.b}'s chain`}. ${loadLine(n + 1, after.length)}`,
			ask: `${key} isn't in bucket ${w.b}: where does it go?`,
			askFocus: [bucketKey(w.b)],
		})
		return { frames, buckets: after, finalFlash: { [node]: FOUND } }
	}
	const p = w.probe!
	if (p.end === 'full' && p.tomb === undefined) {
		frames.push({ caption: `Every slot is taken: the table is full. Grow and rehash first` })
		return { frames }
	}
	const slot = p.tomb ?? p.at!
	after[slot] = [entry]
	frames.push({
		props: { buckets: after },
		pointers: at(slot),
		flash: { [slotKey(slot)]: FOUND },
		caption: `${p.tomb !== undefined && p.end !== 'found' ? `${key} isn't further on, so reuse the deleted slot ${slot}` : `Put ${key} in slot ${slot}`}. ${loadLine(n + 1, after.length)}`,
	})
	return { frames, buckets: after, finalFlash: { [slotKey(slot)]: FOUND } }
}

/** Find `key`: hash, then walk the chain or probe until it turns up, or a chain ends or a slot is empty. */
export function findKey(buckets: string[][], strategy: HashStrategy, key: string): HashOperation {
	const w = walk(buckets, strategy, key, 'Find')
	const { frames } = w
	if (w.found !== undefined) {
		const node = strategy === 'chaining' ? chainNodeKeys(buckets)[w.b][w.found] : slotKey(w.found)
		frames.push({ flash: { [node]: FOUND }, caption: `${key} found after ${w.compared} comparison${w.compared === 1 ? '' : 's'}` })
		return { frames, finalFlash: { [node]: FOUND } }
	}
	frames.push({
		caption:
			strategy === 'chaining'
				? `${key} is not in the table: not in bucket ${w.b}'s chain, the only place it could be`
				: w.probe!.end === 'empty'
					? `An empty slot: ${key} would have gone here, so it isn't in the table`
					: `Round every slot: ${key} is not in the table`,
	})
	return { frames }
}

/**
 * Delete `key`. Chaining unlinks it from its chain. Probing can't just empty its slot: a key that
 * collided and went further on would be cut off from its hash, so the slot gets a deleted marker.
 */
export function deleteKey(buckets: string[][], strategy: HashStrategy, key: string): HashOperation {
	const w = walk(buckets, strategy, key, 'Delete')
	const { frames } = w
	if (w.found === undefined) {
		frames.push({ caption: `${key} is not in the table: nothing to delete` })
		return { frames }
	}
	const after = buckets.map((bucket) => [...bucket])
	const n = entriesOf(buckets).length
	if (strategy === 'chaining') {
		const node = chainNodeKeys(buckets)[w.b][w.found]
		frames.push({ flash: { [node]: GONE }, caption: `Unlink ${key}: whatever pointed at it (the bucket, or the key before) now points past it` })
		after[w.b].splice(w.found, 1)
		frames.push({ props: { buckets: after }, caption: `${key} is gone. ${loadLine(n - 1, after.length)}` })
		return { frames, buckets: after }
	}
	after[w.found] = [TOMBSTONE]
	frames.push({
		props: { buckets: after },
		pointers: at(w.found),
		flash: { [slotKey(w.found)]: GONE },
		caption: `Mark slot ${w.found} deleted, not empty: a key that collided and went further on must still be found past it`,
	})
	return { frames, buckets: after }
}

/**
 * Grow: a new table of about twice the buckets (a prime), and every key moves, one at a time, to
 * where the new hash puts it: h depends on m, so its old place means nothing in the new table.
 */
export function rehash(buckets: string[][], strategy: HashStrategy): HashOperation {
	const entries = entriesOf(buckets)
	const m = Math.min(MAX_BUCKETS, nextPrime(buckets.length * 2 + 1))
	let table: string[][] = Array.from({ length: m }, () => [])
	const left = [...entries]
	const strips = (): Strip[] => [{ title: 'keys to move', items: left.map(keyOf) }]
	const frames: Frame[] = [
		{ props: { buckets: table }, strips: strips(), caption: `A new table of ${m} buckets. Every key must move: h(key) depends on m` },
	]
	for (const entry of entries) {
		left.shift()
		const key = keyOf(entry)
		table = buildTable([...entriesOf(table), entry], m, strategy)
		const node =
			strategy === 'chaining'
				? chainNodeKeys(table)[hashOf(key, m).index].at(-1)!
				: slotKey(table.findIndex((slot) => slot[0] === entry))
		const where = strategy === 'probing' && node !== slotKey(hashOf(key, m).index) ? `, taken, so slot ${node.slice(1)}` : ''
		frames.push({ props: { buckets: table }, strips: strips(), flash: { [node]: FOUND }, caption: `h(${key}) = ${hashOf(key, m).how}${where}` })
	}
	frames.push({ props: { buckets: table }, strips: strips(), caption: `All ${entries.length} keys moved. ${loadLine(entries.length, m)}` })
	return { frames, buckets: table }
}
