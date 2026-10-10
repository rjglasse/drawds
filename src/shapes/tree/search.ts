import { compareKeys } from '../../data/compare'
import type { Frame } from '../../nodelink/playback'
import type { Pointer } from '../../pointers/pointers'
import type { MarkColor } from '../../cells/marks'
import { bstDelete, bstInsert } from './bst'
import { nullKey } from './layout'
import type { TreeNode } from './tree-shape-types'

/** Ids of the subtree under `id` (itself included), with the null markers of its empty slots. */
function subtree(index: ReadonlyMap<string, TreeNode>, id: string): string[] {
	const node = index.get(id)
	if (!node) return []
	return [
		id,
		...node.children.flatMap((child, slot) => (child && index.has(child) ? subtree(index, child) : [nullKey(id, slot)])),
	]
}

/**
 * Search a BST for `key`: curr walks down from the root comparing, and each comparison rules out
 * one subtree (faded), as binary search rules out half an array, until curr finds the key or
 * falls off at an empty slot (its null marker, when nulls are shown).
 */
export function bstSearch(nodes: readonly TreeNode[], key: string, { nulls = false } = {}): { frames: Frame[]; found?: string } {
	const index = new Map(nodes.map((n) => [n.id, n]))
	const frames: Frame[] = []
	const curr = (at: string): Pointer[] => [{ id: '#curr', name: 'curr', at }]
	const dim: string[] = []
	let node = nodes[0]
	let comparisons = 1
	let how = `curr = root (${node.value})`
	let prev: string | undefined
	// Predict mode: after the start, every step answers the same question about the node curr is on.
	let ask: Pick<Frame, 'ask' | 'askFocus'> = { ask: `Search for ${key}: where does curr start?` }
	// The code's line for curr's last move: from the root, or down a side.
	let line = 'start'
	for (;;) {
		frames.push({
			pointers: curr(node.id),
			flash: { [node.id]: 'orange', ...(prev ? { [prev]: null } : {}) },
			dim: [...dim],
			counts: { comparisons },
			caption: `${how}. Is it ${key}?`,
			line,
			vars: { key, curr: node.value },
			...ask,
		})
		ask = { ask: `${key} vs ${node.value}: what next?`, askFocus: [node.id] }
		const cmp = compareKeys(key, node.value)
		if (cmp === 0) {
			frames.push({
				pointers: curr(node.id),
				flash: { [node.id]: 'green' },
				caption: `Yes: found ${key}, after ${comparisons} comparison${comparisons === 1 ? '' : 's'}`,
				line: 'found',
				vars: { key, curr: node.value },
				...ask,
			})
			return { frames, found: node.id }
		}
		const slot = cmp < 0 ? 0 : 1
		const [sign, side, otherSide] = slot === 0 ? ['<', 'left', 'right'] : ['>', 'right', 'left']
		const other = node.children[1 - slot]
		dim.push(...(other && index.has(other) ? subtree(index, other) : [nullKey(node.id, 1 - slot)]))
		const next = node.children[slot]
		if (!next || !index.has(next)) {
			frames.push({
				pointers: nulls ? curr(nullKey(node.id, slot)) : [],
				flash: { [node.id]: null },
				dim: [...subtree(index, nodes[0].id)],
				caption: `${key} ${sign} ${node.value}, but ${node.value} has no ${side} child: curr = null, so ${key} is not in the tree`,
				line: 'missing',
				vars: { key, curr: 'null' },
				...ask,
			})
			return { frames }
		}
		how = `${key} ${sign} ${node.value}, so it can't be on the ${otherSide}: curr = curr.${side} (${index.get(next)!.value})`
		line = side
		prev = node.id
		node = index.get(next)!
		comparisons++
	}
}

/**
 * Lecture 8b: the minimum (maximum) of a BST is as far left (right) as the tree goes: from `start`,
 * node = node.left while there is a left child, counting hops. As many hops as that side is deep:
 * a balanced tree's height is about log n, a stick's n - 1.
 */
