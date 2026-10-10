import { expect, test } from '@playwright/test'
import { CELL, open, sketchArray, sketchGraph, sketchHeap, sketchList, sketchTree, withEditor } from './helpers'

test('arrays saved before fill modes existed still load', async ({ page }) => {
	await open(page)
	await sketchArray(page, [300, 200], 3)
	// Rewrite the document as the first release saved it: schema version 0, no fill or seed.
	const loaded = await withEditor(page, (editor) => {
		const doc = structuredClone(editor.getSnapshot().document)
		;(doc.schema as { sequences: Record<string, number> }).sequences['com.tldraw.shape.array'] = 0
		for (const record of Object.values(doc.store) as { typeName: string; type?: string; props?: Record<string, unknown> }[]) {
			if (record.typeName !== 'shape' || record.type !== 'array' || !record.props) continue
			delete record.props.fill
			delete record.props.seed
			record.props.values = ['3', '1', '4']
		}
		editor.loadSnapshot({ document: doc })
		return editor.getCurrentPageShapes().map((s) => s.props)
	})
	expect(loaded).toEqual([expect.objectContaining({ values: ['3', '1', '4'], fill: 'random', seed: 0 })])
})

test('lists, trees and arrays saved before marks existed still load', async ({ page }) => {
	await open(page)
	await sketchArray(page, [300, 200], 2)
	await sketchList(page, [300, 400], 2)
	await sketchTree(page, [800, 150], 2, 1)
	const loaded = await withEditor(page, (editor) => {
		const doc = structuredClone(editor.getSnapshot().document)
		const sequences = (doc.schema as { sequences: Record<string, number> }).sequences
		sequences['com.tldraw.shape.array'] = 1
		sequences['com.tldraw.shape.linked-list'] = 0
		sequences['com.tldraw.shape.binary-tree'] = 0
		for (const record of Object.values(doc.store) as { typeName: string; props?: Record<string, unknown> }[]) {
			if (record.typeName === 'shape' && record.props) delete record.props.marks
		}
		editor.loadSnapshot({ document: doc })
		return editor.getCurrentPageShapes().map((s) => [s.type, (s.props as { marks?: unknown }).marks])
	})
	expect(loaded.sort()).toEqual([
		['array', {}],
		['binary-tree', {}],
		['linked-list', {}],
	])
})

test('every structure saved before pointers existed still loads, with none', async ({ page }) => {
	await open(page)
	await sketchArray(page, [300, 200], 2)
	await sketchList(page, [300, 400], 2)
	await sketchTree(page, [800, 150], 2, 1)
	await sketchHeap(page, [800, 450], 3)
	await sketchGraph(page, [300, 600], 3)
	const loaded = await withEditor(page, (editor) => {
		const doc = structuredClone(editor.getSnapshot().document)
		const sequences = (doc.schema as { sequences: Record<string, number> }).sequences
		sequences['com.tldraw.shape.array'] = 2
		sequences['com.tldraw.shape.linked-list'] = 1
		sequences['com.tldraw.shape.binary-tree'] = 2
		sequences['com.tldraw.shape.heap'] = 0
		sequences['com.tldraw.shape.graph'] = 0
		for (const record of Object.values(doc.store) as { typeName: string; props?: Record<string, unknown> }[]) {
			if (record.typeName === 'shape' && record.props) delete record.props.pointers
		}
		editor.loadSnapshot({ document: doc })
		return editor.getCurrentPageShapes().map((s) => [s.type, (s.props as { pointers?: unknown }).pointers])
	})
	expect(loaded.sort()).toEqual([
		['array', []],
		['binary-tree', []],
		['graph', []],
		['heap', []],
		['linked-list', []],
	])
})

test('arrays saved before fixed capacity existed load as growing arrays, every value in use', async ({ page }) => {
	await open(page)
	await sketchArray(page, [300, 200], 3)
	const loaded = await withEditor(page, (editor) => {
		const doc = structuredClone(editor.getSnapshot().document)
		;(doc.schema as { sequences: Record<string, number> }).sequences['com.tldraw.shape.array'] = 3
		for (const record of Object.values(doc.store) as { typeName: string; type?: string; props?: Record<string, unknown> }[]) {
			if (record.typeName !== 'shape' || record.type !== 'array' || !record.props) continue
			delete record.props.sizing
			delete record.props.used
			record.props.values = ['3', '1', '4']
		}
		editor.loadSnapshot({ document: doc })
		return editor.getCurrentPageShapes().map((s) => s.props)
	})
	expect(loaded).toEqual([expect.objectContaining({ values: ['3', '1', '4'], sizing: 'grows', used: 3 })])
})

