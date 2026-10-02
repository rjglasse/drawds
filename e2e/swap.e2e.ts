import { expect, test, type Page } from '@playwright/test'
import type { ArrayShapeProps } from '../src/shapes/array/array-shape-types'
import { CELL, handlePosition, open, shapesOfType, sketchArray } from './helpers'

const arrayProps = async (page: Page) => (await shapesOfType<ArrayShapeProps>(page, 'array'))[0].props

/** Drag cell `i`'s handle to a screen point; leaves the pointer down if `release` is false. */
async function dragCell(page: Page, i: number, to: [number, number], release = true) {
	const [x, y] = await handlePosition(page, `cell:${i}`)
	await page.mouse.move(x, y)
	await page.mouse.down()
	await page.mouse.move(...to, { steps: 10 })
	if (release) await page.mouse.up()
}

test.beforeEach(({ page }) => open(page))

test('drag a cell onto another to swap them; marks travel with values; one undo', async ({ page }) => {
	await sketchArray(page, [300, 200], 5)
	await page.mouse.move(300, 200)
	await page.keyboard.press('1')
	const before = await arrayProps(page)
	await dragCell(page, 0, [300 + 3 * CELL, 200])
	const after = await arrayProps(page)
	expect(after.values).toEqual([before.values[3], before.values[1], before.values[2], before.values[0], before.values[4]])
	expect(after.marks).toEqual({ '3': 'red' })
	await page.keyboard.press('ControlOrMeta+z')
	expect(await arrayProps(page)).toMatchObject({ values: before.values, marks: { '0': 'red' } })
})

test('dropping a cell on itself or off the array changes nothing', async ({ page }) => {
	await sketchArray(page, [300, 200], 4)
	const before = (await arrayProps(page)).values
	await dragCell(page, 1, [300 + CELL, 205])
	await dragCell(page, 1, [300 + CELL, 500])
	expect((await arrayProps(page)).values).toEqual(before)
})

test('vertical arrays swap too', async ({ page }) => {
	await sketchArray(page, [300, 150], 3, 'down')
	const before = (await arrayProps(page)).values
	await dragCell(page, 2, [300, 150])
	expect((await arrayProps(page)).values).toEqual([before[2], before[1], before[0]])
})

test('Esc cancels a swap', async ({ page }) => {
	await sketchArray(page, [300, 200], 4)
	const before = (await arrayProps(page)).values
	await dragCell(page, 0, [300 + 2 * CELL, 200], false)
	await page.keyboard.press('Escape')
	await page.mouse.up()
	expect((await arrayProps(page)).values).toEqual(before)
})
