import { expect, test, type Page } from '@playwright/test'
import { arrayStep, open, rightClick, sketchArray } from './helpers'

// The code beside an array: every move made on it, as code, kept in its meta so undo and redo take
// the lines with the moves.

const lines = (page: Page) => page.locator('[data-shape-type="code"] [data-code-line]').allTextContents()

async function menu(page: Page, sub: 'show' | 'actions' | 'steps', item: string) {
	await rightClick(page, [200, 200])
	await page.getByTestId(`context-menu-sub.drawds-array-${sub}-button`).click()
	if (sub === 'steps') await arrayStep(page, item)
	else await page.getByTestId(`context-menu.${item}`).click()
}

test.beforeEach(({ page }) => open(page))

test('the code beside an array: a line per move, typing one line, an operation its call; undo takes the line too', async ({ page }) => {
	await sketchArray(page, [200, 200], 4)
	await menu(page, 'show', 'array-code-beside')
	await expect.poll(() => lines(page)).toHaveLength(1)
	expect((await lines(page))[0]).toMatch(/^List<Integer> a = new ArrayList<>\(List\.of\(\d+, \d+, \d+, \d+\)\);$/)

	// Typing 4, then 42: one line.
	await page.mouse.dblclick(200, 200)
	await page.keyboard.type('42')
	await page.keyboard.press('Enter')
	await expect.poll(() => lines(page)).toHaveLength(2)
	expect((await lines(page))[1]).toBe('a.set(0, 42);')

	await menu(page, 'actions', 'array-reverse')
	await expect.poll(() => lines(page)).toHaveLength(3)
	expect((await lines(page))[2]).toBe('Collections.reverse(a);')

	// Played step by step and put in (Enter: the result, and the bar goes): the algorithm, not what a
	// diff would guess.
	await menu(page, 'steps', 'array-bubble-sort')
	await page.keyboard.press('Enter')
	await expect.poll(() => lines(page)).toHaveLength(4)
	expect((await lines(page))[3]).toBe('bubbleSort(a);')

	await page.keyboard.press('ControlOrMeta+z')
	await expect.poll(() => lines(page)).toHaveLength(3)
	await page.keyboard.press('ControlOrMeta+Shift+z')
	await expect.poll(() => lines(page)).toHaveLength(4)

	// Another language: the same moves written out again.
	await page.evaluate(() => {
		const editor = window.editor!
		void editor.select(editor.getCurrentPageShapes().find((s) => s.type === 'code')!.id)
	})
	await page.getByTestId('style.code-language.python').click()
	await expect.poll(async () => (await lines(page)).slice(1)).toEqual(['a[0] = 42', 'a.reverse()', 'bubble_sort(a)'])
})