export function bstExtreme(nodes: readonly TreeNode[], start: string, side: 'min' | 'max'): { frames: Frame[]; found: string } {
	const index = new Map(nodes.map((n) => [n.id, n]))
	const slot = side === 'min' ? 0 : 1
	const dir = side === 'min' ? 'left' : 'right'
	const name = side === 'min' ? 'minimum' : 'maximum'
	const at = (id: string): Pointer[] => [{ id: '#node', name: 'node', at: id }]
	const frames: Frame[] = []
	let node = index.get(start)!
	let hops = 0
	const ask = { ask: `node is at ${node.value}: does it go on?` }
	frames.push({
		pointers: at(node.id),
		flash: { [node.id]: 'orange' },
		counts: { hops },
		caption: `node = ${node.value}. Is there a ${dir} child?`,
		ask: `Find the ${name}: which way does node go?`,
		line: 'loop',
		vars: { node: node.value },
	})
	for (;;) {
		const next = node.children[slot]
		if (!next || !index.has(next)) break
		const from = node
		node = index.get(next)!
		hops++
		frames.push({
			pointers: at(node.id),
			flash: { [from.id]: null, [node.id]: 'orange' },
			counts: { hops },
			caption: `${from.value} has a ${dir} child, ${side === 'min' ? 'smaller' : 'larger'}: node = node.${dir} (${node.value})`,
			...ask,
			askFocus: [from.id],
			line: 'step',
			vars: { node: node.value },
		})
	}
	frames.push({
		pointers: at(node.id),
		flash: { [node.id]: 'green' },
		counts: { hops },
		caption: `${node.value} has no ${dir} child: the ${name} is ${node.value}, after ${hops} hop${hops === 1 ? '' : 's'}, as many as the tree is deep on that side (a balanced tree about log n, a stick n − 1)`,
		ask: `node is at ${node.value}: does it go on?`,
		askFocus: [node.id],
		line: 'found',
		vars: { node: node.value },
	})
	return { frames, found: node.id }
}

/** How many edges the longest way down from `id` takes (a leaf 0). */
export function treeHeight(nodes: readonly TreeNode[], id = nodes[0]?.id): number {
	const index = new Map(nodes.map((n) => [n.id, n]))
	const h = (at: string | null | undefined): number => {
		const node = at ? index.get(at) : undefined
		return node ? 1 + Math.max(...[0, 1].map((slot) => h(node.children[slot]))) : -1
	}
	return h(id)
}

/**
 * Lecture 8b's priority queue as a BST: insert `keys` one by one into an empty tree, each walking
 * down from the root. In sorted order every key goes right of the last: a stick, height n - 1, a
 * linked list; shuffled first ("randomize it"), the tree stays bushy, about log n high.
 */
export function bstBuild(keys: readonly string[], order: 'sorted' | 'shuffled'): { frames: Frame[]; nodes: TreeNode[] } {
	const frames: Frame[] = []
	let nodes: TreeNode[] = []
	let comparisons = 0
	const list = keys.join(', ')
	for (const [k, key] of keys.entries()) {
		if (!nodes.length) {
			nodes = [{ id: 'n', value: key, children: [null, null], dx: 0, dy: 0 }]
			frames.push({
				props: { nodes },
				flash: { n: 'green' },
				counts: { comparisons, height: 0 },
				caption: `Insert ${list}${order === 'sorted' ? ' (sorted)' : ' (shuffled)'} into an empty tree: ${key} is the root`,
				ask: false,
			})
			continue
		}
		const step = bstInsert(nodes, key)
		const index = new Map(nodes.map((n) => [n.id, n]))
		const walk = step.path.map((id) => {
			const v = index.get(id)!.value
			return `${key} ${compareKeys(key, v) < 0 ? '<' : '>'} ${v}`
		})
		comparisons += step.path.length
		nodes = step.nodes
		frames.push({
			props: { nodes },
			// Last key's highlights off, this one's walk and new node on.
			flash: { ...clear(frames), ...Object.fromEntries(step.path.map((id) => [id, 'orange' as const])), ...(step.id ? { [step.id]: 'green' as const } : {}) },
			counts: { comparisons, height: treeHeight(nodes) },
			caption: `Insert ${key}: ${walk.join(', ')}${step.id ? `: it hangs there` : ''}`,
			ask: k === 1 ? `Insert ${key}: where does it go?` : 'Where does the next key go?',
		})
	}
	const h = treeHeight(nodes)
	frames.push({
		props: { nodes },
		flash: clear(frames),
		counts: { comparisons, height: h },
		caption:
			order === 'sorted'
				? `Sorted keys: each went right of the last, so the tree is a stick, height ${h} = n − 1, a linked list: finding the largest takes ${h} hops`
				: `Shuffled first: height ${h} for ${keys.length} keys (log₂ ${keys.length} ≈ ${Math.log2(keys.length).toFixed(1)}), not ${keys.length - 1}: "randomize it first"`,
		ask: false,
	})
	return { frames, nodes }
}

