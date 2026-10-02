import type { TLDefaultSizeStyle } from 'tldraw'
import type { Point } from '../../nodelink/geometry'
import type { Scene } from '../../nodelink/scene'
import { CELL_SIZES } from '../sizes'
import type { GraphShapeProps } from './graph-shape-types'

export function getGraphMetrics(size: TLDefaultSizeStyle) {
	const cell = CELL_SIZES[size]
	return {
		/** Page px per cell unit; also the node diameter. */
		cell,
		fontSize: cell * 0.42,
		labelFontSize: Math.max(10, cell * 0.3),
		strokeWidth: Math.max(1.5, cell / 24),
	}
}

type SceneProps = Pick<GraphShapeProps, 'nodes' | 'edges' | 'direction' | 'weights' | 'size'>

/**
 * Nodes are circles where the props put them (cell units, scaled to px); edges carry arrowheads
 * when directed and their weights when weighted.
 */
export function graphScene({ nodes, edges, direction, weights, size }: SceneProps): Scene {
	const { cell, fontSize, labelFontSize, strokeWidth } = getGraphMetrics(size)
	return {
		nodes: nodes.map((n) => ({
			key: n.id,
			kind: 'circle',
			x: n.x * cell,
			y: n.y * cell,
			w: cell,
			h: cell,
			value: n.value,
			editable: true,
			draggable: true,
		})),
		edges: edges.map((e) => ({
			key: e.id,
			from: e.from,
			to: e.to,
			directed: direction === 'directed',
			label: weights === 'weighted' ? e.weight : undefined,
		})),
		metrics: { fontSize, labelFontSize, strokeWidth },
	}
}

/** A point in shape space (px) in cell units, for storing as a node position. */
export function toUnits(p: Point, size: TLDefaultSizeStyle): Point {
	const { cell } = getGraphMetrics(size)
	return { x: p.x / cell, y: p.y / cell }
}

/** The lower-right corner of the nodes' bounding box, in px. */
export function graphCorner({ nodes, size }: Pick<GraphShapeProps, 'nodes' | 'size'>): Point {
	const { cell } = getGraphMetrics(size)
	return {
		x: (Math.max(...nodes.map((n) => n.x)) + 0.5) * cell,
		y: (Math.max(...nodes.map((n) => n.y)) + 0.5) * cell,
	}
}
