/**
 * A node-link structure (list, tree, heap, graph) is one tldraw shape whose props hold the model.
 * Each shape turns its props into a Scene - positioned nodes and edges in shape space - and the
 * shared kit renders, hit-tests, edits and drags from that.
 */

export type NodeKind =
	| 'circle'
	/** Rectangle holding a value. */
	| 'box'
	/** [value | next] box: a value compartment plus a pointer compartment that edges start from. */
	| 'list-node'
	/** Null terminator: text only. */
	| 'null'
	/** Annotation such as "head": text only. */
	| 'label'

export interface SceneNode {
	/** Stable id; also the node's cell key for editing and its handle id for dragging. */
	key: string
	kind: NodeKind
	/** Centre, in shape space. */
	x: number
	y: number
	w: number
	h: number
	value: string
	/** List nodes: which side the pointer compartment is on, and its width. */
	pointer?: { side: 'left' | 'right'; width: number }
	editable: boolean
	draggable: boolean
}

export interface SceneEdge {
	key: string
	from: string
	to: string
	directed: boolean
	/** Start from the centre of the source's pointer compartment (a linked list's next pointer). */
	fromPointer?: boolean
	/** Weight or label, editable as cell `edge:<key>` when the shape supports it. */
	label?: string
}

export interface SceneMetrics {
	fontSize: number
	labelFontSize: number
	strokeWidth: number
}

export interface Scene {
	nodes: SceneNode[]
	edges: SceneEdge[]
	metrics: SceneMetrics
}

export const EDGE_CELL_PREFIX = 'edge:'

export function edgeCellKey(edgeKey: string) {
	return EDGE_CELL_PREFIX + edgeKey
}
