import type { TLShape, TLShapePartial } from 'tldraw'
import { describe, expect, it } from 'vitest'
import type { Scene, SceneNode } from './scene'
import { sceneCells } from './scene-cells'

const node = (key: string, x: number, y: number, extra: Partial<SceneNode> = {}): SceneNode => ({
	key,
	kind: 'circle',
	x,
	y,
	w: 40,
	h: 40,
	value: key.toUpperCase(),
	editable: true,
	draggable: true,
	...extra,
})

const scene: Scene = {
	nodes: [node('a', 0, 0), node('b', 100, 0), node('c', 0, 100), node('lbl', -60, 0, { kind: 'label', editable: false })],
	edges: [
		{ key: 'ab', from: 'a', to: 'b', directed: false, label: '7' },
		{ key: 'ac', from: 'a', to: 'c', directed: false },
	],
	metrics: { fontSize: 20, labelFontSize: 14, strokeWidth: 2 },
}

const shape = { id: 'shape:g', type: 'graph' } as unknown as TLShape
const updates: string[] = []
const host = {
	getScene: () => scene,
	setNodeValue: (_: TLShape, key: string, value: string) => {
		updates.push(`node ${key}=${value}`)
		return { id: shape.id, type: shape.type } as TLShapePartial
	},
	setEdgeLabel: (_: TLShape, key: string, label: string) => {
		updates.push(`edge ${key}=${label}`)
		return { id: shape.id, type: shape.type } as TLShapePartial
	},
}
const cells = sceneCells(host)

describe('sceneCells', () => {
	it('hits nodes by their outline and edge labels by their box', () => {
		expect(cells.cellAt(shape, { x: 5, y: 5 })).toBe('a')
		expect(cells.cellAt(shape, { x: 50, y: 0 })).toBe('edge:ab')
		expect(cells.cellAt(shape, { x: 0, y: 50 })).toBeUndefined()
		expect(cells.cellAt(shape, { x: -60, y: 0 })).toBeUndefined()
	})

	it('reads values and gives circle nodes a round box', () => {
		expect(cells.getValue(shape, 'b')).toBe('B')
		expect(cells.getValue(shape, 'edge:ab')).toBe('7')
		expect(cells.cellBox(shape, 'a')).toMatchObject({ x: -20, y: -20, w: 40, h: 40, round: true })
	})

	it('routes writes to node values or edge labels', () => {
		cells.setValue(shape, 'b', '42')
		cells.setValue(shape, 'edge:ab', '9')
		expect(updates).toEqual(['node b=42', 'edge ab=9'])
	})

	it('tabs through nodes then edge labels, and moves spatially with arrows', () => {
		expect(cells.firstCell(shape)).toBe('a')
		expect(cells.neighbor(shape, 'a', 'next')).toBe('b')
		expect(cells.neighbor(shape, 'c', 'next')).toBe('edge:ab')
		expect(cells.neighbor(shape, 'edge:ab', 'next')).toBeUndefined()
		expect(cells.neighbor(shape, 'a', 'down')).toBe('c')
		expect(cells.neighbor(shape, 'c', 'up')).toBe('a')
	})

	it('treats edge labels as read-only without setEdgeLabel', () => {
		const readOnly = sceneCells({ getScene: host.getScene, setNodeValue: host.setNodeValue })
		expect(readOnly.cellAt(shape, { x: 50, y: 0 })).toBeUndefined()
		expect(readOnly.neighbor(shape, 'c', 'next')).toBeUndefined()
	})
})
