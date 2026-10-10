import type { TLDefaultSizeStyle } from 'tldraw'
import { CHAR_WIDTH } from '../recursion/calls'
import { CELL_SIZES } from '../sizes'
import type { ShuffleKind } from '../array/shuffles'
import { everyOrder, orderName, outcomeTree, tallySteps, type OutcomeNode, type OutcomesMode } from './outcomes'

// Where a shuffle's outcomes view draws things: a title, then (tree) every run, a level per pick and
// the leaves in a row, and under it (or, many runs, alone) a bar per order on a share scale with the
// fair share marked. Laid out for the whole run, so it holds still while the steps reveal it.

export interface Box {
	x: number
	y: number
	w: number
	h: number
}

export interface OutcomesLayout {
	fontSize: number
	strokeWidth: number
	box: { w: number; h: number }
	title: { x: number; y: number }
	/** Tree mode: each node's box (the values after the picks so far), in `outcomeTree`'s order. */
	tree?: { nodes: (OutcomeNode & { box: Box })[]; depth: number; leaves: number[] }
	/** A bar's slot per order (bars grow up from `base`, at most `maxH` tall). */
	bars: { order: string; x: number; w: number }[]
	base: number
	maxH: number
	/** The share a full-height bar stands for: half again a fair share (bars that reach it are capped). */
	fullShare: number
}

const TITLES: Record<OutcomesMode, Record<ShuffleKind, string>> = {
	tree: { unfair: 'Every run of the unfair shuffle', 'fisher-yates': 'Every run of Fisher-Yates' },
	tally: { unfair: 'The unfair shuffle, run many times', 'fisher-yates': 'Fisher-Yates, run many times' },
}

/** The view's title; many runs say how many so far. */
export const outcomesTitle = (kind: ShuffleKind, mode: OutcomesMode, runs?: number) =>
	`${TITLES[mode][kind]}${runs === undefined ? '' : ` · ${runs.toLocaleString('en')} runs`}`

/** Up to six orders each get a colour (their leaves and their bar); more share one. */
export const ORDER_COLORS = ['blue', 'green', 'orange', 'red', 'violet', 'light-blue'] as const

export function outcomesLayout(values: readonly string[], kind: ShuffleKind, mode: OutcomesMode, size: TLDefaultSizeStyle): OutcomesLayout {
	const fontSize = Math.round(CELL_SIZES[size] * 0.3)
	const strokeWidth = Math.max(1.25, CELL_SIZES[size] / 40)
	const charW = fontSize * CHAR_WIDTH.mono
	const orders = [...new Set(everyOrder(values).map(orderName))]
	const label = Math.max(...orders.map((o) => o.length))
	const nodeW = label * charW + fontSize * 0.9
	const nodeH = fontSize * 1.7
	const gap = fontSize * 0.5
	const title = { x: 0, y: fontSize * 0.8 }
	let top = fontSize * 2.4

	let tree: OutcomesLayout['tree']
	let width = 0
	if (mode === 'tree') {
		const { nodes, depth, leaves } = outcomeTree(values, kind)
		const levelGap = nodeH + fontSize * 2.4
		const x = new Map<number, number>()
		leaves.forEach((leaf, k) => x.set(leaf, k * (nodeW + gap) + nodeW / 2))
		// Each node over the middle of its children, deepest first.
		for (let at = nodes.length - 1; at >= 0; at--) {
			const { children } = nodes[at]
			if (children.length) x.set(at, (x.get(children[0])! + x.get(children[children.length - 1])!) / 2)
		}
		width = leaves.length * (nodeW + gap) - gap
		tree = {
			depth,
			leaves,
			nodes: nodes.map((n, at) => ({ ...n, box: { x: x.get(at)! - nodeW / 2, y: top + n.depth * levelGap, w: nodeW, h: nodeH } })),
		}
		top += depth * levelGap + nodeH + fontSize * 2.2
	}

	// The tally: a slot per order, the counts above the bars and the orders under them.
	const slot = Math.max(nodeW + gap * 2, fontSize * 2.2)
	const barsW = orders.length * slot
	// Room for the title at its longest, and for "fair" past the bars.
	const titleW = outcomesTitle(kind, mode, mode === 'tally' ? Math.max(...tallySteps(values.length)) : undefined).length * charW
	width = Math.max(width, barsW + fontSize * 4, titleW)
	const barsX = (width - barsW) / 2
	const maxH = fontSize * 7
	const base = top + fontSize * 1.4 + maxH
	// The tree, centred over the tally if that is wider.
	if (tree) {
		const treeW = tree.leaves.length * (nodeW + gap) - gap
		const shift = (width - treeW) / 2
		for (const n of tree.nodes) n.box.x += shift
	}
	return {
		fontSize,
		strokeWidth,
		box: { w: width, h: base + fontSize * 1.8 },
		title,
		tree,
		bars: orders.map((order, k) => ({ order, x: barsX + k * slot + slot / 2, w: slot - gap * 2 })),
		base,
		maxH,
		fullShare: 1.5 / orders.length,
	}
}
