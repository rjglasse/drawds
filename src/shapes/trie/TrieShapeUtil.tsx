import type { TLShapePartial, VecLike } from 'tldraw'
import { pruneMarks, type Marks } from '../../cells/marks'
import { toggleTranscript, transcriptsOf } from '../../transcript/transcript'
import type { PointerDirection } from '../../cells/CellShapeUtil'
import { NodeLinkShapeUtil, type NodeOperation } from '../../nodelink/NodeLinkShapeUtil'
import { playOperation, type Frame } from '../../nodelink/playback'
import { prunePointers } from '../../pointers/pointers'
import { nodeContains } from '../../nodelink/geometry'
import { generalTreeMarkKeys } from '../general-tree/layout'
import { parentOf } from '../tree/model'
import type { TreeNode } from '../tree/tree-shape-types'
import { trieBasePosition, trieScene } from './layout'
import { deleteSteps, insertSteps, prefixOf, prefixSteps, ROOT, searchSteps, trieId, trieWord } from './trie'
import { TRIE_SHAPE_TYPE, trieShapeMigrations, trieShapeProps, type TrieShape } from './trie-shape-types'

/**
 * A trie (a prefix tree): words spelled along its edges, a letter each, from the root; a node where a
 * word ends shows it. Words go in and out step by step, with their code: insert, contains, the words
 * starting with a prefix (in alphabetical order, as a pre-order walk finds them), delete.
 */
export class TrieShapeUtil extends NodeLinkShapeUtil<TrieShape> {
	static override type = TRIE_SHAPE_TYPE
	static override props = trieShapeProps
	static override migrations = trieShapeMigrations

	/** A word's path, say: point at an edge and press 1-4. */
	override readonly markableEdges = true

	getDefaultProps(): TrieShape['props'] {
		return {
			nodes: [{ id: ROOT, value: '', children: [], dx: 0, dy: 0 }],
			seed: 0,
			marks: {},
			pointers: [],
			color: 'black',
			size: 'm',
			font: 'mono',
		}
	}

	buildScene(shape: TrieShape) {
		return trieScene(shape.props)
	}

	/** Any node (none can be typed into) or else the edge passing near: for marks and the node's menu. */
	override markKeyAt(shape: TrieShape, point: VecLike) {
		return this.getScene(shape).nodes.find((n) => n.kind === 'circle' && nodeContains(n, point))?.key ?? super.markKeyAt(shape, point)
	}

	/** A node's word isn't typed: words go in and out by insert and delete. */
	setNodeValue(shape: TrieShape): TLShapePartial<TrieShape> {
		return { id: shape.id, type: TRIE_SHAPE_TYPE }
	}

	moveNode(shape: TrieShape, key: string, to: VecLike): TLShapePartial<TrieShape> {
		const base = trieBasePosition(shape.props, key)
		if (!base) return { id: shape.id, type: TRIE_SHAPE_TYPE }
		return this.update(
			shape,
			shape.props.nodes.map((n) => (n.id === key ? { ...n, dx: to.x - base.x, dy: to.y - base.y } : n))
		)
	}

	resetLayout(shape: TrieShape) {
		return this.update(shape, shape.props.nodes.map((n) => ({ ...n, dx: 0, dy: 0 })))
	}

	hasManualLayout(shape: TrieShape) {
		return shape.props.nodes.some((n) => n.dx !== 0 || n.dy !== 0)
	}

	// Live edits: the + above the root inserts a word, x on a node where a word ends deletes it, both
	// step by step. The root stays put on the page.

	getInsertPrompt(shape: TrieShape) {
		const root = this.getScene(shape).nodes.find((n) => n.key === ROOT)
		return root && { at: { x: root.x, y: root.y - root.h / 2 - 24 }, label: 'Insert a word' }
	}

	insertKey(shape: TrieShape, key: string, keep: boolean) {
		this.insert(shape.id, key, keep)
	}

	canRemoveNode(shape: TrieShape, key: string) {
		return !!shape.props.nodes.find((n) => n.id === key)?.value
	}

	removeNodeAnimated(shape: TrieShape, key: string, keep: boolean) {
		const word = shape.props.nodes.find((n) => n.id === key)?.value
		if (!word) return false
		this.delete(shape.id, word, keep)
		return true
	}

	// Pointers (root, node...) sit above nodes. Arrow keys follow the trie: Up to the parent, Down to
	// the first child, Left / Right to the sibling before or after.

	override pointerStep(shape: TrieShape, key: string, direction: PointerDirection): string | undefined {
		const { nodes } = shape.props
		if (direction === 'up') return parentOf(nodes, key)?.id
		if (direction === 'down') return nodes.find((n) => n.id === key)?.children.find(Boolean) ?? undefined
		const siblings = parentOf(nodes, key)?.children.filter(Boolean) ?? []
		const i = siblings.indexOf(key)
		return i < 0 ? undefined : (siblings[i + (direction === 'left' ? -1 : 1)] ?? undefined)
	}

	pointerNames() {
		return ['root', 'node', 'curr']
	}

	nodeOperations(shape: TrieShape, key: string): NodeOperation[] {
		const node = shape.props.nodes.find((n) => n.id === key)
		if (!node) return []
		const prefix = prefixOf(key)
		return [
			...(node.value
				? [
						{ id: 'trie-search-this', label: `Is "${node.value}" in it? (contains)`, group: 'search', run: () => this.search(shape.id, node.value) },
						{ id: 'trie-delete-this', label: `Delete "${node.value}"`, group: 'edit', run: () => this.delete(shape.id, node.value, false) },
					]
				: []),
			...(prefix ? [{ id: 'trie-prefix-this', label: `Words starting "${prefix}"`, group: 'search', run: () => this.prefix(shape.id, prefix) }] : []),
		]
	}

