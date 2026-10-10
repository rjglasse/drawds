import type { MarkColor } from '../../cells/marks'
import type { Frame, Strip } from '../../nodelink/playback'
import { edgeCellKey } from '../../nodelink/scene'
import { nullKey } from './layout'
import type { TreeNode } from './tree-shape-types'

// Lecture 8a's recursion that returns values, from a node: height, the number of leaves, the size.
// Post-order: a call works out its subtrees first, then combines their answers, which go up the
// stack; each node gets its answer as a badge when its call returns, and the caption forms the sum
// or max ("height(B) = 1 + max(0, 0) = 1"). The code is written so a node with one child works too:
// an empty subtree is a call on null, a base case (height -1, so a leaf is 0; or 0 with a leaf 1).

/** What to work out: height with a leaf 0 (edges, as lecture 8 counts) or 1 (levels), leaves, size. */
export type TreeMeasure = 'height' | 'height-levels' | 'leaves' | 'size'

export const MEASURE_NAMES: Record<TreeMeasure, string> = {
	height: 'Height (a leaf is 0)',
	'height-levels': 'Height (a leaf is 1)',
	leaves: 'Count the leaves',
	size: 'Size (count every node)',
}

const CURRENT: MarkColor = 'red'
const WAITING: MarkColor = 'orange'
const DONE: MarkColor = 'blue'

const fn = (measure: TreeMeasure) => (measure === 'leaves' ? 'leaves' : measure === 'size' ? 'size' : 'height')
const edgeKey = (parent: string, child: string) => edgeCellKey(`${parent}->${child}`)

export interface TreeMeasureRun {
	frames: Frame[]
	result: number
	code: string
}

/** Work `measure` out for the subtree at `start`, step by step. With `nulls`, empty children show as base-case calls. */
export function measureTree(nodes: readonly TreeNode[], start: string, measure: TreeMeasure, { nulls = false } = {}): TreeMeasureRun {
	const byId = new Map(nodes.map((n) => [n.id, n]))
	const value = (id: string) => byId.get(id)?.value || id
	const name = fn(measure)
	const call = (id: string | undefined) => `${name}(${id ? value(id) : 'null'})`
	// What a call on null returns: an empty tree.
	const empty = measure === 'height' ? -1 : 0
	const frames: Frame[] = []
	const stack: string[] = []
	const strips = (): Strip[] => [{ title: 'call stack (top on the right)', items: stack.map((id) => call(id)) }]
	let calls = 0
	let pending: Record<string, MarkColor | null> = {}
	const frame = (f: Frame) => {
		frames.push({ ...f, flash: { ...pending, ...f.flash }, strips: strips(), counts: { calls } })
		pending = {}
	}

	const run = (id: string, from?: { parent: string; slot: number }): number => {
		calls++
		stack.push(id)
		const node = byId.get(id)!
		const kids = [0, 1].map((slot) => (node.children[slot] && byId.has(node.children[slot]!) ? node.children[slot]! : undefined))
		const leaf = !kids.some(Boolean)
		const flash = { [id]: CURRENT, ...(from ? { [from.parent]: WAITING, [edgeKey(from.parent, id)]: WAITING } : {}) }
		if (measure === 'leaves' && leaf) {
			frame({
				flash,
				badges: { [id]: '1' },
				caption: `${call(id)}: ${value(id)} is a leaf, so return 1`,
				ask: `${call(id)}: what does it return?`,
				line: 'leaf',
				vars: { node: value(id) },
			})
			return finish(id, 1)
		}
		frame({
			flash,
			caption: `${call(id)}: ${leaf && measure !== 'size' ? `${value(id)} is a leaf, but the code doesn't ask: its subtrees first` : 'first its subtrees'}`,
			ask: from ? 'Which call comes next?' : `${call(id)}: where does it start?`,
			line: 'call',
			vars: { node: value(id) },
		})
		const answers = kids.map((kid, slot) => {
			if (kid) return run(kid, { parent: id, slot })
			calls++
			if (nulls) {
				const marker = nullKey(id, slot)
				frame({
					flash: { [marker]: WAITING, [id]: CURRENT },
					caption: `${call(undefined)}: an empty subtree, so return ${empty}`,
					line: 'base',
					vars: { node: 'null' },
				})
				pending[marker] = null
			}
			return empty
		})
		const [l, r] = answers
		const result = measure === 'leaves' ? l + r : measure === 'size' ? 1 + l + r : 1 + Math.max(l, r)
		const parts = kids.map((kid, slot) => (kid ? `${call(kid)} = ${answers[slot]}` : `${call(undefined)} = ${empty}`))
		const formula =
			measure === 'leaves'
				? `${l} + ${r}`
				: measure === 'size'
					? `1 + ${l} + ${r}`
					: `1 + max(${l}, ${r})`
		frame({
			flash: { [id]: CURRENT },
			badges: { [id]: String(result) },
			caption: `${call(id)} = ${formula} = ${result} (${parts.join(', ')})`,
			ask: `${call(id)}: its subtrees are done. What does it return?`,
			askFocus: [id],
			line: 'return',
			vars: { node: value(id), left: String(l), right: String(r) },
		})
		return finish(id, result)
	}

	/** The call returns: off the stack, its node done; the caller carries on. */
	const finish = (id: string, result: number) => {
		stack.pop()
		const parent = stack[stack.length - 1]
		pending = { ...pending, [id]: DONE }
		if (parent) {
			pending[edgeKey(parent, id)] = null
			pending[parent] = CURRENT
		}
		return result
	}

	const result = run(start)
	const end =
		measure === 'size'
			? `${call(start)} = ${result}: one call for every node and every empty subtree, ${calls} in all: linear. Keeping a size field (+1 on insert, −1 on delete) makes it constant`
			: measure === 'leaves'
				? `${call(start)} = ${result}: ${result === 1 ? 'one leaf' : `${result} leaves`}, each a base case returning 1, added up on the way back`
				: `${call(start)} = ${result}: the longest way down from ${value(start)}, counted in ${measure === 'height' ? 'edges (a leaf is 0, an empty tree -1)' : 'levels (a leaf is 1, an empty tree 0)'}`
	frame({ caption: end, ask: false })
	return { frames, result, code: `tree-${measure}` }
}
