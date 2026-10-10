import { expect, test, type Page } from '@playwright/test'
import type { ArrayShapeProps } from '../src/shapes/array/array-shape-types'
import { arrayStep, CELL, open, rightClick, shapesOfType, sketchArray } from './helpers'

// Lectures 2 and 3's scans, counted: find the largest, all unique?, sentinel search.

const props = async (page: Page) => (await shapesOfType<ArrayShapeProps>(page, 'array'))[0].props
const caption = (page: Page) => page.getByTestId('play-caption')
const counts = (page: Page) => page.getByTestId('play-counts')

async function sketch(page: Page, values: string[]) {
	await sketchArray(page, [200, 200], values.length)
	await page.evaluate((values) => {
		const editor = window.editor!
		const shape = editor.getCurrentPageShapes().find((s) => s.type === 'array')!
		editor.updateShape({ id: shape.id, type: 'array', props: { values } } as never)
	}, values)
}

/** Right-click cell i: Step by step > item. */
async function steps(page: Page, i: number, item: string) {
	await rightClick(page, [200 + i * CELL, 200])
	await page.getByTestId('context-menu-sub.drawds-array-steps-button').click()
	await arrayStep(page, item)
}

async function stepToEnd(page: Page) {
	while (!(await page.getByTestId('play-done').count())) await page.keyboard.press('ArrowRight')
}

test.beforeEach(({ page }) => open(page))

test('find the largest: maxval in a strip, n - 1 comparisons, the array unchanged', async ({ page }) => {
	await sketch(page, ['31', '8', '47', '15', '47', '22'])
	await steps(page, 0, 'array-find-max')
	await expect(caption(page)).toHaveText('maxval = a[0] = 31: the largest so far')
	await expect(page.getByTestId('playback-strip').filter({ hasText: 'maxval' })).toContainText('31')
	await stepToEnd(page)
	await expect(caption(page)).toContainText('The largest is 47 (index 2): 5 comparisons')
	await expect(counts(page)).toHaveText('comparisons 5 · updates 1')
	expect((await props(page)).values).toEqual(['31', '8', '47', '15', '47', '22'])
})

test('all unique?: a repeat stops it, both red; all different takes every pair', async ({ page }) => {
	await sketch(page, ['31', '8', '47', '15', '47'])
	await steps(page, 0, 'array-all-unique')
	await stepToEnd(page)
	await expect(caption(page)).toContainText('a[2] = a[4] = 47: not all unique')
	await expect(counts(page)).toHaveText('comparisons 9')
	await page.keyboard.press('Enter')
	await page.evaluate(() => {
		const editor = window.editor!
		const shape = editor.getCurrentPageShapes()[0]
		editor.updateShape({ id: shape.id, type: 'array', props: { values: ['31', '8', '47', '15', '12'] } } as never)
	})
	await steps(page, 0, 'array-all-unique')
	await stepToEnd(page)
	await expect(caption(page)).toContainText('all unique, return true after 10 comparisons')
})

test('sentinel search: the key goes past the end, the loop stops on it, and it comes out again', async ({ page }) => {
	await sketch(page, ['31', '8', '47', '15'])
	await steps(page, 2, 'array-sentinel-search')
	await expect(caption(page)).toContainText('a[4] = 47: the key goes one past the end as a sentinel')
	await stepToEnd(page)
	await expect(caption(page)).toContainText('found 47 at index 2')
	await expect(counts(page)).toHaveText('comparisons 3 · i < n checks saved 2')
	expect((await props(page)).values).toEqual(['31', '8', '47', '15'])
})
