import { expect, test, type Page } from '@playwright/test'
import type { ArrayShapeProps } from '../src/shapes/array/array-shape-types'
import { CELL, handlePosition, open, shapesOfType, sketchArray } from './helpers'

const props = async (page: Page) => (await shapesOfType<ArrayShapeProps>(page, 'array'))[0].props

/** Sketch an array at (200, 200), make it fixed, and drag the grip to `capacity` cells. */
async function fixedArray(page: Page, used: number, capacity: number) {
	await sketchArray(page, [200, 200], used)
	await page.getByTestId('style.array-sizing.fixed').click()
	if (capacity > used) {
		const [x, y] = await handlePosition(page, 'grow')
		await page.mouse.move(x, y)
		await page.mouse.down()
		await page.mouse.move(x + (capacity - used) * CELL, y, { steps: 10 })
		await page.mouse.up()
	}
}

test.beforeEach(({ page }) => open(page))

test('fixed capacity: the grip adds blank spare slots; size and capacity are shown', async ({ page }) => {
	await fixedArray(page, 3, 6)
	const p = await props(page)
	expect(p.sizing).toBe('fixed')
	expect(p.used).toBe(3)
	expect(p.values.slice(3)).toEqual(['', '', ''])
	await expect(page.getByTestId('array-capacity')).toHaveText('size 3 · capacity 6')
	// The grip never takes away cells in use.
	const [x, y] = await handlePosition(page, 'grow')
	await page.mouse.move(x, y)
	await page.mouse.down()
	await page.mouse.move(x - 5 * CELL, y, { steps: 10 })
	await page.mouse.up()
	expect((await props(page)).values).toHaveLength(3)
})

test('spare slots can not be edited; x keeps the capacity; + only while there is room', async ({ page }) => {
	await fixedArray(page, 3, 4)
	const before = await props(page)
	// Double-clicking a spare slot edits nothing.
	await page.mouse.dblclick(200 + 3 * CELL, 200)
	await expect(page.locator('input[aria-label^="Cell"]')).toHaveCount(0)
	await page.keyboard.press('Escape')
	await page.mouse.click(200, 200)
	await page.mouse.move(200 + 10, 195)
	await page.getByTestId('remove-cell-0').click()
	expect(await props(page)).toMatchObject({ used: 2, values: [before.values[1], before.values[2], '', ''] })
	// Room for two more: a + after the last value (index 2) and none past it.
	await page.mouse.move(200 + 2 * CELL - 10, 195)
	await page.getByTestId('insert-cell-2').click()
	await page.keyboard.press('Enter')
	await page.mouse.move(200 + 2 * CELL + 10, 195)
	await page.getByTestId('insert-cell-3').click()
	await page.keyboard.press('Enter')
	expect((await props(page)).used).toBe(4)
	// Full: no + anywhere.
	await page.mouse.move(200 + 10, 195)
	await expect(page.locator('[data-testid^="insert-cell-"]')).toHaveCount(0)
})

test('sorting a fixed array sorts the values in use; back to growing drops the spare slots', async ({ page }) => {
	await fixedArray(page, 3, 5)
	await page.evaluate(() => {
		const editor = window.editor!
		const shape = editor.getOnlySelectedShape()!
		editor.updateShape({ id: shape.id, type: 'array', props: { values: ['30', '10', '20', '', ''] } } as never)
	})
	await page.mouse.click(200, 200, { button: 'right' })
	await page.getByTestId('context-menu-sub.drawds-array-actions-button').click()
	await page.getByTestId('context-menu.array-sort').click()
	expect((await props(page)).values).toEqual(['10', '20', '30', '', ''])
	await page.getByTestId('style.array-sizing.grows').click()
	expect(await props(page)).toMatchObject({ sizing: 'grows', values: ['10', '20', '30'] })
	await page.keyboard.press('ControlOrMeta+z')
	expect(await props(page)).toMatchObject({ sizing: 'fixed', values: ['10', '20', '30', '', ''] })
})
