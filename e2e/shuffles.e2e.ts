import { expect, test, type Page } from '@playwright/test'
import type { ArrayShapeProps } from '../src/shapes/array/array-shape-types'
import { arrayStep, CELL, open, rightClick, shapesOfType, sketchArray } from './helpers'

// Lecture 2's shuffles, step by step: the unfair one and Fisher-Yates.

const props = async (page: Page) => (await shapesOfType<ArrayShapeProps>(page, 'array'))[0].props
const caption = (page: Page) => page.getByTestId('play-caption')

async function shuffle(page: Page, item: string) {
	await rightClick(page, [200 + CELL, 200])
	await page.getByTestId('context-menu-sub.drawds-array-steps-button').click()
	await arrayStep(page, item)
}

async function stepToEnd(page: Page) {
	while (!(await page.getByTestId('play-done').count())) await page.keyboard.press('ArrowRight')
}

test.beforeEach(async ({ page }) => {
	// A pinned seed: the same picks every time (Fisher-Yates leaves 3 2 4 1, the unfair shuffle 2 1 3 4).
	await page.addInitScript(() => localStorage.setItem('drawds:seed', '7'))
	await open(page)
	await sketchArray(page, [200, 200], 4)
	await page.evaluate(() => {
		const editor = window.editor!
		const shape = editor.getCurrentPageShapes()[0]
		editor.updateShape({ id: shape.id, type: 'array', props: { values: ['1', '2', '3', '4'] } } as never)
	})
})

test('the unfair shuffle: a pick from the whole array for every i, then why it is unfair', async ({ page }) => {
	await shuffle(page, 'array-unfair-shuffle')
	await expect(caption(page)).toContainText('i = 0: n = a random index from 0 to 3:')
	await expect(page.locator('[data-pointer="n"]')).toHaveCount(1)
	await stepToEnd(page)
	await expect(caption(page)).toContainText('4^4 = 256 equally likely runs of picks make only 4! = 24 orders')
	await expect(page.getByTestId('play-counts')).toContainText('random picks 4')
	await page.keyboard.press('Enter')
	expect((await props(page)).values).toEqual(['2', '1', '3', '4'])
})

test('Fisher-Yates: i from 3 down to 1, n from 0..i; one undo puts the order back', async ({ page }) => {
	await shuffle(page, 'array-fisher-yates')
	await expect(caption(page)).toContainText('i = 3: n = a random index from 0 to 3, a value not placed yet:')
	await stepToEnd(page)
	await expect(caption(page)).toContainText('4 · 3 · … · 2 = 4! = 24 runs of picks, one for each order')
	await expect(page.getByTestId('play-counts')).toContainText('random picks 3')
	await page.keyboard.press('Enter')
	expect((await props(page)).values).toEqual(['3', '2', '4', '1'])
	await page.keyboard.press('ControlOrMeta+z')
	expect((await props(page)).values).toEqual(['1', '2', '3', '4'])
})
