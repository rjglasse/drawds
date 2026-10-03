import { expect, test, type Page } from '@playwright/test'
import type { ArrayShapeProps } from '../src/shapes/array/array-shape-types'
import { CELL, open, shapesOfType, sketchArray, withEditor } from './helpers'

const props = async (page: Page) => (await shapesOfType<ArrayShapeProps>(page, 'array'))[0].props
const values = async (page: Page) => (await props(page)).values
const caption = (page: Page) => page.getByTestId('play-caption')

/** Set the sketched array's values (and marks). */
async function setValues(page: Page, values: string[], marks: Record<string, string> = {}) {
	await page.evaluate(
		([values, marks]) => {
			const editor = window.editor!
			const shape = editor.getCurrentPageShapes().find((s) => s.type === 'array')!
			editor.updateShape({ id: shape.id, type: 'array', props: { values, marks } } as never)
		},
		[values, marks] as const
	)
}

/** Right-click cell i of an array whose first cell is at (200, 200): submenu > item. */
async function arrayOp(page: Page, i: number, submenu: string, item: string) {
	await page.mouse.click(200 + i * CELL, 200, { button: 'right' })
	await page.getByTestId(`context-menu-sub.drawds-${submenu}-button`).click()
	await page.getByTestId(`context-menu.${item}`).click()
}

/** Step to the end (operations open paused), where the result is in and the bar waits. */
async function stepToEnd(page: Page) {
	while (!(await page.getByTestId('play-done').count())) await page.keyboard.press('ArrowRight')
}

test.beforeEach(({ page }) => open(page))

test('binary search: lo, mid and hi close in, the discarded half fades; nothing changes', async ({ page }) => {
	await sketchArray(page, [200, 200], 7)
	await setValues(page, ['3', '8', '15', '21', '34', '42', '57'])
	const before = await props(page)
	await arrayOp(page, 5, 'array-search', 'array-binary-search')
	await expect(caption(page)).toHaveText('lo = 0, hi = 6: 42 could be anywhere in a[0..6]')
	// The step's pointers are drawn in front of the canvas.
	await expect(page.locator('[data-pointer="lo"]')).toHaveCount(1)
	await expect(page.locator('[data-pointer="hi"]')).toHaveCount(1)
	await page.keyboard.press('ArrowRight')
	await expect(caption(page)).toHaveText('mid = (0 + 6) / 2 = 3. Is a[3] = 21 equal to 42?')
	await expect(page.getByTestId('play-counts')).toHaveText('comparisons 1')
	await page.keyboard.press('ArrowRight')
	await expect(caption(page)).toHaveText('21 < 42, so 42 can only be right of mid: lo = mid + 1 = 4')
	await stepToEnd(page)
	await expect(caption(page)).toHaveText('Yes: found 42 at index 5, after 2 comparisons')
	await page.keyboard.press('Enter')
	await expect(page.getByTestId('play-bar')).toHaveCount(0)
	await expect(page.locator('[data-pointer="lo"]')).toHaveCount(0)
	expect(await props(page)).toEqual(before)
})

test('binary search for a missing value: the pointers cross', async ({ page }) => {
	await sketchArray(page, [200, 200], 5)
	await setValues(page, ['10', '20', '30', '40', '50'])
	await arrayOp(page, 0, 'array-search', 'array-binary-search-value')
	await page.getByTestId('key-prompt').fill('35')
	await page.keyboard.press('Enter')
	await stepToEnd(page)
	await expect(caption(page)).toHaveText('lo = 3 > hi = 2: the pointers have crossed, so 35 is not in the array')
})

test('binary search on an unsorted array warns first', async ({ page }) => {
	await sketchArray(page, [200, 200], 4)
	await setValues(page, ['9', '1', '5', '7'])
	await arrayOp(page, 2, 'array-search', 'array-binary-search')
	await expect(caption(page)).toHaveText("Careful: a[0] = 9 > a[1] = 1, so the array isn't sorted and binary search can miss 5")
})

test('linear search counts every comparison', async ({ page }) => {
	await sketchArray(page, [200, 200], 4)
	await setValues(page, ['4', '8', '15', '16'])
	await arrayOp(page, 3, 'array-search', 'array-linear-search')
	await stepToEnd(page)
	await expect(caption(page)).toHaveText('i = 3: a[3] = 16. Found 16 at index 3')
	await expect(page.getByTestId('play-counts')).toHaveText('comparisons 4')
})

