import { expect, test, type Page } from '@playwright/test'
import type { ListShapeProps } from '../src/shapes/list/list-shape-types'
import { nodeScreenPosition, open, rightClick, shapesOfType, sketchList } from './helpers'

const list = async (page: Page) => (await shapesOfType<ListShapeProps>(page, 'linked-list'))[0].props
const values = async (page: Page) => (await list(page)).nodes.map((n) => n.value)
const caption = (page: Page) => page.getByTestId('play-caption')

/** Right-click a node: Step by step > the operation. */
async function listOp(page: Page, key: string, item: string) {
	await rightClick(page, await nodeScreenPosition(page, key))
	await page.getByTestId('context-menu-sub.drawds-list-steps-button').click()
	await page.getByTestId(`context-menu.${item}`).click()
}

/** Step to the end (operations open paused), where the result is in and the bar waits. */
async function stepToEnd(page: Page) {
	while (!(await page.getByTestId('play-done').count())) await page.keyboard.press('ArrowRight')
}

test.beforeEach(({ page }) => open(page))

test("find is lecture 5's indexOf: the code beside the list, curr by its node's value and i as it walks", async ({ page }) => {
	await sketchList(page, [200, 200], 4)
	const { nodes } = await list(page)
	await listOp(page, 'n2', 'list-find')
	await page.getByTestId('play-code').click()
	await page.keyboard.press('ArrowRight')
	const shown = () => page.locator('[data-value-line]').allTextContents()
	await expect.poll(shown).toEqual([`value = ${nodes[2].value}`, `curr = ${nodes[1].value}`, 'i = 1'])
	await expect(page.getByTestId('play-counts')).toHaveText('nodes visited 2')
	await stepToEnd(page)
	await expect(page.locator('[data-step-line]')).toHaveCount(1)
	expect(await page.locator(`[data-code-line="${await page.locator('[data-step-line]').getAttribute('data-step-line')}"]`).textContent()).toContain('return i')
})

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
	while (!(await caption(page).textContent())?.startsWith('head = prev')) await page.keyboard.press('ArrowRight')
	await stepToEnd(page)
	await expect(caption(page)).toHaveText('Tidied up: the same links, drawn in a line')
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

test('insert at the head ends on the tidied list: nothing moves when the result goes in or the bar closes', async ({ page }) => {
	await sketchList(page, [200, 200], 3)
	await listOp(page, 'n0', 'list-insert-head')
	// Where the old head and the new node are on screen, as drawn now (a step, or the committed list).
	const shown = () =>
		page.evaluate(() => {
			const e = window.editor!
			const shape = e.getOnlySelectedShape()!
			const util = e.getShapeUtil(shape) as unknown as { displayScene(s: unknown): { nodes: { key: string; x: number; y: number }[] } }
			const nodes = util.displayScene(shape).nodes
			return ['n0', 'n3'].map((key) => {
				const p = e.pageToScreen(e.getShapePageTransform(shape).applyToPoint(nodes.find((n) => n.key === key)!))
				return [Math.round(p.x), Math.round(p.y)]
			})
		})
	const bar = async () => (await page.getByTestId('play-bar').boundingBox())!.x
	while ((await caption(page).textContent()) !== 'Tidied up: the same links, drawn in a line') await page.keyboard.press('ArrowRight')
	const [before, barBefore] = [await shown(), await bar()]
	await page.keyboard.press('ArrowRight')
	await expect(page.getByTestId('play-done')).toBeVisible()
	expect(await values(page)).toHaveLength(4)
	expect(await shown()).toEqual(before)
	expect(Math.abs((await bar()) - barBefore)).toBeLessThan(1)
	await page.keyboard.press('Enter')
	await expect(page.getByTestId('play-bar')).toHaveCount(0)
	expect(await shown()).toEqual(before)
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

test("Floyd: slow and fast meet in a cycle, then find where it starts; without one fast runs off the end", async ({ page }) => {
	await sketchList(page, [150, 200], 5)
	await setValues(page, ['10', '20', '30', '40', '50'])
	await listOp(page, 'n0', 'list-floyd')
	await stepToEnd(page)
	await expect(caption(page)).toHaveText('fast.next is null: fast can\'t take two more steps, so it ran off the end: no cycle')
	await page.keyboard.press('Enter')
	await setVariants(page, { cycleTo: 'n1' })
	await listOp(page, 'n0', 'list-floyd')
	await stepToEnd(page)
	await expect(caption(page)).toContainText('They meet at 20: the cycle starts here')
	await page.keyboard.press('Enter')
	expect(await values(page)).toEqual(['10', '20', '30', '40', '50'])
})
