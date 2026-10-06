import { expect, test, type Page } from '@playwright/test'
import type { MatrixShapeProps } from '../src/shapes/matrix/matrix-shape-types'
import { CELL, handlePosition, open, shapesOfType } from './helpers'

const matrix = async (page: Page) => (await shapesOfType<MatrixShapeProps>(page, 'matrix'))[0].props
const size = async (page: Page) => {
	const { values } = await matrix(page)
	return [values.length, values[0].length]
}
const caption = (page: Page) => page.getByTestId('play-caption')

/** Shift+M, then drag from the first cell's centre so the matrix has `rows` x `cols` cells. */
async function sketchMatrix(page: Page, [x, y]: [number, number], rows: number, cols: number) {
	await page.keyboard.press('Shift+M')
	await page.mouse.move(x, y)
	await page.mouse.down()
	await page.mouse.move(x + (cols - 1) * CELL + 10, y + (rows - 1) * CELL + 10, { steps: 20 })
	await page.mouse.up()
}

/** Screen centre of cell (r, c) of the selected matrix. */
function cellAt(page: Page, r: number, c: number): Promise<[number, number]> {
	return page.evaluate(
		([r, c]) => {
			const e = window.editor!
			const s = e.getOnlySelectedShape()!
			const util = e.getShapeUtil(s) as unknown as { cells: { cellBox(s: unknown, k: string): { x: number; y: number; w: number } } }
			const box = util.cells.cellBox(s, `${r},${c}`)
			const p = e.pageToScreen(e.getShapePageTransform(s).applyToPoint({ x: box.x + box.w / 2, y: box.y + box.w / 2 }))
			return [p.x, p.y] as [number, number]
		},
		[r, c]
	)
}

async function stepToEnd(page: Page) {
	while (!(await page.getByTestId('play-done').count())) await page.keyboard.press('ArrowRight')
}

test.beforeEach(({ page }) => open(page))

test('sketch a matrix by dragging a rectangle; edit cells, Tab along a row', async ({ page }) => {
	await sketchMatrix(page, [200, 200], 3, 4)
	expect(await size(page)).toEqual([3, 4])
	expect(await cellAt(page, 0, 0)).toEqual([200, 200])
	await page.mouse.dblclick(...(await cellAt(page, 0, 3)))
	await page.keyboard.press('ControlOrMeta+a')
	await page.keyboard.type('7')
	await page.keyboard.press('Tab')
	await page.keyboard.press('ControlOrMeta+a')
	await page.keyboard.type('8')
	await page.keyboard.press('Enter')
	const { values } = await matrix(page)
	expect([values[0][3], values[1][0]]).toEqual(['7', '8'])
})

test('grips add columns and rows; the menu inserts and deletes them, marks moving along', async ({ page }) => {
	await sketchMatrix(page, [200, 200], 2, 2)
	const drag = async (grip: string, dx: number, dy: number) => {
		const [x, y] = await handlePosition(page, grip)
		await page.mouse.move(x, y)
		await page.mouse.down()
		await page.mouse.move(x + dx, y + dy, { steps: 10 })
		await page.mouse.up()
	}
	await drag('grow-cols', CELL * 2, 0)
	await drag('grow-rows', 0, CELL)
	expect(await size(page)).toEqual([3, 4])
	const before = (await matrix(page)).values
	// Mark cell (1, 1), then insert a row above it: the mark moves down with its value.
	await page.mouse.move(...(await cellAt(page, 1, 1)))
	await page.keyboard.press('3')
	await page.mouse.click(...(await cellAt(page, 1, 1)), { button: 'right' })
	await page.getByTestId('context-menu-sub.drawds-matrix-actions-button').click()
	await page.getByTestId('context-menu.matrix-row-above').click()
	const after = await matrix(page)
	expect(after.values.length).toBe(4)
	expect(after.values[2]).toEqual(before[1])
	expect(after.marks).toEqual({ '2,1': 'green' })
	await page.waitForTimeout(450) // the menu may still be closing: it would swallow the right-click
	await page.mouse.click(...(await cellAt(page, 0, 3)), { button: 'right' })
	await page.getByTestId('context-menu-sub.drawds-matrix-actions-button').click()
	await page.getByTestId('context-menu.matrix-delete-col').click()
	expect(await size(page)).toEqual([4, 3])
	await page.keyboard.press('ControlOrMeta+z')
	expect(await size(page)).toEqual([4, 4])
})

test('row-major vs column-major: where each visited cell sits in memory', async ({ page }) => {
	await sketchMatrix(page, [200, 200], 2, 3)
	await page.mouse.click(...(await cellAt(page, 0, 0)), { button: 'right' })
	await page.getByTestId('context-menu-sub.drawds-matrix-steps-button').click()
	await page.getByTestId('context-menu.matrix-col-major').click()
	await page.keyboard.press('ArrowRight')
	await expect(caption(page)).toContainText('at 1·3 + 0 = 3 in memory: 3 cells on')
	await stepToEnd(page)
	await expect(page.getByTestId('playback-strip').filter({ hasText: 'place in memory' })).toContainText('031425')
	await page.keyboard.press('Enter')
})

test('transpose: step by step on a square matrix, at once on any', async ({ page }) => {
	await sketchMatrix(page, [200, 200], 3, 3)
	const before = (await matrix(page)).values
	await page.mouse.click(...(await cellAt(page, 0, 0)), { button: 'right' })
	await page.getByTestId('context-menu-sub.drawds-matrix-steps-button').click()
	await page.getByTestId('context-menu.matrix-transpose-steps').click()
	await stepToEnd(page)
	await expect(caption(page)).toHaveText('Transposed: row i is now column i (3 swaps)')
	await page.keyboard.press('Enter')
	expect((await matrix(page)).values).toEqual(before[0].map((_, c) => before.map((row) => row[c])))
})

test('staircase search in a sorted matrix finds a value in at most rows + cols - 1 steps', async ({ page }) => {
	await sketchMatrix(page, [200, 200], 4, 4)
	await page.getByTestId('style.fill-mode').click()
	await page.getByTestId('style.fill-mode.ascending').click()
	const target = (await matrix(page)).values[2][1]
	await page.waitForTimeout(450) // the Fill menu may still be closing: it would swallow the right-click
	await page.mouse.click(...(await cellAt(page, 0, 0)), { button: 'right' })
	await page.getByTestId('context-menu-sub.drawds-matrix-steps-button').click()
	await page.getByTestId('context-menu.matrix-staircase').click()
	await page.getByTestId('key-prompt').fill(target)
	await page.keyboard.press('Enter')
	await stepToEnd(page)
	await expect(caption(page)).toContainText(`a[2][1] = ${target}: found in`)
})

test('transpose at once turns rows x cols into cols x rows; one undo', async ({ page }) => {
	await sketchMatrix(page, [200, 200], 2, 3)
	const before = (await matrix(page)).values
	await page.mouse.click(...(await cellAt(page, 0, 0)), { button: 'right' })
	await page.getByTestId('context-menu-sub.drawds-matrix-actions-button').click()
	await page.getByTestId('context-menu.matrix-transpose').click()
	expect((await matrix(page)).values).toEqual(before[0].map((_, c) => before.map((row) => row[c])))
	await page.keyboard.press('ControlOrMeta+z')
	expect((await matrix(page)).values).toEqual(before)
})