/** Take every highlight the frames so far left lit off again. */
function clear(frames: readonly Frame[]): Record<string, null> {
	const lit = new Set(frames.flatMap((f) => Object.keys(f.flash ?? {})))
	return Object.fromEntries([...lit].map((k) => [k, null]))
}

/** One step that lights a node, saying why. */
const highlight = (id: string, color: MarkColor, caption: string): Frame => ({ flash: { [id]: color }, caption })

/**
 * Insert `key`, step by step: each comparison on the way down (the last one says where the new key
 * goes), each a line of the code. In predict mode the class is asked each way first.
 */
export function bstInsertSteps(nodes: readonly TreeNode[], key: string) {
	const result = bstInsert(nodes, key)
	const valueOf = new Map(nodes.map((n) => [n.id, n.value]))
	const frames = result.path.map((id, i): Frame => {
		const v = valueOf.get(id)!
		const cmp = compareKeys(key, v)
		const ask = { ask: i === 0 ? `Insert ${key}, starting at the root: ${key} vs ${v}, which way?` : `${key} vs ${v}: which way?`, askFocus: [id] }
		const vars = { key, curr: v }
		if (cmp === 0) return { ...highlight(id, 'orange', `${key} = ${v}: already in the tree`), ...ask, line: 'found', vars }
		const [sign, side] = cmp < 0 ? ['<', 'left'] : ['>', 'right']
		const last = i === result.path.length - 1
		return {
			...highlight(id, 'orange', last ? `${key} ${sign} ${v}, which has no ${side} child: ${key} goes there` : `${key} ${sign} ${v}: go ${side}`),
			...ask,
			line: last ? `hang-${side}` : side,
			vars,
		}
	})
	return { result, frames }
}

/**
 * Delete node `id`, step by step: which case it is; with two children the walk to the successor
 * (right once, then left as far as it goes) and how it is relinked (lecture 8b's 3.1 or 3.2).
 */
export function bstDeleteSteps(nodes: readonly TreeNode[], id: string) {
	const result = bstDelete(nodes, id)
	const valueOf = new Map(nodes.map((n) => [n.id, n.value]))
	const v = valueOf.get(id)
	const why = {
		leaf: `Delete ${v}: a leaf, so just remove it`,
		'one-child': `Delete ${v}: it has one child, which takes its place`,
		'two-children': `Delete ${v}: two children, so its successor, the smallest key on its right, will take its place`,
	}[result.kind]
	const s = result.successor
	const sv = s && valueOf.get(s)
	const moves =
		result.twoChildren === '3.1'
			? `${sv} is ${v}'s right child, with no left child: it moves up into ${v}'s place and ${v}'s left subtree hangs on as its left (case 3.1)`
			: `${sv} has no left child: its right subtree takes its place, then ${sv} moves up into ${v}'s place with both of ${v}'s subtrees (case 3.2)`
	const node = { node: v ?? '' }
	const frames: Frame[] = [
		{ ...highlight(id, 'red', why), line: { leaf: 'leaf', 'one-child': 'one', 'two-children': 'two' }[result.kind], vars: node },
		...result.path.map((p, i) => ({
			...highlight(p, 'orange', i === 0 ? `Go right to ${valueOf.get(p)}` : `Go left to ${valueOf.get(p)}`),
			line: i === 0 ? 'go-right' : 'go-left',
			vars: { ...node, s: valueOf.get(p) ?? '' },
		})),
		...(s ? [{ ...highlight(s, 'green', moves), line: result.twoChildren === '3.2' ? 'deep' : 'move-up', vars: { ...node, s: sv ?? '' } }] : []),
	]
	return { result, frames }
}
