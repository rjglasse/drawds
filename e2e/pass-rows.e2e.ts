import { expect, test } from '@playwright/test'
import type { ArrayShapeProps } from '../src/shapes/array/array-shape-types'
import { arrayStep, open, rightClick, shapesOfType, sketchArray } from './helpers'

// Lectures 2 and 3: a sort a pass at a time, each pass a row under the array, the costs summed.

test.beforeEach(({ page }) => open(page))

test('insertion sort, a row per pass: the rows build up under the array, ending on the series', async ({ page }) => {
	await sketchArray(page, [200, 200], 5)
	await page.evaluate(() => {
		const editor = window.editor!
		const shape = editor.getCurrentPageShapes().find((s) => s.type === 'array')!
		editor.updateShape({ id: shape.id, type: 'array', props: { values: ['5', '4', '3', '2', '1'] } } as never)
	})
	await rightClick(page, [200, 200])
	await page.getByTestId('context-menu-sub.drawds-array-steps-button').click()
	await arrayStep(page, 'array-insertion-passes')
	await expect(page.getByTestId('playback-strip')).toHaveCount(1)
	await expect(page.getByTestId('playback-strip')).toContainText('pass 1: 1 comparison, 1 swap (2 while tests)')
	while (!(await page.getByTestId('play-done').count())) await page.keyboard.press('ArrowRight')
	await expect(page.getByTestId('playback-strip')).toHaveCount(4)
	await expect(page.getByTestId('play-caption')).toContainText('While tests 2 + 3 + 4 + 5 = 14')
	await page.keyboard.press('Enter')
	expect((await shapesOfType<ArrayShapeProps>(page, 'array'))[0].props.values).toEqual(['1', '2', '3', '4', '5'])
})
