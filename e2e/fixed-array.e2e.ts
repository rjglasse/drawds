import { expect, test, type Page } from '@playwright/test'
import type { ArrayShapeProps } from '../src/shapes/array/array-shape-types'
import { CELL, handlePosition, open, rightClick, shapesOfType, sketchArray } from './helpers'

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
	await rightClick(page, [200, 200])
	await page.getByTestId('context-menu-sub.drawds-array-actions-button').click()
	await page.getByTestId('context-menu.array-sort').click()
	expect((await props(page)).values).toEqual(['10', '20', '30', '', ''])
	await page.getByTestId('style.array-sizing.grows').click()
	expect(await props(page)).toMatchObject({ sizing: 'grows', values: ['10', '20', '30'] })
	await page.keyboard.press('ControlOrMeta+z')
	expect(await props(page)).toMatchObject({ sizing: 'fixed', values: ['10', '20', '30', '', ''] })
})

const caption = (page: Page) => page.getByTestId('play-caption')

async function stepToEnd(page: Page) {
	while (!(await page.getByTestId('play-done').count())) await page.keyboard.press('ArrowRight')
}

async function arrayMenu(page: Page, submenu: string, item: string, at = 200) {
	await rightClick(page, [at, 200])
	await page.getByTestId(`context-menu-sub.drawds-${submenu}-button`).click()
	await page.getByTestId(`context-menu.${item}`).click()
}

test('insert into a full fixed array stops; Grow doubles it via newArr, one copy per value', async ({ page }) => {
	await fixedArray(page, 3, 3)
	const before = await props(page)
	await arrayMenu(page, 'array-steps', 'array-insert')
	await expect(caption(page)).toContainText('the array is full, so there is no room for')
	await page.keyboard.press('Enter')
	expect(await props(page)).toEqual(before)
	await arrayMenu(page, 'array-steps', 'array-grow')
	await expect(caption(page)).toHaveText("newArr = new int[6]: a new array with room for 6. Arrays can't grow, so the values have to move")
	await expect(page.getByTestId('array-aux')).toHaveCount(1)
	await page.keyboard.press('ArrowRight')
	await expect(caption(page)).toHaveText(`newArr[0] = a[0] (${before.values[0]})`)
	await stepToEnd(page)
	await expect(page.getByTestId('array-aux')).toHaveCount(0)
	expect(await props(page)).toMatchObject({ values: [...before.values, '', '', ''], used: 3 })
	await expect(page.getByTestId('play-counts')).toHaveText('copies 3')
})

test('insert and delete step by step keep the capacity; append grows a full array first', async ({ page }) => {
	await fixedArray(page, 2, 3)
	const before = await props(page)
	await arrayMenu(page, 'array-steps', 'array-insert')
	await stepToEnd(page)
	let p = await props(page)
	expect(p.used).toBe(3)
	expect(p.values).toHaveLength(3)
	expect(p.values.slice(1)).toEqual(before.values.slice(0, 2))
	await page.keyboard.press('Enter')
	await arrayMenu(page, 'array-steps', 'array-append')
	await expect(caption(page)).toContainText('the array is full. Grow it first')
	await stepToEnd(page)
	p = await props(page)
	expect(p).toMatchObject({ used: 4 })
	expect(p.values).toHaveLength(6)
	await page.keyboard.press('Enter')
	await arrayMenu(page, 'array-steps', 'array-delete')
	await stepToEnd(page)
	await expect(caption(page)).toContainText('size = 3: a[3] is a spare slot again')
	expect((await props(page)).values).toHaveLength(6)
})

test('append 8 values: doubling copies 12 times, growing by one 60 times', async ({ page }) => {
	await fixedArray(page, 4, 4)
	await arrayMenu(page, 'array-steps', 'array-append-many-double')
	await stepToEnd(page)
	await expect(page.getByTestId('play-counts')).toHaveText('appends 8 · copies 12')
	await expect(caption(page)).toContainText('amortised O(1)')
	await page.keyboard.press('Enter')
	expect(await props(page)).toMatchObject({ used: 12 })
	expect((await props(page)).values).toHaveLength(16)
	await page.keyboard.press('ControlOrMeta+z')
	await arrayMenu(page, 'array-steps', 'array-append-many-plus-one')
	await stepToEnd(page)
	await expect(page.getByTestId('play-counts')).toHaveText('appends 8 · copies 60')
	await page.keyboard.press('Enter')
	expect((await props(page)).values).toHaveLength(12)
})
