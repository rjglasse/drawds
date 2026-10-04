import { expect, test, type Page } from '@playwright/test'
import type { ListShapeProps } from '../src/shapes/list/list-shape-types'
import { open, shapesOfType, sketchList, withEditor } from './helpers'

const list = async (page: Page) => (await shapesOfType<ListShapeProps>(page, 'linked-list'))[0].props
const values = async (page: Page) => (await list(page)).nodes.map((n) => n.value)
const caption = (page: Page) => page.getByTestId('play-caption')
const labels = (page: Page) =>
	withEditor(page, (editor) => {
		const s = editor.getOnlySelectedShape()!
		const u = editor.getShapeUtil(s) as unknown as { getScene(x: unknown): { nodes: { key: string; value: string }[] } }
		return u.getScene(s).nodes.filter((n) => n.key === '#head' || n.key === '#tail').map((n) => n.value)
	})

/** Press an on-canvas button, step to the end, and close the bar. */
async function run(page: Page, button: string) {
	await page.getByTestId(button).click()
	while (!(await page.getByTestId('play-done').count())) await page.keyboard.press('ArrowRight')
	await page.keyboard.press('Enter')
	await expect(page.getByTestId('play-bar')).toHaveCount(0)
}

test.beforeEach(({ page }) => open(page))

test('the Kind picker makes a list a stack (top) or a queue (front and rear); list-only toggles go', async ({ page }) => {
	await sketchList(page, [200, 200], 3)
	await page.getByTestId('style.list-kind.stack').click()
	expect((await list(page)).kind).toBe('stack')
	expect(await labels(page)).toEqual(['top'])
	await expect(page.getByTestId('style.list-variant.circular')).toHaveCount(0)
	await expect(page.getByTestId('style.list-variant.sentinel')).toHaveCount(0)
	await expect(page.getByTestId('style.list-variant.tail')).toBeVisible()
	await page.getByTestId('style.list-kind.queue').click()
	expect(await labels(page)).toEqual(['front', 'rear'])
	await expect(page.getByTestId('style.list-variant.tail')).toHaveCount(0)
	// A stack or queue only changes at its ends: no x on the nodes, no + on the arrows.
	await expect(page.locator('[data-testid^="remove-node-"]')).toHaveCount(0)
	await page.getByTestId('style.list-kind.list').click()
	expect(await labels(page)).toEqual(['head'])
})

test('a linked stack pops down to empty (top = null) and pushes back up', async ({ page }) => {
	await sketchList(page, [200, 200], 2)
	await page.getByTestId('style.list-kind.stack').click()
	const [, second] = await values(page)
	await run(page, 'stack-pop')
	expect(await values(page)).toEqual([second])
	await page.getByTestId('stack-pop').click()
	await page.keyboard.press('ArrowRight')
	await expect(caption(page)).toHaveText('top = top.next: null, so the stack is empty now')
	while (!(await page.getByTestId('play-done').count())) await page.keyboard.press('ArrowRight')
	await page.keyboard.press('Enter')
	expect(await values(page)).toEqual([])
	await expect(page.getByTestId('stack-pop')).toHaveCount(0)
	await run(page, 'stack-push')
	await run(page, 'stack-push')
	expect(await values(page)).toHaveLength(2)
	await page.keyboard.press('ControlOrMeta+z')
	expect(await values(page)).toHaveLength(1)
})

test('a linked queue: dequeuing the last node sets rear = null too; enqueuing into it sets front and rear', async ({ page }) => {
	await sketchList(page, [200, 200], 1)
	await page.getByTestId('style.list-kind.queue').click()
	await page.getByTestId('queue-dequeue').click()
	while (!(await caption(page).textContent())?.startsWith('front is null')) await page.keyboard.press('ArrowRight')
	await expect(caption(page)).toContainText('so rear = null too')
	while (!(await page.getByTestId('play-done').count())) await page.keyboard.press('ArrowRight')
	await page.keyboard.press('Enter')
	expect(await values(page)).toEqual([])
	await page.getByTestId('queue-enqueue').click()
	await page.keyboard.press('ArrowRight')
	await expect(caption(page)).toHaveText('rear is null, so the queue is empty: front = node')
	while (!(await page.getByTestId('play-done').count())) await page.keyboard.press('ArrowRight')
	await page.keyboard.press('Enter')
	await run(page, 'queue-enqueue')
	const now = await values(page)
	expect(now).toHaveLength(2)
	await run(page, 'queue-dequeue')
	expect(await values(page)).toEqual([now[1]])
})