	override shapeOperations(shape: TrieShape): NodeOperation[] {
		const at = { promptAt: ROOT }
		return [
			{ ...at, id: 'trie-insert', label: 'Insert a word', group: 'edit', prompt: 'Word to insert', run: (w?: string) => w !== undefined && this.insert(shape.id, w, false) },
			{ ...at, id: 'trie-delete', label: 'Delete a word', group: 'edit', prompt: 'Word to delete', run: (w?: string) => w !== undefined && this.delete(shape.id, w, false) },
			{ ...at, id: 'trie-search', label: 'Is a word in it? (contains)', group: 'search', prompt: 'Word to look for', run: (w?: string) => w !== undefined && this.search(shape.id, w) },
			{ ...at, id: 'trie-prefix', label: 'Words starting with a prefix', group: 'search', prompt: 'Prefix', run: (w?: string) => w !== undefined && this.prefix(shape.id, w) },
			{ id: 'trie-all-words', label: 'All its words, in order', group: 'search', run: () => this.prefix(shape.id, '') },
			// Every word put in or taken out, as code.
			{
				section: 'show',
				id: 'trie-code-beside',
				label: transcriptsOf(this.editor, shape.id).length ? 'Hide the code beside it' : 'Code beside it: every move as code',
				run: () => toggleTranscript(this.editor, shape),
			},
		]
	}

	override menuName() {
		return 'Trie'
	}

	override readonly menuId = 'trie'

	override moves() {
		return [
			'The + above the root inserts a word, step by step (letters a to z)',
			'Hover a node where a word ends: x deletes the word, pruning the nodes only it needed',
			'Right-click a node: is its word in it, the words starting with its prefix',
			'Drag the dot under a node to move it',
		]
	}

	/** A word as typed, or a step saying why it can't go in a trie. */
	private wordOr(id: TrieShape['id'], input: string, label: string): string | undefined {
		const word = trieWord(input)
		if (word) return word
		playOperation(this.editor, {
			shapeId: id,
			label,
			frames: [{ caption: `"${input.trim()}": a trie's words here are letters a to z`, ask: false }],
		})
		return undefined
	}

	private insert(id: TrieShape['id'], input: string, keep: boolean) {
		const shape = this.editor.getShape(id) as TrieShape | undefined
		const word = shape && this.wordOr(id, input, 'insert')
		if (!shape || !word) return
		const { frames, nodes } = insertSteps(shape.props.nodes, word)
		this.play(shape, 'insert word', frames, keep, nodes, 'trie-insert', { [trieId(word)]: 'green' }, word)
	}

	private delete(id: TrieShape['id'], input: string, keep: boolean) {
		const shape = this.editor.getShape(id) as TrieShape | undefined
		const word = shape && this.wordOr(id, input, 'delete')
		if (!shape || !word) return
		const { frames, nodes } = deleteSteps(shape.props.nodes, word)
		this.play(shape, 'delete word', frames, keep, nodes, 'trie-delete', {}, word)
	}

	private search(id: TrieShape['id'], input: string) {
		const shape = this.editor.getShape(id) as TrieShape | undefined
		const word = shape && this.wordOr(id, input, 'search')
		if (!shape || !word) return
		const { frames, found } = searchSteps(shape.props.nodes, word)
		this.play(shape, 'search', frames, false, undefined, 'trie-contains', found ? { [trieId(word)]: 'green' } : {})
	}

	private prefix(id: TrieShape['id'], input: string) {
		const shape = this.editor.getShape(id) as TrieShape | undefined
		const prefix = input.trim() === '' ? '' : shape && this.wordOr(id, input, 'words starting')
		if (!shape || prefix === undefined) return
		const { frames } = prefixSteps(shape.props.nodes, prefix)
		this.play(shape, prefix ? 'words starting' : 'all words', frames, false, undefined, 'trie-prefix', {})
	}

	private play(shape: TrieShape, label: string, frames: Frame[], keep: boolean, nodes: TreeNode[] | undefined, code: string, flash: Marks, word?: string) {
		const final = nodes && this.withNodes(shape, nodes)
		playOperation(this.editor, {
			shapeId: shape.id,
			label,
			frames,
			final,
			code,
			// The code beside it logs the call with its word (a word already in, or not there, changes nothing).
			...(word !== undefined ? { args: { word } } : {}),
			finalFlash: flash,
			keep,
			// Shift held: the highlights become marks, in the same undo step as the result.
			withMarks: (_update, highlights) => {
				const after = nodes ?? shape.props.nodes
				const marks = pruneMarks({ ...(final?.props?.marks ?? shape.props.marks), ...highlights }, generalTreeMarkKeys(after))
				return final ? { ...final, props: { ...final.props, marks } } : this.withMarks(shape, marks)
			},
		})
	}

	/** New nodes: marks and pointers on nodes that went go with them, and marks on the edges to them. */
	private withNodes(shape: TrieShape, nodes: TreeNode[]): TLShapePartial<TrieShape> {
		const marks = pruneMarks(shape.props.marks, generalTreeMarkKeys(nodes))
		const pointers = prunePointers(
			shape.props.pointers,
			nodes.map((n) => n.id)
		)
		return { id: shape.id, type: TRIE_SHAPE_TYPE, props: { nodes, marks, pointers } }
	}

	private update(shape: TrieShape, nodes: TreeNode[]): TLShapePartial<TrieShape> {
		return { id: shape.id, type: TRIE_SHAPE_TYPE, props: { nodes } }
	}
}