test('insertion sort, step by step: sorted at the end, marks travel, one undo', async ({ page }) => {
	await sketchArray(page, [200, 200], 6)
	await setValues(page, ['5', '2', '4', '6', '1', '3'], { 4: 'blue' })
	await arrayOp(page, 0, 'array-sort', 'array-insertion-sort')
	await expect(caption(page)).toHaveText('a[0] on its own is sorted')
	await stepToEnd(page)
	await expect(caption(page)).toHaveText('Sorted: 12 comparisons, 9 swaps')
	await expect(page.getByTestId('play-counts')).toHaveText('comparisons 12 · swaps 9')
	expect(await props(page)).toMatchObject({ values: ['1', '2', '3', '4', '5', '6'], marks: { 0: 'blue' } })
	await page.keyboard.press('Enter')
	await page.keyboard.press('ControlOrMeta+z')
	expect(await props(page)).toMatchObject({ values: ['5', '2', '4', '6', '1', '3'], marks: { 4: 'blue' } })
})

test('selection and bubble sort: Enter finishes at once; Esc cancels', async ({ page }) => {
	await sketchArray(page, [200, 200], 5)
	await setValues(page, ['50', '10', '40', '20', '30'])
	await arrayOp(page, 0, 'array-sort', 'array-bubble-sort')
	await page.keyboard.press('Escape')
	expect(await values(page)).toEqual(['50', '10', '40', '20', '30'])
	await page.waitForTimeout(400)
	await arrayOp(page, 0, 'array-sort', 'array-selection-sort')
	await expect(caption(page)).toHaveText('i = 0: find the smallest of a[0..4]. min = 0 (50) so far')
	await page.keyboard.press('Enter')
	expect(await values(page)).toEqual(['10', '20', '30', '40', '50'])
})

test('delete step by step: later values shift left one at a time', async ({ page }) => {
	await sketchArray(page, [200, 200], 5)
	await setValues(page, ['a', 'b', 'c', 'd', 'e'], { 3: 'red' })
	await arrayOp(page, 1, 'array-shift', 'array-delete')
	await expect(caption(page)).toHaveText('Delete a[1] = b: every value after it moves one cell left')
	await page.keyboard.press('ArrowRight')
	await expect(caption(page)).toHaveText('a[1] = a[2] (c)')
	await stepToEnd(page)
	await expect(caption(page)).toHaveText('n = n - 1: the last cell is no longer used. 3 values moved')
	expect(await props(page)).toMatchObject({ values: ['a', 'c', 'd', 'e'], marks: { 2: 'red' } })
})

test('insert step by step: room is made from the end, then the value goes in', async ({ page }) => {
	await sketchArray(page, [200, 200], 3)
	await setValues(page, ['10', '20', '30'])
	await arrayOp(page, 1, 'array-shift', 'array-insert')
	await expect(caption(page)).toContainText('at index 1. First make room: n = n + 1')
	// The array shows the extra cell while the operation runs, inside the shape's bounds.
	const width = () => withEditor(page, (editor) => editor.getShapePageBounds(editor.getOnlySelectedShape()!)!.w)
	expect(await width()).toBe(4 * CELL)
	await page.keyboard.press('ArrowRight')
	await expect(caption(page)).toHaveText('a[3] = a[2] (30): from the end, so nothing is overwritten')
	await stepToEnd(page)
	const after = await values(page)
	expect(after).toHaveLength(4)
	expect([after[0], after[2], after[3]]).toEqual(['10', '20', '30'])
	await expect(caption(page)).toHaveText(`a[1] = ${after[1]}. 2 values moved to make room`)
})

test('instant actions: sort, reverse, shuffle, new values, indices', async ({ page }) => {
	await sketchArray(page, [200, 200], 5)
	await setValues(page, ['30', '10', '50', '20', '40'], { 0: 'red' })
	await arrayOp(page, 0, 'array-actions', 'array-sort')
	expect(await props(page)).toMatchObject({ values: ['10', '20', '30', '40', '50'], marks: { 2: 'red' } })
	await page.waitForTimeout(400)
	await arrayOp(page, 0, 'array-actions', 'array-reverse')
	expect(await values(page)).toEqual(['50', '40', '30', '20', '10'])
	await page.waitForTimeout(400)
	await arrayOp(page, 0, 'array-actions', 'array-shuffle')
	const shuffled = await values(page)
	expect(shuffled).not.toEqual(['50', '40', '30', '20', '10'])
	expect([...shuffled].sort()).toEqual(['10', '20', '30', '40', '50'])
	await page.waitForTimeout(400)
	const seed = (await props(page)).seed
	await arrayOp(page, 0, 'array-actions', 'array-reroll')
	expect((await props(page)).seed).not.toBe(seed)
	expect(await values(page)).toHaveLength(5)
	await page.waitForTimeout(400)
	await arrayOp(page, 0, 'array-actions', 'array-indices')
	expect((await props(page)).showIndices).toBe(false)
	// Each action is one undo step.
	await page.keyboard.press('ControlOrMeta+z')
	expect((await props(page)).showIndices).toBe(true)
})
