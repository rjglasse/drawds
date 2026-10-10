import { expect, test, type Page } from '@playwright/test'
import type { TreeShapeProps } from '../src/shapes/tree/tree-shape-types'
import { nodeScreenPosition, open, rightClick, shapesOfType, sketchHeap, sketchTree } from './helpers'

// Lecture 8a's terms beside a tree or a heap: root, internal, leaf, depths, heights.

const pageAt = (page: Page, type: string, key: string) =>
	page.evaluate(
		([type, key]) => {
			const editor = window.editor!
			const shape = editor.getCurrentPageShapes().find((s) => s.type === type)!
			const util = editor.getShapeUtil(shape) as unknown as { getScene(s: unknown): { nodes: { key: string; x: number; y: number }[] } }
			const node = util.getScene(shape).nodes.find((n) => n.key === key)!
			const p = editor.getShapePageTransform(shape).applyToPoint(node)
			return [Math.round(p.x), Math.round(p.y)]
		},
		[type, key]
	)

test.beforeEach(({ page }) => open(page))

test('Show > tree terms: depths, a legend and a summary beside the tree, which stays put; again hides them', async ({ page }) => {
	await sketchTree(page, [400, 200], 3, 1)
	const root = await pageAt(page, 'binary-tree', 'n')
	await rightClick(page, await nodeScreenPosition(page, 'n'))
	await page.getByTestId('context-menu-sub.drawds-tree-show-button').click()
	await page.getByTestId('context-menu.tree-terms').click()
	expect((await shapesOfType<TreeShapeProps>(page, 'binary-tree'))[0].props.terms).toBe(true)
	await expect(page.getByText('depth 2', { exact: true })).toHaveCount(1)
	await expect(page.getByText('badge: height')).toHaveCount(1)
	await expect(page.getByText('7 nodes: the root, 2 internal, 4 leaves. Height 2 (edges down, a leaf 0), or 3 counting levels')).toHaveCount(1)
	expect(await pageAt(page, 'binary-tree', 'n')).toEqual(root)
	await rightClick(page, await nodeScreenPosition(page, 'n'))
	await page.getByTestId('context-menu-sub.drawds-tree-show-button').click()
	await expect(page.getByTestId('context-menu.tree-terms')).toHaveText('Hide the tree terms')
	await page.getByTestId('context-menu.tree-terms').click()
	await expect(page.getByText('depth 2', { exact: true })).toHaveCount(0)
})

test("a heap's tree gets them too", async ({ page }) => {
	await sketchHeap(page, [400, 200], 6)
	await rightClick(page, await nodeScreenPosition(page, '0'))
	await page.getByTestId('context-menu-sub.drawds-heap-show-button').click()
	await page.getByTestId('context-menu.heap-terms').click()
	await expect(page.getByText('6 nodes: the root, 2 internal, 3 leaves. Height 2 (edges down, a leaf 0), or 3 counting levels')).toHaveCount(1)
})
