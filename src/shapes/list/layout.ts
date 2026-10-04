import type { TLDefaultSizeStyle } from 'tldraw'
import { pointerAnchor, type Point } from '../../nodelink/geometry'
import type { Scene, SceneEdge, SceneNode } from '../../nodelink/scene'
import { POINTER_FONT_SCALE, pointerReach } from '../../pointers/layout'
import type { SketchState } from '../../sketch/line-sketch'
import { CELL_SIZES } from '../sizes'
import type { ListDirection, ListShapeProps } from './list-shape-types'

/** Keys of the annotation nodes; list node ids are `n0`, `n1`, ... so these can't collide. */
export const HEAD_KEY = '#head'
export const NULL_KEY = '#null'
export const TAIL_KEY = '#tail'
/** A sentinel (dummy) node in front of the first value. */
export const SENTINEL_KEY = '#sentinel'
/** The null a doubly linked list's first node's prev points at. */
export const NULL_PREV_KEY = '#null-prev'

/** Next and prev arrows of a doubly linked list run in two lanes, this share of a node's height apart. */
const LANE = 0.2

export function getListMetrics(size: TLDefaultSizeStyle, doubly = false) {
	const cell = CELL_SIZES[size]
	const pointerW = cell * 0.5
	// A doubly linked node has a prev compartment too: [prev | value | next].
	const nodeW = cell + pointerW * (doubly ? 2 : 1)
	const gap = cell * 0.9
	return {
		cell,
		pointerW,
		nodeW,
		nodeH: cell,
		gap,
		/** Distance between node centres, which is also the drag distance per new node. */
		step: nodeW + gap,
		fontSize: cell * 0.42,
		labelFontSize: Math.max(10, cell * 0.3),
		strokeWidth: Math.max(1.5, cell / 24),
	}
}

const UNIT: Record<ListDirection, [number, number]> = { right: [1, 0], left: [-1, 0], down: [0, 1], up: [0, -1] }

export function sketchDirection({ direction, sign }: SketchState): ListDirection {
	if (direction === 'horizontal') return sign > 0 ? 'right' : 'left'
	return sign > 0 ? 'down' : 'up'
}

type Variants = Partial<Pick<ListShapeProps, 'links' | 'tail' | 'ends' | 'sentinel' | 'cycleTo'>>
type ListLayoutProps = Pick<ListShapeProps, 'nodes' | 'direction' | 'size'> & Variants

/** The list's variant as flags: doubly linked, a tail pointer, circular, a sentinel; and a cycle. */
export function listVariant({ links, tail, ends, sentinel, cycleTo }: Variants, nodes?: readonly { id: string }[]) {
	return {
		doubly: links === 'doubly',
		tail: tail === 'tail',
		circular: ends === 'circular',
		sentinel: sentinel === 'sentinel',
		// Only to a node that is there.
		cycleTo: cycleTo && (!nodes || nodes.some((n) => n.id === cycleTo)) ? cycleTo : undefined,
	}
}

/** The nodes in link order: a sentinel first if there is one, then the list's own. */
export function chainKeys(props: ListLayoutProps): string[] {
	return [...(listVariant(props).sentinel ? [SENTINEL_KEY] : []), ...props.nodes.map((n) => n.id)]
}

/**
 * How a list's pointer arrows are drawn: a doubly linked list's next and prev arrows in two lanes
 * (a vertical list's compartments already sit side by side), never curved apart as twins.
 */
export function arrowStyle(props: Pick<ListShapeProps, 'direction'> & Variants): Partial<SceneEdge> {
	if (!listVariant(props).doubly) return {}
	return { lane: UNIT[props.direction][1] === 0 ? LANE : 0, bend: 0 }
}

