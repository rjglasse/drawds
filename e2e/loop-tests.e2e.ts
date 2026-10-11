import { expect, test, type Page } from '@playwright/test'
import { arrayStep, open, rightClick, sketchArray } from './helpers'

// A loop's or an if's test, as it is tested: the condition boxed green or red in the code beside the
// operation, written out with its values after the line, a part && never reaches faded.

const test_ = (page: Page) => page.locator('[data-test-line]')
const shown = (page: Page) => test_(page).locator('text').textContent()

async function insertionSort(page: Page, values: string[]) {
	await sketchArray(page, [200, 200], values.length)
	await page.evaluate((values) => {
		const editor = window.editor!
		const [a] = editor.getCurrentPageShapes()
		editor.updateShape({ id: a.id, type: 'array', props: { values } } as never)
		editor.select(a.id)
	}, values)
	await rightClick(page, [200, 200])
	await page.getByTestId('context-menu-sub.drawds-array-steps-button').click()
	await arrayStep(page, 'array-insertion-sort')
	await page.getByTestId('play-code').click()
}

test.beforeEach(({ page }) => open(page))

test('insertion sort: the for loop’s test, the while’s with its values, the short-circuit at j = 0, the last test', async ({ page }) => {
	await insertionSort(page, ['5', '2', '4'])
	// i = 1: the for loop's test holds.
	await page.keyboard.press('ArrowRight')
	await expect(test_(page)).toHaveAttribute('data-test-result', 'true')
	expect(await shown(page)).toBe('1 < 3  → true')
	// j = 1: 5 > 2, into the loop.
	await page.keyboard.press('ArrowRight')
	expect(await shown(page)).toBe('1 > 0 && 5 > 2  → true')
	await expect(page.locator('[data-test-skipped] rect')).toHaveCount(0)
	// The swap's step is no test.
	await page.keyboard.press('ArrowRight')
	await expect(test_(page)).toHaveCount(0)
	// j = 0: && stops at j > 0, the comparison faded in the code.
	await page.keyboard.press('ArrowRight')
	await expect(test_(page)).toHaveAttribute('data-test-result', 'false')
	expect(await shown(page)).toBe('0 > 0 && …  → false')
	await expect(page.locator('[data-test-skipped] rect')).toHaveCount(1)
	// The last step: the for loop's test fails at i = 3.
	while (!(await page.getByTestId('play-done').count())) await page.keyboard.press('ArrowRight')
	expect(await shown(page)).toBe('3 < 3  → false')
})
