import type { NodeField, TestValues } from '../shapes/code/tests'
import type { Frame } from './playback'
import type { Scene, SceneNode } from './scene'

// What a test in the code beside a node-link structure reads at a step, from the step's scene: names
// refer to nodes (a pointer at a node, a label such as head or tail at the node its arrow points to;
// at a null marker, null), and a node's fields are its value and the arrows out of it: a list node's
// next and prev, a tree node's left and right child (whichever side of it the child is drawn). A tree's
// steps name nodes by value (curr = 40): a value held by one node only is that node.

/** The fields a node's value goes by in the code (a list's value, a BST's or a hash chain's key). */
const VALUE_FIELDS = new Set(['value', 'key', 'val', 'data', 'item'])

const NAME = /^[A-Za-z_]\w*$/

/** `children`: a tree's nodes have left and right. */
export function sceneTestValues(scene: Scene, frame: Frame, { children = false }: { children?: boolean } = {}): TestValues {
	const byKey = new Map(scene.nodes.map((n) => [n.key, n]))
	// The node a key names: null for a null marker, undefined if nothing drawn has it.
	const node = (key: string | undefined): string | null | undefined => {
		const n = key === undefined ? undefined : byKey.get(key)
		return n === undefined ? undefined : n.kind === 'null' ? null : n.key
	}
	const refs: Record<string, string | null> = {}
	for (const label of scene.nodes) {
		if (label.kind !== 'label' || !NAME.test(label.value)) continue
		const to = node(scene.edges.find((e) => e.from === label.key)?.to)
		if (to !== undefined) refs[label.value] = to
	}
	for (const p of frame.pointers ?? []) {
		const to = node(p.at)
		if (to !== undefined) refs[p.name] = to
	}
	const data = scene.nodes.filter((n) => n.kind !== 'label' && n.kind !== 'null')
	const field = (key: string, name: string): NodeField | undefined => {
		const n = byKey.get(key)
		if (!n) return undefined
		if (VALUE_FIELDS.has(name)) return { value: n.value }
		const out = scene.edges.filter((e) => e.from === key)
		if (n.kind === 'list-node' && (name === 'next' || (name === 'prev' && n.pointer?.back))) {
			const arrow = out.find((e) => e.fromPointer === (name === 'next' ? true : 'prev'))
			// Not linked in yet: its pointer is still null.
			return { ref: arrow ? (node(arrow.to) ?? null) : null }
		}
		if (children && (name === 'left' || name === 'right')) {
			const kids = out.map((e) => byKey.get(e.to)).filter((c): c is SceneNode => !!c)
			const kid = kids.find((c) => (name === 'left' ? c.x < n.x : c.x > n.x))
			return { ref: kid ? node(kid.key) ?? null : null }
		}
		return undefined
	}
	// A node by its value, and where it is when another node holds the same (two 9s in a list: 9@1, 9@2).
	const nodeName = (key: string) => {
		const n = byKey.get(key)
		if (!n) return key
		return data.filter((d) => d.value === n.value).length > 1 ? `${n.value}@${data.indexOf(n)}` : n.value
	}
	// A variable naming a node by its value (a tree's steps): the one node holding it.
	const resolve = (value: string) => {
		const holding = data.filter((d) => d.value === value)
		return holding.length === 1 ? holding[0].key : undefined
	}
	return { vars: { ...frame.vars }, arrays: {}, refs, field, nodeName, resolve }
}

/** A test over arrays (an array's own, a heap's, union-find's parent[]): the step's pointers at indexes and its variables. */
export function indexTestValues(frame: Frame, arrays: Record<string, readonly string[]>): TestValues {
	const at = (frame.pointers ?? []).filter((p) => /^-?\d+$/.test(p.at)).map((p) => [p.name, p.at])
	return { vars: { ...Object.fromEntries(at), ...frame.vars }, arrays }
}

/**
 * A graph's test reads vertices by their labels (unique, so a label says which vertex): its pointers'
 * and variables' vertices, and the arrays its strips show by vertex (visited[], parent[]).
 */
export function graphTestValues(scene: Scene, frame: Frame): TestValues {
	const label = new Map(scene.nodes.map((n) => [n.key, n.value]))
	const vars: Record<string, string> = {}
	for (const p of frame.pointers ?? []) {
		const at = label.get(p.at)
		if (at !== undefined) vars[p.name] = at
	}
	const arrays: Record<string, readonly string[]> = {}
	const labels: Record<string, readonly string[]> = {}
	for (const strip of frame.strips ?? []) {
		const name = /^(\w+)\[\]$/.exec(strip.title)?.[1]
		if (!name || !strip.labels) continue
		arrays[name] = strip.items
		labels[name] = strip.labels
	}
	return { vars: { ...vars, ...frame.vars }, arrays, labels }
}
