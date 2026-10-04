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
	/**
	 * List nodes: which side the next-pointer compartment is on, and its width; `back`: a doubly
	 * linked node's prev-pointer compartment too, on the other side.
	 */
	pointer?: { side: 'left' | 'right'; width: number; back?: boolean }
	editable: boolean
	draggable: boolean
	/** Drawn dashed and unfilled: a list's sentinel (dummy) node. */
	ghost?: boolean
}

export interface SceneEdge {
	key: string
	from: string
	to: string
	directed: boolean
	/**
	 * Start from the centre of the source's pointer compartment: its next pointer (true), or a doubly
	 * linked node's prev pointer.
	 */
	fromPointer?: boolean | 'prev'
	/**
	 * Shift a pointer arrow sideways, to the left of its direction, by this fraction of the source
	 * node's height: a doubly linked list's next and prev arrows run as two parallel lanes.
	 */
	lane?: number
	/** Corners to route through (layout coordinates): an arrow looping round the list back to its head. */
	via?: { x: number; y: number }[]
	/** Weight or label, editable as cell `edge:<key>` when the shape supports it. */
	label?: string
	/** Curve the edge by this fraction of its length (to the left of its direction; negative: right). */
	bend?: number
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

/** The scene moved by `d` (edges follow their nodes, and their corners). */
export function translateScene(scene: Scene, d: { x: number; y: number }): Scene {
	if (!d.x && !d.y) return scene
	return {
		...scene,
		nodes: scene.nodes.map((n) => ({ ...n, x: n.x + d.x, y: n.y + d.y })),
		edges: scene.edges.map((e) => (e.via ? { ...e, via: e.via.map((p) => ({ x: p.x + d.x, y: p.y + d.y })) } : e)),
	}
}

export const EDGE_CELL_PREFIX = 'edge:'

export function edgeCellKey(edgeKey: string) {
	return EDGE_CELL_PREFIX + edgeKey
}
