import { expect, test, type Page } from '@playwright/test'
import { arrayStep, CELL, menusClosed, open, rightClick, sketchArray, sketchGraph, withEditor } from './helpers'

const cellAt = (i: number): [number, number] => [300 + i * CELL, 200]
const cues = (page: Page, color?: string) => page.locator(color ? `[data-cue="${color}"]` : '[data-cue]')

/** Main menu > Colour-blind cues (a checkbox: it stays open, so close it). */
async function toggleCues(page: Page) {
	await menusClosed(page)
	await page.getByTestId('main-menu.button').click()
	await page.getByRole('menuitemcheckbox', { name: 'Colour-blind cues' }).click()
	await page.keyboard.press('Escape')
}

test.beforeEach(({ page }) => open(page))

test('off by default; on, every mark colour gets its shape, in the Mark menu too, and it is remembered', async ({ page }) => {
	await sketchArray(page, [300, 200], 4)
	await page.evaluate((marks) => {
		const e = window.editor!
		const s = e.getCurrentPageShapes().find((x) => x.type === 'array')!
		e.updateShape({ id: s.id, type: 'array', props: { marks } } as never)
	}, { 0: 'red', 1: 'orange', 2: 'green', 3: 'blue' })
	await expect(cues(page)).toHaveCount(0)
	await toggleCues(page)
	for (const color of ['red', 'orange', 'green', 'blue']) await expect(cues(page, color)).toHaveCount(1)
	// The Mark menu shows each colour's shape as its legend.
	await rightClick(page, cellAt(0))
	await page.getByTestId('context-menu-sub.drawds-mark-button').click()
	await expect(page.getByTestId('context-menu.mark-red')).toContainText('▲ Red')
	await expect(page.getByTestId('context-menu.mark-orange')).toContainText('◆ Orange')
	await page.keyboard.press('Escape')
	const svg = await withEditor(page, async (e) => (await e.getSvgString([...e.getCurrentPageShapeIds()]))?.svg ?? '')
	expect(svg).toContain('data-cue="green"')
	// A per-browser setting: still on after a reload (a new board's marks get shapes straight away).
	await page.reload()
	await page.waitForFunction(() => !!window.editor)
	expect(await page.evaluate(() => localStorage.getItem('drawds:colour-cues'))).toBe('on')
	await page.evaluate(() => void window.editor!.deleteShapes([...window.editor!.getCurrentPageShapeIds()]))
	await sketchArray(page, [300, 400], 2)
	await page.evaluate(() => {
		const e = window.editor!
		const s = e.getCurrentPageShapes().find((x) => x.type === 'array')!
		e.updateShape({ id: s.id, type: 'array', props: { marks: { 1: 'green' } } } as never)
	})
	await expect(cues(page, 'green')).toHaveCount(1)
	await toggleCues(page)
	await expect(cues(page)).toHaveCount(0)
})

test("an operation's highlights get shapes too, and marked edges a line pattern", async ({ page }) => {
	await toggleCues(page)
	await sketchArray(page, [300, 200], 4)
	await rightClick(page, cellAt(0))
	await page.getByTestId('context-menu-sub.drawds-array-steps-button').click()
	await arrayStep(page, 'array-bubble-sort')
	// Step 1 compares the first two values: both orange.
	await expect(cues(page, 'orange')).toHaveCount(2)
	await page.keyboard.press('Escape')
	await page.keyboard.press('Escape')
	await sketchGraph(page, [300, 450], 3, 3)
	const dashed = page.locator('.tl-shape path[stroke-dasharray]')
	await expect(dashed).toHaveCount(0)
	// Mark the first edge red (as pointing at it and pressing 1 would).
	await withEditor(page, (e) => {
		const s = e.getOnlySelectedShape()!
		const util = e.getShapeUtil(s) as unknown as { getScene(x: unknown): { edges: { key: string }[] } }
		e.updateShape({ id: s.id, type: s.type, props: { marks: { [`edge:${util.getScene(s).edges[0].key}`]: 'red' } } } as never)
	})
	await expect(dashed).toHaveCount(1)
})
