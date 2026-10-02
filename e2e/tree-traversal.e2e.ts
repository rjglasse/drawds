import { expect, test, type Page } from '@playwright/test'
import { compareKeys } from '../src/data/compare'
import type { HeapShapeProps } from '../src/shapes/heap/heap-shape-types'
import { traverseTree } from '../src/shapes/tree/traverse'
import type { TreeShapeProps } from '../src/shapes/tree/tree-shape-types'
import { nodeScreenPosition, open, shapesOfType, sketchHeap, sketchTree } from './helpers'

const tree = async (page: Page) => (await shapesOfType<TreeShapeProps>(page, 'binary-tree'))[0].props
const heap = async (page: Page) => (await shapesOfType<HeapShapeProps>(page, 'heap'))[0].props

/** Right-click a node: Traverse from ... > the order. */
async function traverseFrom(page: Page, key: string, item: string) {
	await page.mouse.click(...(await nodeScreenPosition(page, key)), { button: 'right' })
	await page.getByTestId('context-menu-sub.drawds-node-operations-0-button').click()
	await page.getByTestId(`context-menu.${item}`).click()
}

/** Pause, then step to the end, where the result is in and the bar waits. */
async function stepToEnd(page: Page) {
	await page.keyboard.press('Space')
	while (!(await page.getByTestId('play-done').count())) await page.keyboard.press('ArrowRight')
}

test.beforeEach(({ page }) => open(page))

test('in-order on a BST outputs the keys sorted, and says so', async ({ page }) => {
	await page.keyboard.press('Shift+T')
	await page.getByTestId('style.tree-kind.bst').click()
	await sketchTree(page, [600, 150], 3, 1)
	const { nodes } = await tree(page)
	await traverseFrom(page, 'n', 'tree-in-order')
	await expect(page.getByTestId('play-caption')).toContainText('its left subtree first')
	await stepToEnd(page)
	const sorted = nodes.map((n) => n.value).sort(compareKeys)
	await expect(page.getByTestId('play-caption')).toHaveText(
		`Done: in-order visits ${sorted.join(', ')}: sorted, as in-order on a BST always is`
	)
	await expect(page.getByTestId('playback-strip').filter({ hasText: 'in-order output' })).toHaveCount(1)
})

test('pre-order from a subtree visits just that subtree; Shift+Enter keeps it as marks', async ({ page }) => {
	await sketchTree(page, [600, 150], 3, 1)
	const { nodes } = await tree(page)
	const expected = traverseTree(nodes, 'nL', 'pre').visited
	await traverseFrom(page, 'nL', 'tree-pre-order')
	await page.keyboard.press('Shift+Enter')
	expect(Object.keys((await tree(page)).marks).sort()).toEqual([...expected].sort())
	expect(new Set(Object.values((await tree(page)).marks))).toEqual(new Set(['blue']))
})

test('level order of a heap is its array order, lit in both views', async ({ page }) => {
	await sketchHeap(page, [600, 150], 6)
	const { values } = await heap(page)
	await traverseFrom(page, '0', 'heap-level-order')
	await stepToEnd(page)
	await expect(page.getByTestId('play-caption')).toHaveText(
		`Done: level order visits ${values.join(', ')}. That is the heap's array, index by index`
	)
	await page.keyboard.press('Shift+Enter')
	expect(Object.keys((await heap(page)).marks).sort()).toEqual(values.map((_, i) => String(i)).sort())
})
