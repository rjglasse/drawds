import { expect, test, type Locator, type Page } from '@playwright/test'
import { CELL, menusClosed, open, rightClick, shapesOfType, sketchArray } from './helpers'

// Every run of a shuffle as a tree, and many runs tallied (lecture 2), in a view beside the array.

async function sketch(page: Page, values: string[]) {
	await sketchArray(page, [200, 200], values.length)
	await page.evaluate((values) => {
		const editor = window.editor!
		const shape = editor.getCurrentPageShapes().find((s) => s.type === 'array')!
		editor.updateShape({ id: shape.id, type: 'array', props: { values } } as never)
	}, values)
}

async function steps(page: Page, item: string) {
	await rightClick(page, [200, 200])
	await page.getByTestId('context-menu-sub.drawds-array-steps-button').click()
	await page.getByTestId('context-menu-sub.drawds-array-steps-shuffles-button').click()
	await page.getByTestId(`context-menu.${item}`).click()
}

async function stepToEnd(page: Page) {
	while (!(await page.getByTestId('play-done').count())) await page.keyboard.press('ArrowRight')
}

const view = (page: Page, kind: string, mode: string) => page.locator(`[data-testid="shuffle-outcomes"][data-kind="${kind}"][data-mode="${mode}"]`)
/** The tally's counts, by order. */
const tally = (view: Locator): Promise<Record<string, number>> =>
	view
		.locator('[data-testid="shuffle-tally"] [data-order]')
		.evaluateAll((els) => Object.fromEntries(els.map((e) => [e.getAttribute('data-order') ?? '', Number(e.getAttribute('data-count'))])))

test.beforeEach(({ page }) => open(page))

test('every run of the unfair shuffle: a level per pick, 27 leaves, then 5s and 4s; Esc takes the view back', async ({ page }) => {
	await sketch(page, ['1', '2', '3'])
	await steps(page, 'array-unfair-every-run')
	const tree = view(page, 'unfair', 'tree')
	await expect(tree).toHaveCount(1)
	// Before any pick: the array as it starts.
	await expect(tree.locator('[data-node-depth]')).toHaveCount(1)
	await page.keyboard.press('ArrowRight')
	await expect(tree.locator('[data-node-depth="1"]')).toHaveCount(3)
	await stepToEnd(page)
	await expect(tree.locator('[data-node-depth="3"]')).toHaveCount(27)
	expect(await tally(tree)).toEqual({ '123': 4, '132': 5, '213': 5, '231': 5, '312': 4, '321': 4 })
	await expect(page.getByTestId('play-caption')).toHaveText('27 runs, 6 orders: 132, 213 and 231 come up 5 times, 123, 312 and 321 4. Not fair')
	await page.keyboard.press('Enter')
	// Afterwards it shows the whole run, and stays.
	await expect(tree.locator('[data-node-depth="3"]')).toHaveCount(27)

	// Fisher-Yates' tree goes beside it, 6 leaves, each order once; cancelled, it goes again.
	await steps(page, 'array-fisher-yates-every-run')
	const fair = view(page, 'fisher-yates', 'tree')
	await expect(fair).toHaveCount(1)
	await page.keyboard.press('Escape')
	await expect(fair).toHaveCount(0)
	expect(await shapesOfType(page, 'shuffle-outcomes')).toHaveLength(1)
})

test('run many times: ten times as many runs a step, Fisher-Yates settles on a fair share; deleting the array takes the views', async ({ page }) => {
	await sketch(page, ['1', '2', '3'])
	await steps(page, 'array-fisher-yates-many')
	const bars = view(page, 'fisher-yates', 'tally')
	await expect(page.getByTestId('play-caption')).toHaveText('Fisher-Yates, run 6 times: a fair shuffle would give each order 1')
	await stepToEnd(page)
	const counts = await tally(bars)
	expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(6000)
	// A fair share each, give or take chance (five standard deviations).
	for (const count of Object.values(counts)) expect(Math.abs(count - 1000)).toBeLessThan(150)
	await page.keyboard.press('Enter')

	await menusClosed(page)
	await page.evaluate(() => {
		const editor = window.editor!
		editor.deleteShapes([editor.getCurrentPageShapes().find((s) => s.type === 'array')!.id])
	})
	expect(await shapesOfType(page, 'shuffle-outcomes')).toHaveLength(0)
})

test('the tree is offered for up to three values, the tally for up to four', async ({ page }) => {
	await sketch(page, ['1', '2', '3', '4'])
	await rightClick(page, [200 + CELL, 200])
	await page.getByTestId('context-menu-sub.drawds-array-steps-button').click()
	await page.getByTestId('context-menu-sub.drawds-array-steps-shuffles-button').click()
	await expect(page.getByTestId('context-menu.array-unfair-many')).toBeVisible()
	await expect(page.getByTestId('context-menu.array-unfair-every-run')).toHaveCount(0)
})
