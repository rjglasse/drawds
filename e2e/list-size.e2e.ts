import { expect, test, type Page } from '@playwright/test'
import type { ListShapeProps } from '../src/shapes/list/list-shape-types'
import { nodeScreenPosition, open, rightClick, shapesOfType, sketchList, withEditor } from './helpers'

// Lecture 5: size kept in a field (O(1)) or counted (O(n)), the list's invariants, and the two bugs
// of forgetting the tail.

const list = async (page: Page) => (await shapesOfType<ListShapeProps>(page, 'linked-list'))[0].props
const caption = (page: Page) => page.getByTestId('play-caption')

async function listMenu(page: Page, key: string, submenu: 'steps' | 'show', item: string) {
	await rightClick(page, await nodeScreenPosition(page, key))
	await page.getByTestId(`context-menu-sub.drawds-list-${submenu}-button`).click()
	await page.getByTestId(`context-menu.${item}`).click()
}

async function stepToEnd(page: Page) {
	while (!(await page.getByTestId('play-done').count())) await page.keyboard.press('ArrowRight')
}

/** Where node `key` is on the page. */
const pageAt = (page: Page, key: string) =>
	page.evaluate((key) => {
		const editor = window.editor!
		const shape = editor.getCurrentPageShapes().find((s) => s.type === 'linked-list')!
		const util = editor.getShapeUtil(shape) as unknown as { getScene(s: unknown): { nodes: { key: string; x: number; y: number }[] } }
		const node = util.getScene(shape).nodes.find((n) => n.key === key)!
		return editor.getShapePageTransform(shape).applyToPoint(node)
	}, key)

test.beforeEach(({ page }) => open(page))

test('the size field: shown beside the head without moving the list, and kept by every insert as size++', async ({ page }) => {
	await sketchList(page, [200, 200], 3)
	const before = await pageAt(page, 'n0')
	await listMenu(page, 'n0', 'show', 'list-size-field')
	expect((await list(page)).showSize).toBe(true)
	expect(await pageAt(page, 'n0')).toEqual(before)
	await listMenu(page, 'n0', 'steps', 'list-insert-after')
	await stepToEnd(page)
	await expect(caption(page)).toHaveText('size++: size = 4. Every add and remove keeps it, so reading it is O(1)')
	await page.keyboard.press('Enter')
	expect((await list(page)).nodes).toHaveLength(4)
})

test('count the nodes: O(n) by walking; check the invariants: each O(1)', async ({ page }) => {
	await sketchList(page, [200, 200], 3)
	await listMenu(page, 'n0', 'steps', 'list-count')
	await stepToEnd(page)
	await expect(caption(page)).toHaveText('3 nodes, counted in 3 steps, one per node: O(n). A size field that every add and remove keeps would answer in O(1)')
	await page.keyboard.press('Enter')
	await listMenu(page, 'n0', 'steps', 'list-invariants')
	await expect(caption(page)).toHaveText('Invariant 1: the number of nodes == 0? No, it is 3: nothing to check here')
	await stepToEnd(page)
	await expect(caption(page)).toContainText('All hold. Each check looked only at the ends, O(1)')
})

test('forgetting the tail on the first insert: shown, and nothing kept', async ({ page }) => {
	await sketchList(page, [200, 200], 1)
	await page.getByTestId('style.list-variant.tail').click()
	await listMenu(page, 'n0', 'steps', 'list-delete')
	await page.keyboard.press('Enter')
	expect((await list(page)).nodes).toHaveLength(0)
	// The empty list's menu (right-click where the null is).
	await withEditor(page, (editor) => void editor.select(editor.getCurrentPageShapes().find((s) => s.type === 'linked-list')!.id))
	await listMenu(page, '#null', 'steps', 'list-insert-forget-tail')
	await stepToEnd(page)
	await expect(caption(page)).toContainText('Forgot tail = node:')
	await page.keyboard.press('Enter')
	expect((await list(page)).nodes).toHaveLength(0)
})
