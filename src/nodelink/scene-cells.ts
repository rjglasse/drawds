import type { TLShape, TLShapePartial } from 'tldraw'
import type { CellBox, CellKey, EditableCells } from '../cells/editable-cells'
import { boxContains, labelBox, nodeContains, routeScene, spatialNeighbor, valueBox, type Point } from './geometry'
import { EDGE_CELL_PREFIX, edgeCellKey, type Scene } from './scene'

export interface SceneCellsHost<S extends TLShape> {
	getScene(shape: S): Scene
	setNodeValue(shape: S, key: string, value: string): TLShapePartial<S>
	/** Omit to keep edge labels read-only. */
	setEdgeLabel?(shape: S, key: string, label: string): TLShapePartial<S>
}

interface SceneCell extends Point {
	key: CellKey
	box: CellBox
	value: string
}

/** Editable cells in reading order: nodes as the scene lists them, then edge labels. */
function sceneCellList<S extends TLShape>(host: SceneCellsHost<S>, shape: S): SceneCell[] {
	const scene = host.getScene(shape)
	const cells: SceneCell[] = scene.nodes
		.filter((n) => n.editable)
		.map((n) => ({ key: n.key, x: n.x, y: n.y, value: n.value, box: { ...valueBox(n), round: n.kind === 'circle' } }))
	if (host.setEdgeLabel) {
		const routes = routeScene(scene)
		for (const edge of scene.edges) {
			const route = routes.get(edge.key)
			if (edge.label === undefined || !route) continue
			const box = labelBox(route.labelAt, edge.label, scene.metrics.labelFontSize)
			cells.push({ key: edgeCellKey(edge.key), ...route.labelAt, value: edge.label, box })
		}
	}
	return cells
}

/** Cell editing for any node-link shape, derived from its scene. Node keys are node ids. */
export function sceneCells<S extends TLShape>(host: SceneCellsHost<S>): EditableCells<S> {
	const find = (shape: S, key: CellKey) => sceneCellList(host, shape).find((c) => c.key === key)
	return {
		cellAt(shape, point) {
			const scene = host.getScene(shape)
			const node = scene.nodes.find((n) => n.editable && nodeContains(n, point))
			if (node) return node.key
			return sceneCellList(host, shape).find((c) => c.key.startsWith(EDGE_CELL_PREFIX) && boxContains(c.box, point))
				?.key
		},
		firstCell(shape) {
			return sceneCellList(host, shape)[0]?.key
		},
		cellBox(shape, key) {
			return find(shape, key)?.box ?? { x: 0, y: 0, w: 0, h: 0 }
		},
		getValue(shape, key) {
			return find(shape, key)?.value ?? ''
		},
		setValue(shape, key, value) {
			if (key.startsWith(EDGE_CELL_PREFIX) && host.setEdgeLabel) {
				return host.setEdgeLabel(shape, key.slice(EDGE_CELL_PREFIX.length), value)
			}
			return host.setNodeValue(shape, key, value)
		},
		neighbor(shape, key, direction) {
			const cells = sceneCellList(host, shape)
			const i = cells.findIndex((c) => c.key === key)
			if (i < 0) return undefined
			if (direction === 'next') return cells[i + 1]?.key
			if (direction === 'prev') return cells[i - 1]?.key
			return spatialNeighbor(cells[i], cells, direction)?.key
		},
	}
}
