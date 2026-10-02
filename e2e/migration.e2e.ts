import { expect, test } from '@playwright/test'
import { open, sketchArray, withEditor } from './helpers'

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