/** Every node at its automatic position (drag offsets ignored), with the scene's top-left at (0, 0). */
function baseScene(props: ListLayoutProps): Scene {
	const { nodes, direction, size } = props
	const v = listVariant(props, nodes)
	const m = getListMetrics(size, v.doubly)
	const [ux, uy] = UNIT[direction]
	const horizontal = uy === 0
	const text = (chars: number) => ({ w: chars * m.labelFontSize * 0.62 + m.labelFontSize, h: m.labelFontSize * 1.6 })
	const byId = new Map(nodes.map((n) => [n.id, n]))

	const listNodes: SceneNode[] = chainKeys(props).map((key, i) => ({
		key,
		kind: 'list-node',
		x: i * m.step * ux,
		y: i * m.step * uy,
		w: m.nodeW,
		h: m.nodeH,
		value: byId.get(key)?.value ?? '',
		pointer: { side: direction === 'left' ? 'left' : 'right', width: m.pointerW, ...(v.doubly ? { back: true } : {}) },
		editable: key !== SENTINEL_KEY,
		draggable: key !== SENTINEL_KEY,
		...(key === SENTINEL_KEY ? { ghost: true } : {}),
	}))

	const first = listNodes[0]
	const last = listNodes[listNodes.length - 1]
	const nullText = text(4)
	const nullAlong = (horizontal ? m.nodeW / 2 + nullText.w / 2 : m.nodeH / 2 + nullText.h / 2) + m.gap
	const labelText = text(4)
	// Labels sit above a horizontal list and left of a vertical one; head and tail on a lone node side by side.
	const lone = v.tail && listNodes.length === 1
	const shift = lone ? labelText.w / 2 + m.gap * 0.15 : 0
	const label = (key: string, node: SceneNode, value: string, along: number): SceneNode => ({
		key,
		kind: 'label',
		x: horizontal ? node.x + along : node.x - m.nodeW / 2 - m.gap * 0.8 - labelText.w / 2,
		y: horizontal ? node.y - m.nodeH / 2 - m.gap * 0.8 - labelText.h / 2 : node.y + along,
		...labelText,
		value,
		editable: false,
		draggable: false,
	})
	const nul = (key: string, node: SceneNode, sign: 1 | -1): SceneNode => ({
		key,
		kind: 'null',
		x: node.x + sign * nullAlong * ux,
		y: node.y + sign * nullAlong * uy,
		...nullText,
		value: 'null',
		editable: false,
		draggable: false,
	})
	const annotations: SceneNode[] = [
		...(v.circular || v.cycleTo ? [] : [nul(NULL_KEY, last, 1)]),
		...(v.doubly && !v.circular ? [nul(NULL_PREV_KEY, first, -1)] : []),
		label(HEAD_KEY, first, 'head', -shift),
		...(v.tail ? [label(TAIL_KEY, last, 'tail', shift)] : []),
	]

	// Next arrows, then a doubly linked list's prev arrows, in their own lanes; the last node's next
	// goes back to the first (circular) or to the cycle's node, else to null.
	const lanes = arrowStyle(props)
	const end = v.circular ? first.key : (v.cycleTo ?? NULL_KEY)
	const edges: SceneEdge[] = listNodes.map((node, i) => ({
		key: `${node.key}->`,
		from: node.key,
		to: listNodes[i + 1]?.key ?? end,
		directed: true,
		fromPointer: true,
		...lanes,
	}))
	if (v.doubly) {
		listNodes.forEach((node, i) =>
			edges.push({
				key: `${node.key}<-`,
				from: node.key,
				to: listNodes[i - 1]?.key ?? (v.circular ? last.key : NULL_PREV_KEY),
				directed: true,
				fromPointer: 'prev',
				...lanes,
			})
		)
	}
	edges.push({ key: `${HEAD_KEY}->`, from: HEAD_KEY, to: first.key, directed: true })
	if (v.tail) edges.push({ key: `${TAIL_KEY}->`, from: TAIL_KEY, to: last.key, directed: true })

	const all = [...listNodes, ...annotations]
	const minX = Math.min(...all.map((n) => n.x - n.w / 2))
	const minY = Math.min(...all.map((n) => n.y - n.h / 2))
	return {
		nodes: all.map((n) => ({ ...n, x: n.x - minX, y: n.y - minY })),
		edges,
		metrics: { fontSize: m.fontSize, labelFontSize: m.labelFontSize, strokeWidth: m.strokeWidth },
	}
}

/**
 * Arrows that go back along the list (circular, or into a cycle) loop round it: out past the source
 * node, across (under a horizontal list, right of a vertical one, clear of the pointers there), back
 * along, and in before the target. A doubly linked circular list's first prev arrow loops the other
 * way round, over the head label. The corners are worked out on the positioned nodes.
 *
 * Operations pass the nodes they draw off the list's line (a new node, one dropping out) as
 * `floating`, each with its place in the chain (a new node after the third: 2.5); loops clear them.
 */
