import { expect, test, type Page } from '@playwright/test'
import type { ArrayShapeProps } from '../src/shapes/array/array-shape-types'
import { CELL, open, shapesOfType } from './helpers'

const props = async (page: Page) => (await shapesOfType<ArrayShapeProps>(page, 'array'))[0].props

/** Pick a kind with the array tool, then sketch `n` cells from (x, y), dragging the given way. */
async function sketchKind(page: Page, kind: 'stack' | 'queue', [x, y]: [number, number], n: number, dir: 'up' | 'right' | 'down') {
	await page.keyboard.press('Shift+A')
	await page.getByTestId(`style.array-kind.${kind}`).click()
	const d = (n - 1) * CELL + 10
	const [dx, dy] = { up: [0, -d], right: [d, 0], down: [0, d] }[dir]
	await page.mouse.move(x, y)
	await page.mouse.down()
	await page.mouse.move(x + dx, y + dy, { steps: 20 })
	await page.mouse.up()
}

const pointerBox = (page: Page, name: string) => page.locator(`[data-pointer="${name}"]`).boundingBox()

test.beforeEach(({ page }) => open(page))

test('a stack stands upright, index 0 where the drag began, with top at its last value', async ({ page }) => {
	await sketchKind(page, 'stack', [300, 450], 4, 'up')
	const p = await props(page)
	expect(p.kind).toBe('stack')
	expect(p.values).toHaveLength(4)
	// The top marker is drawn by the cell at the top, highest up.
	const top = await pointerBox(page, 'top')
	expect(top!.y).toBeLessThan(450 - 2 * CELL)
	// Double-click index 0, at the bottom, where the drag started: it edits a[0].
	await page.mouse.dblclick(300, 450)
	await expect(page.locator('input[aria-label="Cell 0"]')).toBeFocused()
})

test('a stack sketched downwards still grows up from the press point', async ({ page }) => {
	await sketchKind(page, 'stack', [300, 300], 3, 'down')
	const [cell0, cell2] = await page.evaluate(() => {
		const editor = window.editor!
		const s = editor.getOnlySelectedShape()!
		const util = editor.getShapeUtil(s) as unknown as { cells: { cellBox(s: unknown, k: string): { x: number; y: number } } }
		return ['0', '2'].map((k) => editor.getShapePageTransform(s).applyToPoint(util.cells.cellBox(s, k)).y)
	})
	expect(cell2).toBeLessThan(cell0)
})

test('a fixed queue is a circular buffer: front and rear markers, spare slots blank; one undo back', async ({ page }) => {
	await sketchKind(page, 'queue', [300, 300], 5, 'right')
	await page.getByTestId('style.array-sizing.fixed').click()
	await page.evaluate(() => {
		const editor = window.editor!
		const s = editor.getOnlySelectedShape()!
		editor.updateShape({ id: s.id, type: 'array', props: { values: ['50', '', '20', '30', '40'], used: 4, front: 2 } } as never)
	})
	// front at index 2; rear wraps round to index 1, the next free slot (markers slide there).
	await page.waitForTimeout(400)
	const [front, rear] = [await pointerBox(page, 'front'), await pointerBox(page, 'rear')]
	expect(front!.x).toBeGreaterThan(rear!.x)
	expect(Math.round((front!.x - rear!.x) / CELL)).toBe(1)
	await expect(page.getByTestId('array-capacity')).toHaveText('size 4 · capacity 5')
	// Back to a plain growing array: unwrapped, front first.
	await page.getByTestId('style.array-kind.array').click()
	await page.getByTestId('style.array-sizing.grows').click()
	expect((await props(page)).values).toEqual(['20', '30', '40', '50'])
})
