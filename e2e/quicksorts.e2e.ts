import { expect, test, type Page } from '@playwright/test'
import type { ArrayShapeProps } from '../src/shapes/array/array-shape-types'
import { arrayStep, open, rightClick, shapesOfType, sketchArray, withEditor } from './helpers'

// Lecture 10: quicksort's improvements step by step, and a sort's comparisons counted as n grows.

const values = async (page: Page) => (await shapesOfType<ArrayShapeProps>(page, 'array'))[0].props.values
const caption = (page: Page) => page.getByTestId('play-caption')

async function sketch(page: Page, values: string[]) {
	await sketchArray(page, [200, 200], values.length)
	await setValues(page, values)
}

/** The array's values, typed in. */
async function setValues(page: Page, values: string[]) {
	await page.evaluate((values) => {
		const editor = window.editor!
		const shape = editor.getCurrentPageShapes().find((s) => s.type === 'array')!
		editor.updateShape({ id: shape.id, type: 'array', props: { values } } as never)
	}, values)
}

async function steps(page: Page, item: string) {
	await rightClick(page, [200, 200])
	await page.getByTestId('context-menu-sub.drawds-array-steps-button').click()
	await arrayStep(page, item)
}

async function stepToEnd(page: Page) {
	while (!(await page.getByTestId('play-done').count())) await page.keyboard.press('ArrowRight')
}

test.beforeEach(({ page }) => open(page))

test('three-way quicksort: lt, i and gt; the equal values placed at once; fewer calls than plain quicksort', async ({ page }) => {
	await sketch(page, ['2', '0', '1', '1', '2', '1', '0', '0'])
	await steps(page, 'array-quicksort-3way')
	await expect(caption(page)).toHaveText(
		'quicksort(0, 7): pivot = a[7] = 0. lt = i = 0, gt = 7: smaller values will gather left of lt, equal ones from lt up to i, larger ones right of gt'
	)
	for (const name of ['lt', 'i', 'gt']) await expect(page.locator(`[data-pointer="${name}"]`)).toHaveCount(1)
	await expect(page.getByTestId('play-counts')).toContainText('calls 1')
	await stepToEnd(page)
	await expect(caption(page)).toContainText('Plain quicksort (the last value as pivot) on the same input:')
	expect(await values(page)).toEqual(['0', '0', '0', '1', '1', '1', '2', '2'])
})

test('median of three: the three samples lit, the median moved to the end as the pivot', async ({ page }) => {
	await sketch(page, ['7', '1', '9', '2', '4'])
	await steps(page, 'array-quicksort-median')
	await expect(caption(page)).toHaveText('quicksort(0, 4): of a[0] = 7, a[2] = 9 and a[4] = 4, the median (the middle one) is 7')
	for (const name of ['lo', 'mid', 'hi']) await expect(page.locator(`[data-pointer="${name}"]`)).toHaveCount(1)
	await page.keyboard.press('ArrowRight')
	await expect(caption(page)).toHaveText('swap(a[0], a[4]): the median 7 goes to the end, as the pivot')
	await page.keyboard.press('Enter')
	expect(await values(page)).toEqual(['1', '2', '4', '7', '9'])
})

test('a random pivot from lo..hi, picked by k; the cut-off asks for its length and insertion sorts short ranges', async ({ page }) => {
	await sketch(page, ['2', '8', '7', '1', '3', '5', '6', '4'])
	await steps(page, 'array-quicksort-random')
	await expect(caption(page)).toHaveText(/^quicksort\(0, 7\): a random index from 0 to 7: k = \d, so the pivot is \d/)
	await expect(page.locator('[data-pointer="k"]')).toHaveCount(1)
	await page.keyboard.press('Enter')
	expect(await values(page)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8'])

	await setValues(page, ['2', '8', '7', '1', '3', '5', '6', '4'])
	await steps(page, 'array-quicksort-cutoff')
	await page.getByTestId('key-prompt').fill('3')
	await page.getByTestId('key-prompt').press('Enter')
	await expect(caption(page)).toHaveText('quicksort(0, 7): partition a[0..7]')
	await stepToEnd(page)
	await expect(caption(page)).toContainText('5 calls')
	await expect(caption(page)).toContainText('on the same input: 15 comparisons, 11 calls, 4 levels')
})

test('counts as n grows: the sort last played, a row at a time beside the array, then how each column grows', async ({ page }) => {
	await sketch(page, ['2', '0', '1', '1', '2', '1', '0', '0'])
	await steps(page, 'array-quicksort-3way')
	await page.keyboard.press('Enter')
	await rightClick(page, [200, 200])
	await page.getByTestId('context-menu-sub.drawds-array-steps-button').click()
	await page.getByTestId('context-menu-sub.drawds-array-steps-sorts-button').click()
	await expect(page.getByTestId('context-menu.array-sort-growth')).toHaveText('Counts as n grows: quicksort, three-way')
	await page.getByTestId('context-menu.array-sort-growth').click()
	const table = page.locator('[data-testid="sort-growth"][data-sort="quicksort-3way"]')
	await expect(table).toHaveAttribute('data-rows', '1')
	await expect(caption(page)).toHaveText("Quicksort, three-way's comparisons at n = 10: on sorted, reversed and random input, and on values 0-2 only (many equal values)")
	await page.keyboard.press('ArrowRight')
	await expect(table).toHaveAttribute('data-rows', '2')
	await stepToEnd(page)
	await expect(table.locator('[data-growth]')).toHaveText(['n²', 'n²', 'n log n', 'n'])
	await page.keyboard.press('Enter')
	await expect(table).toHaveAttribute('data-rows', '4')
	// Every count shows: three sizes, four kinds of input.
	await expect(table.locator('[data-count]')).toHaveCount(12)

	// Another sort's table goes beside it; Esc takes it back. Deleting the array takes the tables.
	await steps(page, 'array-insertion-sort')
	await page.keyboard.press('Enter')
	await steps(page, 'array-sort-growth')
	await expect(page.locator('[data-testid="sort-growth"]')).toHaveCount(2)
	await page.keyboard.press('Escape')
	await expect(page.locator('[data-testid="sort-growth"]')).toHaveCount(1)
	await withEditor(page, (editor) => void editor.deleteShapes(editor.getCurrentPageShapes().filter((s) => s.type === 'array').map((s) => s.id)))
	expect(await shapesOfType(page, 'sort-growth')).toHaveLength(0)
})