export function loopBack(scene: Scene, props: ListLayoutProps, floating: Record<string, number> = {}): Scene {
	const v = listVariant(props, props.nodes)
	const m = getListMetrics(props.size, v.doubly)
	const [ux, uy] = UNIT[props.direction]
	const horizontal = uy === 0
	const across = horizontal ? { x: 0, y: 1 } : { x: 1, y: 0 }
	const keys = chainKeys(props)
	const order = new Map([...keys.map((k, i) => [k, i] as const), ...Object.entries(floating)])
	const byKey = new Map(scene.nodes.map((n) => [n.key, n]))
	const chain = keys.filter((k) => !(k in floating)).map((k) => byKey.get(k)!).filter(Boolean)
	const at = (n: { x: number; y: number }) => ({ a: n.x * ux + n.y * uy, c: n.x * across.x + n.y * across.y })
	const point = (a: number, c: number) => ({ x: ux * a + across.x * c, y: uy * a + across.y * c })
	const half = (horizontal ? m.nodeW : m.nodeH) / 2
	const thick = (horizontal ? m.nodeH : m.nodeW) / 2
	const laneShift = v.doubly && horizontal ? LANE * m.nodeH : 0
	const reach = pointerReach(m.fontSize * POINTER_FONT_SCALE)
	// Clear of the head and tail labels: above a horizontal list, left of a vertical one (as wide as a label).
	const labels = horizontal ? m.labelFontSize * 1.6 : 4 * m.labelFontSize * 0.62 + m.labelFontSize
	const loop = (from: string, to: string, out: number, side: 'below' | 'above', shift: number) => {
		const source = byKey.get(from)!
		const target = byKey.get(to)!
		// Along the list from the source's centre; across from its pointer compartment (beside the value
		// in a vertical list), where the arrow leaves.
		const f = { a: at(source).a, c: at(pointerAnchor(source, side === 'above')).c }
		const t = at(target)
		const cs = [...chain, source, target].map((n) => at(n).c)
		const depth =
			side === 'below'
				? Math.max(...cs) + thick + reach + m.gap * 0.35
				: Math.min(...cs) - thick - m.gap * 0.8 - labels - m.gap * 0.4
		// Out of the source on its far side, back in on the target's near side (or the other way round).
		const [fa, ta] = side === 'below' ? [f.a + half + out, t.a - half - out] : [f.a - half - out, t.a + half + out]
		return [point(fa, f.c + shift), point(fa, depth), point(ta, depth), point(ta, t.c + shift)]
	}
	return {
		...scene,
		edges: scene.edges.map((e) => {
			const [from, to] = [order.get(e.from), order.get(e.to)]
			if (from === undefined || to === undefined) return e
			const back = e.fromPointer === true && to <= from
			if (back) return { ...e, via: loop(e.from, e.to, m.gap * 0.45, 'below', laneShift), lane: undefined }
			const prevBack = e.fromPointer === 'prev' && to > from
			if (prevBack) return { ...e, via: loop(e.from, e.to, m.gap * 0.7, 'above', -laneShift), lane: undefined }
			return e
		}),
	}
}

/** The list's scene: the automatic layout plus each node's drag offset. Annotations follow their node. */
export function listScene(props: ListLayoutProps): Scene {
	const scene = baseScene(props)
	const v = listVariant(props, props.nodes)
	const byId = new Map(props.nodes.map((n) => [n.id, n]))
	const first = props.nodes[0]
	const last = props.nodes[props.nodes.length - 1]
	const owner = (key: string) =>
		key === HEAD_KEY
			? v.sentinel
				? undefined
				: first
			: key === NULL_KEY || key === TAIL_KEY
				? last
				: key === NULL_PREV_KEY
					? v.sentinel
						? undefined
						: first
					: byId.get(key)
	const moved = {
		...scene,
		nodes: scene.nodes.map((n) => {
			const o = owner(n.key)
			return o && (o.dx || o.dy) ? { ...n, x: n.x + o.dx, y: n.y + o.dy } : n
		}),
	}
	return v.circular || v.cycleTo ? loopBack(moved, props) : moved
}

/** Unit vector pointing the way the list runs from head to tail. */
export function listAxis(direction: ListDirection): Point {
	const [x, y] = UNIT[direction]
	return { x, y }
}

/** Centre of the start grip, just before the first node (or its prev's null), in shape space. */
export function listStartGripPoint(props: ListLayoutProps): Point {
	const { gap } = getListMetrics(props.size)
	const axis = listAxis(props.direction)
	const scene = listScene(props)
	const before = scene.nodes.find((n) => n.key === NULL_PREV_KEY) ?? scene.nodes.find((n) => n.key === chainKeys(props)[0])!
	// Beyond an arrow looping back into the first node.
	const v = listVariant(props, props.nodes)
	const d = (axis.y === 0 ? before.w / 2 : before.h / 2) + gap * (v.circular ? 1.3 : 0.5)
	return { x: before.x - axis.x * d, y: before.y - axis.y * d }
}

/** Centre of the end grip, just past the null marker (which follows a dragged tail), in shape space. */
export function listGrowPoint(props: ListLayoutProps): Point {
	const { gap } = getListMetrics(props.size)
	const axis = listAxis(props.direction)
	const scene = listScene(props)
	const nul = scene.nodes.find((n) => n.key === NULL_KEY)
	// No null (circular, or a cycle): past the last node, beyond the arrow looping back.
	const end = nul ?? scene.nodes.find((n) => n.key === props.nodes[props.nodes.length - 1].id)!
	const d = (axis.y === 0 ? end.w / 2 : end.h / 2) + gap * (nul ? 0.5 : 1.3)
	return { x: end.x + axis.x * d, y: end.y + axis.y * d }
}

/** Where a node sits with no drag offset, in shape space. */
export function listBasePosition(props: ListLayoutProps, key: string): Point | undefined {
	const node = baseScene(props).nodes.find((n) => n.key === key)
	return node && { x: node.x, y: node.y }
}

/** Centre of the head node with no drag offset; the sketch tool keeps this under the drag origin. */
export function listHeadCentre(props: ListLayoutProps): Point {
	return listBasePosition(props, props.nodes[0].id) ?? { x: 0, y: 0 }
}
