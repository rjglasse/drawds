import type { TLShapePartial, VecLike } from 'tldraw'
import { pruneMarks } from '../../cells/marks'
import { fillValues } from '../../data/fill'
import type { Refillable } from '../../data/fill-style'
import { newSeed } from '../../data/random'
import { NodeLinkShapeUtil, type NodeOperation } from '../../nodelink/NodeLinkShapeUtil'
import { playOperation } from '../../nodelink/playback'
import type { SceneNode } from '../../nodelink/scene'
import type { PointerSide } from '../../pointers/layout'
import {
	buildTable,
	bucketsFor,
	chainNodeKeys,
	deleteKey,
	entriesOf,
	findKey,
	insertEntry,
	isTombstone,
	keyOf,
	misplaced,
	rehash,
	slotKey,
	type HashOperation,
	type HashScheme,
} from './hash'
import { HASH_SHAPE_TYPE, MAX_BUCKETS, hashShapeMigrations, hashShapeProps, type HashShape } from './hash-shape-types'
import { LOAD_KEY, hashScene } from './layout'

/**
 * A hash table: keys hashed into buckets, collisions handled by chaining (a linked list per
 * bucket) or linear probing (the next free slot). Insert, find, delete and grow-and-rehash play
 * step by step, each hash worked out in the caption; keys typed into the wrong place get the red
 * ring, as a BST's out-of-order keys do.
 */
export class HashShapeUtil extends NodeLinkShapeUtil<HashShape> implements Refillable {
	static override type = HASH_SHAPE_TYPE
	static override props = hashShapeProps
	static override migrations = hashShapeMigrations

	getDefaultProps(): HashShape['props'] {
		return {
			buckets: buildTable([], 7, 'chaining'),
			strategy: 'chaining',
			code: 'sum',
			compress: 'mod',
			invariant: 'check',
			fill: 'random',
			range: 'medium',
			seed: 0,
			marks: {},
			pointers: [],
			color: 'black',
			size: 'm',
			font: 'mono',
		}
	}

	buildScene(shape: HashShape) {
		return hashScene(shape.props)
	}

	/** Where an entry is: its bucket and place in the chain (chaining), or its slot (probing). */
	private locate(shape: HashShape, key: string): { bucket: number; index: number } | undefined {
		const { buckets, strategy } = shape.props
		if (strategy === 'probing') {
			const m = /^s(\d+)$/.exec(key)
			return m && Number(m[1]) < buckets.length ? { bucket: Number(m[1]), index: 0 } : undefined
		}
		const keys = chainNodeKeys(buckets)
		for (const [bucket, chain] of keys.entries()) {
			const index = chain.indexOf(key)
			if (index >= 0) return { bucket, index }
		}
		return undefined
	}

	private entryAt(shape: HashShape, key: string) {
		const at = this.locate(shape, key)
		const entry = at && shape.props.buckets[at.bucket][at.index]
		return entry === undefined || isTombstone(entry) ? undefined : entry
	}

	/** Typing over a key changes it where it is (the ring shows if it now belongs elsewhere); clearing it removes it. */
	setNodeValue(shape: HashShape, key: string, value: string) {
		const at = this.locate(shape, key)
		if (!at) return this.update(shape, {})
		const buckets = shape.props.buckets.map((bucket, i) => {
			if (i !== at.bucket) return bucket
			if (shape.props.strategy === 'probing') return value.trim() ? [value] : []
			return value.trim() ? bucket.map((e, j) => (j === at.index ? value : e)) : bucket.filter((_, j) => j !== at.index)
		})
		return this.update(shape, { buckets })
	}

	// Keys sit where the table puts them: nothing to drag.

	moveNode(shape: HashShape, _key: string, _to: VecLike) {
		return this.update(shape, {})
	}

	resetLayout(shape: HashShape) {
		return this.update(shape, {})
	}

	hasManualLayout() {
		return false
	}

	override sceneWarnings(shape: HashShape) {
		const { invariant, buckets } = shape.props
		return invariant === 'check' ? misplaced(buckets, shape.props) : []
	}

	/** A probing step's i points at its slot from the right (the indices are on the left). */
	override pointerSide(_shape: HashShape, _node: SceneNode): PointerSide {
		return 'right'
	}

	refill(shape: HashShape): TLShapePartial<HashShape> {
		const { fill, seed, range, buckets } = shape.props
		const n = entriesOf(buckets).length || Math.round(buckets.length * 0.6)
		return this.update(shape, { buckets: buildTable(fillValues(fill, seed, n, { range }), buckets.length, shape.props) })
	}

	// Insert from the + under the table; delete from a key's x; find, rehash from the menus.

	getInsertPrompt(shape: HashShape) {
		const load = this.getScene(shape).nodes.find((n) => n.key === LOAD_KEY)
		return load && { at: { x: load.x + load.w / 2 + 24, y: load.y }, label: 'Insert a key' }
	}

	insertKey(shape: HashShape, value: string, keep: boolean) {
		if (!value.trim()) return
		this.play(shape, 'insert', insertEntry(shape.props.buckets, shape.props, value.trim()), keep)
	}

