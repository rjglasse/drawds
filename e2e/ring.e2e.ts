import { expect, test, type Page } from '@playwright/test'
import { open, rightClick, sketchArray, withEditor } from './helpers'

// A circular buffer as a ring beside it (dds-55z.31): the queue's cells round a circle, front and
// rear marching round, redrawn as the queue changes.

const rings = (page: Page) => withEditor(page, (editor) => editor.getCurrentPageShapes().filter((s) => s.type === 'ring-view').length)
/** The values the ring shows, by cell. */
const ringValues = (page: Page) =>
	page.locator('[data-ring-cell]').evaluateAll((els) => Object.fromEntries(els.map((e) => [e.getAttribute('data-ring-cell'), e.textContent])))

async function showRing(page: Page) {
	await rightClick(page, [200, 200])
	await page.getByTestId('context-menu-sub.drawds-array-show-button').click()
	await page.getByTestId('context-menu.array-ring').click()
}

test.beforeEach(({ page }) => open(page))

test('a fixed queue as a ring: its values round it, front and rear marking where they are; an enqueue lands in it', async ({ page }) => {
	await sketchArray(page, [200, 200], 6)
	// A circular buffer whose front has moved on: in use 4, 5, then round to 0.
	await page.evaluate(() => {
		const editor = window.editor!
		const [a] = editor.getCurrentPageShapes()
		editor.updateShape({ id: a.id, type: 'array', props: { kind: 'queue', sizing: 'fixed' } } as never)
		editor.updateShape({ id: a.id, type: 'array', props: { values: ['3', '', '', '', '8', '5'], used: 3, front: 4 } } as never)
		editor.select(a.id)
	})
	await showRing(page)
	await expect.poll(() => rings(page)).toBe(1)
	expect(await ringValues(page)).toEqual({ 0: '3', 4: '8', 5: '5' })
	await expect(page.locator('[data-ring-marker]')).toHaveText(['front', 'rear'])

	// Enqueue: the new value goes in at the rear, cell 1, round the ring.
	await page.getByTestId('queue-enqueue').click()
	await page.keyboard.press('Enter')
	const values = await withEditor(page, (editor) => (editor.getCurrentPageShapes().find((s) => s.type === 'array')!.props as { values: string[] }).values)
	await expect.poll(() => ringValues(page)).toEqual({ 0: '3', 1: values[1], 4: '8', 5: '5' })

	// Show > the ring again takes it away; undo brings it back.
	await showRing(page)
	await expect.poll(() => rings(page)).toBe(0)
	await page.keyboard.press('ControlOrMeta+z')
	await expect.poll(() => rings(page)).toBe(1)
})

test('only a queue with a fixed capacity is offered a ring', async ({ page }) => {
	await sketchArray(page, [200, 200], 4)
	await rightClick(page, [200, 200])
	await page.getByTestId('context-menu-sub.drawds-array-show-button').click()
	await expect(page.getByTestId('context-menu.array-indices')).toBeVisible()
	await expect(page.getByTestId('context-menu.array-ring')).toHaveCount(0)
})