test('arrays saved before stacks and queues existed load as plain arrays', async ({ page }) => {
	await open(page)
	await sketchArray(page, [300, 200], 2)
	const loaded = await withEditor(page, (editor) => {
		const doc = structuredClone(editor.getSnapshot().document)
		;(doc.schema as { sequences: Record<string, number> }).sequences['com.tldraw.shape.array'] = 4
		for (const record of Object.values(doc.store) as { typeName: string; type?: string; props?: Record<string, unknown> }[]) {
			if (record.typeName !== 'shape' || record.type !== 'array' || !record.props) continue
			delete record.props.kind
			delete record.props.front
		}
		editor.loadSnapshot({ document: doc })
		return editor.getCurrentPageShapes().map((s) => s.props)
	})
	expect(loaded).toEqual([expect.objectContaining({ kind: 'array', front: 0 })])
})

test('lists saved before variants existed load singly linked, null-ended', async ({ page }) => {
	await open(page)
	await sketchList(page, [300, 200], 2)
	const loaded = await withEditor(page, (editor) => {
		const doc = structuredClone(editor.getSnapshot().document)
		;(doc.schema as { sequences: Record<string, number> }).sequences['com.tldraw.shape.linked-list'] = 2
		for (const record of Object.values(doc.store) as { typeName: string; type?: string; props?: Record<string, unknown> }[]) {
			if (record.typeName !== 'shape' || record.type !== 'linked-list' || !record.props) continue
			for (const key of ['links', 'tail', 'ends', 'sentinel', 'cycleTo']) delete record.props[key]
		}
		editor.loadSnapshot({ document: doc })
		return editor.getCurrentPageShapes().map((s) => s.props)
	})
	expect(loaded).toEqual([expect.objectContaining({ links: 'singly', tail: 'none', ends: 'null', sentinel: 'none', cycleTo: '' })])
})

test('lists saved before kinds existed load as plain lists', async ({ page }) => {
	await open(page)
	await sketchList(page, [300, 200], 2)
	const loaded = await withEditor(page, (editor) => {
		const doc = structuredClone(editor.getSnapshot().document)
		;(doc.schema as { sequences: Record<string, number> }).sequences['com.tldraw.shape.linked-list'] = 3
		for (const record of Object.values(doc.store) as { typeName: string; type?: string; props?: Record<string, unknown> }[]) {
			if (record.typeName === 'shape' && record.type === 'linked-list' && record.props) delete record.props.kind
		}
		editor.loadSnapshot({ document: doc })
		return editor.getCurrentPageShapes().map((s) => s.props)
	})
	expect(loaded).toEqual([expect.objectContaining({ kind: 'list' })])
})

test('matrices saved before labels existed load with their indices', async ({ page }) => {
	await open(page)
	await page.keyboard.press('Shift+M')
	await page.mouse.move(300, 200)
	await page.mouse.down()
	await page.mouse.move(300 + CELL + 10, 200 + CELL + 10, { steps: 10 })
	await page.mouse.up()
	const loaded = await withEditor(page, (editor) => {
		const doc = structuredClone(editor.getSnapshot().document)
		;(doc.schema as { sequences: Record<string, number> }).sequences['com.tldraw.shape.matrix'] = 0
		for (const record of Object.values(doc.store) as { typeName: string; type?: string; props?: Record<string, unknown> }[]) {
			if (record.typeName !== 'shape' || record.type !== 'matrix' || !record.props) continue
			delete record.props.rowLabels
			delete record.props.colLabels
		}
		editor.loadSnapshot({ document: doc })
		return editor.getCurrentPageShapes().map((s) => s.props)
	})
	expect(loaded).toEqual([expect.objectContaining({ rowLabels: [], colLabels: [] })])
	await expect(page.locator('[data-row-index="1"]')).toHaveText('1')
})

test('code boxes saved before they could follow a structure load as code of their own', async ({ page }) => {
	await open(page)
	const loaded = await withEditor(page, (editor) => {
		editor.createShape({ type: 'code', x: 200, y: 200, props: { code: 'x = 1', language: 'python' } } as never)
		const doc = structuredClone(editor.getSnapshot().document)
		;(doc.schema as { sequences: Record<string, number> }).sequences['com.tldraw.shape.code'] = 0
		for (const record of Object.values(doc.store) as { typeName: string; type?: string; props?: Record<string, unknown> }[]) {
			if (record.typeName !== 'shape' || record.type !== 'code' || !record.props) continue
			delete record.props.structureId
			delete record.props.algorithm
		}
		editor.loadSnapshot({ document: doc })
		return editor.getCurrentPageShapes().map((s) => s.props)
	})
	expect(loaded).toEqual([expect.objectContaining({ code: 'x = 1', structureId: '', algorithm: '' })])
	await expect(page.getByTestId('code-box')).toHaveCount(1)
})
