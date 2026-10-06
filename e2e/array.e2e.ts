import { expect, test } from '@playwright/test'
import type { ArrayShapeProps } from '../src/shapes/array/array-shape-types'
import { focusedLabel, open, shapesOfType, sketchArray, withEditor } from './helpers'

const arrays = (page: Parameters<typeof open>[0]) => shapesOfType<ArrayShapeProps>(page, 'array')

test.beforeEach(({ page }) => open(page))

test('sketches arrays in all four directions', async ({ page }) => {
	await sketchArray(page, [300, 200], 5, 'right')
	await sketchArray(page, [900, 200], 3, 'left')
	await sketchArray(page, [300, 750], 4, 'up')
	await sketchArray(page, [1100, 300], 2, 'down')
	const shapes = await arrays(page)
	expect(shapes.map((s) => [s.props.direction, s.props.values.length]).sort()).toEqual([
		['horizontal', 3],
		['horizontal', 5],
		['vertical', 2],
		['vertical', 4],
	])
	expect(await withEditor(page, (e) => e.getPath())).toBe('select.idle')
})

test('Esc cancels a sketch and one undo removes an array', async ({ page }) => {
	await sketchArray(page, [300, 200], 4)
	await page.keyboard.press('Shift+A')
	await page.mouse.move(600, 400)
	await page.mouse.down()
	await page.mouse.move(800, 400, { steps: 5 })
	expect(await arrays(page)).toHaveLength(2)
	await page.keyboard.press('Escape')
	await page.mouse.up()
	expect(await arrays(page)).toHaveLength(1)
	await page.keyboard.press('ControlOrMeta+z')
	expect(await arrays(page)).toHaveLength(0)
})

test('edits cells in place', async ({ page }) => {
	await sketchArray(page, [300, 200], 5)
	const [before] = await arrays(page)

	await page.mouse.dblclick(300, 200)
	await expect.poll(() => focusedLabel(page)).toBe('Cell 0')
	// Letters that are tldraw shortcuts (h = hand, d = draw) must land in the cell.
	await page.keyboard.type('hd')
	await page.keyboard.press('Tab')
	await page.keyboard.type('7')
	await page.keyboard.press('Tab')
	await page.keyboard.type('x')
	await page.keyboard.press('Escape')

	const [after] = await arrays(page)
	expect(after.props.values).toEqual(['hd', '7', ...before.props.values.slice(2)])
	expect(await withEditor(page, (e) => e.getPath())).toBe('select.idle')

	// Each cell edit is one undo step.
	await page.keyboard.press('ControlOrMeta+z')
	expect((await arrays(page))[0].props.values.slice(0, 2)).toEqual(['hd', before.props.values[1]])
})
