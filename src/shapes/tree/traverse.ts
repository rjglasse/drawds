import type { MarkColor } from '../../cells/marks'
import type { Frame, Strip } from '../../nodelink/playback'
import { edgeCellKey } from '../../nodelink/scene'
import { nullKey } from './layout'
import type { TreeNode } from './tree-shape-types'

export type TreeOrder = 'pre' | 'in' | 'post' | 'level'

export const ORDER_NAMES: Record<TreeOrder, string> = { pre: 'Pre-order', in: 'In-order', post: 'Post-order', level: 'Level order' }

// The node being worked on is red; nodes waiting (on the call stack, or in the queue) orange;
// visited nodes blue, and numbered. The edges down to the current node are lit while the
// recursion is down there; a null child flashes orange as the base case.
const CURRENT: MarkColor = 'red'
const WAITING: MarkColor = 'orange'
const VISITED: MarkColor = 'blue'

export interface TreeTraversal {
	frames: Frame[]
	/** Node ids in visiting order. */
	visited: string[]
}

const SIDES = ['left', 'right'] as const
const edgeKey = (parent: string, child: string) => edgeCellKey(`${parent}->${child}`)
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * Traverse the subtree at `start`, step by step. Pre-, in- and post-order recurse: go left, back
 * up, go right, visiting each node before, between or after its subtrees, with the call stack
 * and the output so far as strips. Level order takes nodes from a queue. With `nulls`, empty
 * children (drawn as null markers) show up as base cases. `note` ends the last caption.
 */
export function traverseTree(
	nodes: readonly TreeNode[],
	start: string,
	order: TreeOrder,
	{ nulls = false, note }: { nulls?: boolean; note?: string } = {}
): TreeTraversal {
	const byId = new Map(nodes.map((n) => [n.id, n]))
	const value = (id: string) => byId.get(id)?.value ?? id
	const frames: Frame[] = []
	const visited: string[] = []
	const done = () => `Done: ${ORDER_NAMES[order].toLowerCase()} visits ${visited.map(value).join(', ')}${note ? `. ${note}` : ''}`
	const output = (): Strip => ({ title: `${ORDER_NAMES[order].toLowerCase()} output`, items: visited.map(value) })

	if (order === 'level') {
		const queue = [start]
		const strips = () => [{ title: 'queue (front on the left)', items: queue.map(value) }, output()]
		frames.push({ flash: { [start]: WAITING }, strips: strips(), caption: `Start: queue ${value(start)}` })
		let previous: string | undefined
		while (queue.length) {
			const id = queue.shift()!
			visited.push(id)
			const kids = (byId.get(id)?.children ?? []).filter((c): c is string => !!c && byId.has(c))
			queue.push(...kids)
			frames.push({
				flash: { [id]: CURRENT, ...(previous ? { [previous]: VISITED } : {}), ...Object.fromEntries(kids.map((k) => [k, WAITING])) },
				badges: { [id]: String(visited.length) },
				strips: strips(),
				caption: `Dequeue ${value(id)}: visit it (${visited.length})${kids.length ? `, queue ${kids.map(value).join(' and ')}` : ''}`,
			})
			previous = id
		}
		frames.push({ flash: previous ? { [previous]: VISITED } : {}, strips: strips(), caption: done() })
		return { frames, visited }
	}

	const stack: string[] = []
	const strips = () => [{ title: 'call stack (top on the right)', items: stack.map(value) }, output()]
	const isVisited = new Set<string>()
	// Changes owed to the next frame (a node finished, a null flash to clear), and where the walk
	// came back to, which the next caption starts with.
	let pending: Record<string, MarkColor | null> = {}
	let backAt: string | undefined

	const frame = (f: Frame) => {
		frames.push({ ...f, flash: { ...pending, ...f.flash }, strips: strips() })
		pending = {}
	}
	/** Caption for a step that starts with `action`, after any return to `backAt`. */
	const say = (action: string) => {
		const text = backAt ? `back at ${value(backAt)}, ${action}` : action
		backAt = undefined
		return capitalise(text)
	}
	const visit = (id: string) => {
		visited.push(id)
		isVisited.add(id)
		return { [id]: String(visited.length) }
	}

	const walk = (id: string, from?: { parent: string; slot: number }) => {
		stack.push(id)
		const node = byId.get(id)!
		const v = value(id)
		const arrive = from ? `go ${SIDES[from.slot]} to ${v}` : `start at ${v}`
		const flash = {
			[id]: CURRENT,
			...(from ? { [from.parent]: isVisited.has(from.parent) ? VISITED : WAITING, [edgeKey(from.parent, id)]: WAITING } : {}),
		}
		const kids = SIDES.map((_, slot) => node.children[slot]).map((c) => (c && byId.has(c) ? c : undefined))
		if (order === 'pre') {
			frame({ flash, badges: visit(id), caption: `${say(arrive)}: visit it (${visited.length})` })
		} else {
			const first = order === 'in' ? 'its left subtree first' : 'its left and right subtrees first'
			frame({ flash, caption: `${say(arrive)}${kids.some(Boolean) ? `: ${first}` : ''}` })
		}

		const child = (slot: number) => {
			const c = kids[slot]
			if (c) return walk(c, { parent: id, slot })
			if (!nulls) return
			const marker = nullKey(id, slot)
			frame({ flash: { [marker]: WAITING, [id]: CURRENT }, caption: say(`${v}'s ${SIDES[slot]} child is null: nothing to do`) })
			pending[marker] = null
		}

		child(0)
		if (order === 'in') {
			const then = kids[1] ? ', then its right subtree' : ''
			frame({ flash: { [id]: CURRENT }, badges: visit(id), caption: `${say(`visit ${backAt === id ? 'it' : v}`)} (${visited.length})${then}` })
		}
		child(1)
		if (order === 'post') {
			const leaf = !kids.some(Boolean)
			frame({
				flash: { [id]: CURRENT },
				badges: visit(id),
				caption: `${say(leaf ? `${v} is a leaf: visit it` : `its subtrees are done: visit ${backAt === id ? 'it' : v}`)} (${visited.length})`,
			})
		}

		stack.pop()
		const parent = stack[stack.length - 1]
		pending = { ...pending, [id]: VISITED }
		if (parent) {
			pending[edgeKey(parent, id)] = null
			pending[parent] = CURRENT
		}
		backAt = parent
	}

	walk(start)
	backAt = undefined
	frame({ caption: done() })
	return { frames, visited }
}