	canRemoveNode(shape: HashShape, key: string) {
		return this.entryAt(shape, key) !== undefined
	}

	removeNodeAnimated(shape: HashShape, key: string, keep: boolean) {
		const entry = this.entryAt(shape, key)
		if (entry === undefined) return true
		this.play(shape, 'delete', deleteKey(shape.props.buckets, shape.props, keyOf(entry)), keep)
		return true
	}

	override nodeOperations(shape: HashShape, key: string): NodeOperation[] {
		const entry = this.entryAt(shape, key)
		if (entry === undefined) return []
		const steps = { group: 'key' }
		const k = keyOf(entry)
		return [
			{ ...steps, id: 'hash-find', label: `Find ${k}`, run: () => this.run(shape.id, 'find', (s) => findKey(s.props.buckets, s.props, k)) },
			{ ...steps, id: 'hash-delete', label: `Delete ${k}`, run: () => this.run(shape.id, 'delete', (s) => deleteKey(s.props.buckets, s.props, k)) },
		]
	}

	override shapeOperations(shape: HashShape): NodeOperation[] {
		const table = { group: 'table' }
		const id = shape.id
		return [
			{
				...table,
				id: 'hash-find-key',
				label: 'Find a key',
				prompt: 'Key to find',
				promptAt: shape.props.strategy === 'probing' ? slotKey(0) : undefined,
				run: (value?: string) => value?.trim() && this.run(id, 'find', (s) => findKey(s.props.buckets, s.props, value.trim())),
			},
			// Direct addressing has nothing to rehash: the key is the index whatever the size.
			...(shape.props.buckets.length < MAX_BUCKETS && shape.props.code !== 'direct'
				? [{ ...table, id: 'hash-rehash', label: 'Grow and rehash', run: () => this.run(id, 'rehash', (s) => rehash(s.props.buckets, s.props)) }]
				: []),
			{ section: 'actions', id: 'hash-reroll', label: 'New keys', run: () => this.reroll(id) },
		]
	}

	override menuName() {
		return 'Hash table'
	}

	override readonly menuId = 'hash'

	override moves() {
		return [
			'The + by the load factor inserts a key; x on a key deletes it, step by step',
			'Grow and rehash, and find a key, from the right-click menu',
			'Style panel: Collisions (separate chaining or linear probing), the hash code (character codes added, three letters with A = 1, Java\'s hashCode, or direct addressing) and the compression (mod m or MAD)',
			'A red ring marks a key a find would miss',
		]
	}

	/**
	 * The same keys put in again with another collision strategy, hash code or compression (probing
	 * needs a slot for every key; direct addressing a slot for the largest key, as far as the table
	 * can grow: keys it can't place stay out).
	 */
	withScheme(shape: HashShape, change: Partial<HashScheme>): TLShapePartial<HashShape> {
		const scheme = { strategy: shape.props.strategy, code: shape.props.code, compress: shape.props.compress, ...change }
		const entries = entriesOf(shape.props.buckets)
		const size = shape.props.buckets.length
		const largest = Math.max(-1, ...entries.map(keyOf).filter((k) => /^\d+$/.test(k)).map(Number))
		const m =
			scheme.code === 'direct'
				? Math.min(MAX_BUCKETS, Math.max(size, largest + 1))
				: scheme.strategy === 'probing' && entries.length >= size
					? bucketsFor(entries.length)
					: size
		return this.update(shape, { ...scheme, buckets: buildTable(entries, m, scheme), marks: {} })
	}

	private run(id: HashShape['id'], label: string, op: (shape: HashShape) => HashOperation) {
		const shape = this.editor.getShape(id) as HashShape | undefined
		if (shape) this.play(shape, label, op(shape), false)
	}

	private play(shape: HashShape, label: string, { frames, buckets, finalFlash }: HashOperation, keep: boolean) {
		const after = buckets ?? shape.props.buckets
		const keys = hashScene({ ...shape.props, buckets: after }).nodes.map((n) => n.key)
		const final = buckets && this.update(shape, { buckets, marks: pruneMarks(shape.props.marks, keys) })
		playOperation(this.editor, {
			shapeId: shape.id,
			label,
			frames,
			final,
			finalFlash,
			keep,
			// Shift: the highlights become marks, on what is still there.
			withMarks: (_update, highlights) =>
				this.update(shape, { ...(buckets ? { buckets } : {}), marks: pruneMarks({ ...shape.props.marks, ...highlights }, keys) }),
		})
	}

	private reroll(id: HashShape['id']) {
		const shape = this.editor.getShape(id) as HashShape | undefined
		if (!shape) return
		const seed = newSeed()
		const refilled = this.refill({ ...shape, props: { ...shape.props, seed } })
		this.editor.markHistoryStoppingPoint('new keys')
		this.editor.updateShape(this.update(shape, { ...refilled.props, seed }))
	}

	private update(shape: HashShape, props: Partial<HashShape['props']>): TLShapePartial<HashShape> {
		return { id: shape.id, type: HASH_SHAPE_TYPE, props }
	}
}
