import type { TLDefaultSizeStyle } from 'tldraw'
import type { Point } from '../../nodelink/geometry'
import type { Scene, SceneEdge, SceneNode } from '../../nodelink/scene'
import type { SketchState } from '../../sketch/line-sketch'
import { CELL_SIZES } from '../sizes'
import type { ListDirection, ListShapeProps } from './list-shape-types'

/** Keys of the annotation nodes; list node ids are `n0`, `n1`, ... so these can't collide. */
export const HEAD_KEY = '#head'
export const NULL_KEY = '#null'

export function getListMetrics(size: TLDefaultSizeStyle) {
	const cell = CELL_SIZES[size]
	const pointerW = cell * 0.5
	const nodeW = cell + pointerW
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

type ListLayoutProps = Pick<ListShapeProps, 'nodes' | 'direction' | 'size'>

/** Every node at its automatic position (drag offsets ignored), with the scene's top-left at (0, 0). */
function baseScene({ nodes, direction, size }: ListLayoutProps): Scene {
	const m = getListMetrics(size)
	const [ux, uy] = UNIT[direction]
	const horizontal = uy === 0
	const text = (chars: number) => ({ w: chars * m.labelFontSize * 0.62 + m.labelFontSize, h: m.labelFontSize * 1.6 })

	const listNodes: SceneNode[] = nodes.map((node, i) => ({
		key: node.id,
		kind: 'list-node',
		x: i * m.step * ux,
		y: i * m.step * uy,
		w: m.nodeW,
		h: m.nodeH,
		value: node.value,
		pointer: { side: direction === 'left' ? 'left' : 'right', width: m.pointerW },
		editable: true,
		draggable: true,
	}))

	const head = listNodes[0]
	const tail = listNodes[listNodes.length - 1]
	const nullText = text(4)
	const nullAlong = (horizontal ? m.nodeW / 2 + nullText.w / 2 : m.nodeH / 2 + nullText.h / 2) + m.gap
	const headText = text(4)
	const annotations: SceneNode[] = [
		{
			key: NULL_KEY,
			kind: 'null',
			x: tail.x + nullAlong * ux,
			y: tail.y + nullAlong * uy,
			...nullText,
			value: 'null',
			editable: false,
			draggable: false,
		},
		{
			key: HEAD_KEY,
			kind: 'label',
			// Above a horizontal list, to the left of a vertical one.
			x: horizontal ? head.x : head.x - m.nodeW / 2 - m.gap * 0.8 - headText.w / 2,
			y: horizontal ? head.y - m.nodeH / 2 - m.gap * 0.8 - headText.h / 2 : head.y,
			...headText,
			value: 'head',
			editable: false,
			draggable: false,
		},
	]

	const edges: SceneEdge[] = listNodes.map((node, i) => ({
		key: `${node.key}->`,
		from: node.key,
		to: listNodes[i + 1]?.key ?? NULL_KEY,
		directed: true,
		fromPointer: true,
	}))
	edges.push({ key: `${HEAD_KEY}->`, from: HEAD_KEY, to: head.key, directed: true })

	const all = [...listNodes, ...annotations]
	const minX = Math.min(...all.map((n) => n.x - n.w / 2))
	const minY = Math.min(...all.map((n) => n.y - n.h / 2))
	return {
		nodes: all.map((n) => ({ ...n, x: n.x - minX, y: n.y - minY })),
		edges,
		metrics: { fontSize: m.fontSize, labelFontSize: m.labelFontSize, strokeWidth: m.strokeWidth },
	}
}

/** The list's scene: the automatic layout plus each node's drag offset. Annotations follow their node. */
export function listScene(props: ListLayoutProps): Scene {
	const scene = baseScene(props)
	const byId = new Map(props.nodes.map((n) => [n.id, n]))
	const owner = (key: string) =>
		key === HEAD_KEY ? props.nodes[0] : key === NULL_KEY ? props.nodes[props.nodes.length - 1] : byId.get(key)
	return {
		...scene,
		nodes: scene.nodes.map((n) => {
			const o = owner(n.key)
			return o && (o.dx || o.dy) ? { ...n, x: n.x + o.dx, y: n.y + o.dy } : n
		}),
	}
}

/** Unit vector pointing the way the list runs from head to tail. */
export function listAxis(direction: ListDirection): Point {
	const [x, y] = UNIT[direction]
	return { x, y }
}

/** Centre of the start grip, just before the head node (following a dragged head), in shape space. */
export function listStartGripPoint(props: ListLayoutProps): Point {
	const { gap } = getListMetrics(props.size)
	const axis = listAxis(props.direction)
	const head = listScene(props).nodes.find((n) => n.key === props.nodes[0].id)!
	const d = (axis.y === 0 ? head.w / 2 : head.h / 2) + gap * 0.5
	return { x: head.x - axis.x * d, y: head.y - axis.y * d }
}

/** Centre of the end grip, just past the null marker (which follows a dragged tail), in shape space. */
export function listGrowPoint(props: ListLayoutProps): Point {
	const { gap } = getListMetrics(props.size)
	const axis = listAxis(props.direction)
	const nul = listScene(props).nodes.find((n) => n.key === NULL_KEY)!
	const d = (axis.y === 0 ? nul.w / 2 : nul.h / 2) + gap * 0.5
	return { x: nul.x + axis.x * d, y: nul.y + axis.y * d }
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
