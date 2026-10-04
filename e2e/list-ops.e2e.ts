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

/** Give the list known values. */
async function setValues(page: Page, values: string[]) {
	await page.evaluate((values) => {
		const editor = window.editor!
		const shape = editor.getCurrentPageShapes().find((s) => s.type === 'linked-list')! as unknown as {
			id: never
			props: { nodes: { value: string }[] }
		}
		editor.updateShape({ id: shape.id, type: 'linked-list', props: { nodes: shape.props.nodes.map((n, i) => ({ ...n, value: values[i] })) } } as never)
	}, values)
}

test('find the middle: slow takes one step for every two of fast', async ({ page }) => {
	await sketchList(page, [200, 200], 5)
	await setValues(page, ['10', '20', '30', '40', '50'])
	await listOp(page, 'n0', 'list-middle')
	await expect(caption(page)).toHaveText('slow = head, fast = head')
	await page.keyboard.press('ArrowRight')
	await expect(caption(page)).toHaveText('slow = slow.next (20), fast = fast.next.next (30)')
	await stepToEnd(page)
	await expect(caption(page)).toContainText('so slow is at the middle: 30')
})

test('insert in order: walk to the place, then link the node in; the list stays sorted', async ({ page }) => {
	await sketchList(page, [200, 200], 4)
	await setValues(page, ['10', '20', '30', '40'])
	await listOp(page, 'n0', 'list-insert-sorted')
	await page.getByTestId('key-prompt').fill('25')
	await page.keyboard.press('Enter')
	await stepToEnd(page)
	expect(await values(page)).toEqual(['10', '20', '25', '30', '40'])
})

test('insert at the head: the step on screen and the bar hold still when the result goes in', async ({ page }) => {
	await sketchList(page, [200, 200], 3)
	await listOp(page, 'n0', 'list-insert-head')
	// The step shown, as drawn (a frame, not the committed layout): where the old head is on screen.
	const shown = () =>
		page.evaluate(() => {
			const e = window.editor!
			const shape = e.getOnlySelectedShape()!
			const util = e.getShapeUtil(shape) as unknown as { displayScene(s: unknown): { nodes: { key: string; x: number; y: number }[] } }
			const n0 = util.displayScene(shape).nodes.find((n) => n.key === 'n0')!
			const p = e.pageToScreen(e.getShapePageTransform(shape).applyToPoint(n0))
			return [p.x, p.y]
		})
	const bar = async () => (await page.getByTestId('play-bar').boundingBox())!.x
	while (!(await caption(page).textContent())?.startsWith('head = node')) await page.keyboard.press('ArrowRight')
	const [before, barBefore] = [await shown(), await bar()]
	await page.keyboard.press('ArrowRight')
	await expect(page.getByTestId('play-done')).toBeVisible()
	expect(await values(page)).toHaveLength(4)
	const after = await shown()
	after.forEach((v, i) => expect(Math.abs(v - before[i])).toBeLessThan(1))
	expect(Math.abs((await bar()) - barBefore)).toBeLessThan(1)
})

/** Switch list variants on the selected list. */
async function setVariants(page: Page, variants: Partial<ListShapeProps>) {
	await page.evaluate((variants) => {
		const editor = window.editor!
		const shape = editor.getCurrentPageShapes().find((s) => s.type === 'linked-list')!
		editor.updateShape({ id: shape.id, type: 'linked-list', props: variants } as never)
	}, variants)
}

test('append: without a tail curr walks to the end, counted; with one, no walk', async ({ page }) => {
	await sketchList(page, [200, 200], 3)
	await setValues(page, ['10', '20', '30'])
	await listOp(page, 'n0', 'list-append')
	await stepToEnd(page)
	await expect(page.getByTestId('play-counts')).toHaveText('steps 2')
	await expect(caption(page)).toContainText('O(n)')
	await page.keyboard.press('Enter')
	expect(await values(page)).toHaveLength(4)
	await setVariants(page, { tail: 'tail' })
	await listOp(page, 'n0', 'list-append')
	await expect(caption(page)).toHaveText('tail is at the last node, ' + (await values(page))[3] + ': no walk needed')
	await stepToEnd(page)
	await expect(page.getByTestId('play-counts')).toHaveText('steps 0')
	await expect(caption(page)).toContainText('O(1)')
	await page.keyboard.press('Enter')
	expect(await values(page)).toHaveLength(5)
})

test('print a circular list with a do-while; print a doubly linked one backwards', async ({ page }) => {
	await sketchList(page, [200, 200], 3)
	await setValues(page, ['10', '20', '30'])
	await setVariants(page, { ends: 'circular', links: 'doubly' })
	await listOp(page, 'n0', 'list-print')
	await expect(caption(page)).toContainText('do {')
	await stepToEnd(page)
	await expect(caption(page)).toHaveText('print 30; curr = curr.next: the head again, so stop')
	await page.keyboard.press('Enter')
	await listOp(page, 'n0', 'list-print-back')
	await stepToEnd(page)
	await expect(caption(page)).toHaveText('print 10; curr = curr.prev: 30 again, so stop')
	await page.keyboard.press('Enter')
	expect(await values(page)).toEqual(['10', '20', '30'])
})
