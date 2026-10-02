import { expect, test, type Page } from '@playwright/test'
import type { ListShapeProps } from '../src/shapes/list/list-shape-types'
import { nodeScreenPosition, open, shapesOfType, sketchList } from './helpers'

const list = async (page: Page) => (await shapesOfType<ListShapeProps>(page, 'linked-list'))[0].props
const values = async (page: Page) => (await list(page)).nodes.map((n) => n.value)
const caption = (page: Page) => page.getByTestId('play-caption')

/** Right-click a node: Step by step > the operation. */
async function listOp(page: Page, key: string, item: string) {
	await page.mouse.click(...(await nodeScreenPosition(page, key)), { button: 'right' })
	await page.getByTestId('context-menu-sub.drawds-node-operations-0-button').click()
	await page.getByTestId(`context-menu.${item}`).click()
}

/** Step to the end (operations open paused), where the result is in and the bar waits. */
async function stepToEnd(page: Page) {
	while (!(await page.getByTestId('play-done').count())) await page.keyboard.press('ArrowRight')
}

test.beforeEach(({ page }) => open(page))

test('find: curr walks from the head to the value; nothing changes', async ({ page }) => {
	await sketchList(page, [200, 200], 4)
	const before = await list(page)
	const target = before.nodes[2].value
	await listOp(page, 'n2', 'list-find')
	await expect(caption(page)).toHaveText(`curr = head (${before.nodes[0].value}). Is it ${target}?`)
	await stepToEnd(page)
	await expect(caption(page)).toHaveText(`Yes: ${target} is node 3 from the head`)
	await page.keyboard.press('Enter')
	expect(await list(page)).toEqual(before)
})

test('find a missing value: curr walks off the end to null', async ({ page }) => {
	await sketchList(page, [200, 200], 3)
	await listOp(page, 'n0', 'list-find-value')
	await page.getByTestId('key-prompt').fill('abc')
	await page.keyboard.press('Enter')
	await stepToEnd(page)
	await expect(caption(page)).toContainText('null. abc is not in the list')
})

test('insert after a node: the node lands there after the two assignments; one undo', async ({ page }) => {
	await sketchList(page, [200, 200], 3)
	const before = await values(page)
	await listOp(page, 'n0', 'list-insert-after')
	await page.keyboard.press('ArrowRight')
	await expect(caption(page)).toContainText('node = new Node(')
	await page.keyboard.press('ArrowRight')
	await expect(caption(page)).toContainText('node.next = curr.next')
	await page.keyboard.press('ArrowRight')
	await expect(caption(page)).toContainText('curr.next = node')
	await stepToEnd(page)
	const after = await values(page)
	expect(after).toHaveLength(4)
	expect([after[0], ...after.slice(2)]).toEqual(before)
	await page.keyboard.press('Escape')
	await page.keyboard.press('ControlOrMeta+z')
	expect(await values(page)).toEqual(before)
})

test('delete a node: prev.next = curr.next, then it is gone', async ({ page }) => {
	await sketchList(page, [200, 200], 4)
	const before = await values(page)
	await listOp(page, 'n2', 'list-delete')
	await stepToEnd(page)
	expect(await values(page)).toEqual([before[0], before[1], before[3]])
})

test('reverse: every arrow turned, the list drawn the other way, nodes where they were', async ({ page }) => {
	await sketchList(page, [200, 200], 4)
	const before = await values(page)
	const at = await Promise.all(['n0', 'n3'].map((k) => nodeScreenPosition(page, k)))
	await listOp(page, 'n0', 'list-reverse')
	await stepToEnd(page)
	await expect(caption(page)).toContainText('head = prev')
	await page.keyboard.press('Enter')
	const after = await list(page)
	expect(after.nodes.map((n) => n.value)).toEqual([...before].reverse())
	expect(after.direction).toBe('left')
	const now = await Promise.all(['n0', 'n3'].map((k) => nodeScreenPosition(page, k)))
	now.forEach((p, i) => p.forEach((v, j) => expect(Math.abs(v - at[i][j])).toBeLessThan(1)))
})
