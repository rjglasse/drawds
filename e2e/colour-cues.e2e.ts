import { expect, test, type Page } from '@playwright/test'
import { CELL, menusClosed, open, rightClick, sketchArray, sketchGraph, withEditor } from './helpers'

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
	for (const [i, key] of ['1', '2', '3', '4'].entries()) {
		await page.mouse.move(...cellAt(i))
		await page.keyboard.press(key)
	}
	await expect(cues(page)).toHaveCount(0)
	await toggleCues(page)
	for (const color of ['red', 'orange', 'green', 'blue']) await expect(cues(page, color)).toHaveCount(1)
	// The Mark menu shows each colour's shape as its legend.
	await rightClick(page, cellAt(0))
	await page.getByTestId('context-menu-sub.drawds-mark-button').click()
	await expect(page.getByTestId('context-menu.mark-red')).toContainText('▲ Red')
	await expect(page.getByTestId('context-menu.mark-orange')).toContainText('◆ Orange')
	await page.keyboard.press('Escape')
	// A per-browser setting: still on after a reload.
	await page.reload()
	await page.waitForFunction(() => !!window.editor)
	await expect(cues(page)).toHaveCount(4)
	const svg = await withEditor(page, async (e) => (await e.getSvgString([...e.getCurrentPageShapeIds()]))?.svg ?? '')
	expect(svg).toContain('data-cue="green"')
	await toggleCues(page)
	await expect(cues(page)).toHaveCount(0)
})

test("an operation's highlights get shapes too, and marked edges a line pattern", async ({ page }) => {
	await toggleCues(page)
	await sketchArray(page, [300, 200], 4)
	await rightClick(page, cellAt(0))
	await page.getByTestId('context-menu-sub.drawds-array-steps-button').click()
	await page.getByTestId('context-menu.array-bubble-sort').click()
	// Step 1 compares the first two values: both orange.
	await expect(cues(page, 'orange')).toHaveCount(2)
	await page.keyboard.press('Escape')
	await page.keyboard.press('Escape')
	await sketchGraph(page, [300, 450], 3, 3)
	// Mark the first edge red, half-way between its nodes.
	const mid = await withEditor(page, (e) => {
		const s = e.getOnlySelectedShape()!
		const util = e.getShapeUtil(s) as unknown as { getScene(x: unknown): { nodes: { key: string; x: number; y: number }[]; edges: { key: string; from: string; to: string }[] } }
		const scene = util.getScene(s)
		const edge = scene.edges[0]
		const [a, b] = [edge.from, edge.to].map((k) => scene.nodes.find((n) => n.key === k)!)
		const p = e.pageToScreen(e.getShapePageTransform(s).applyToPoint({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }))
		return [p.x, p.y] as [number, number]
	})
	const dashed = page.locator('.tl-shape path[stroke-dasharray]')
	await expect(dashed).toHaveCount(0)
	await page.mouse.move(...mid)
	await page.keyboard.press('1')
	await expect(dashed).toHaveCount(1)
})
