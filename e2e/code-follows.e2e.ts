import { expect, test, type Page } from '@playwright/test'
import type { CodeShapeProps } from '../src/shapes/code/code-shape-types'
import { CELL, open, rightClick, shapesOfType, sketchArray, transitionsDone } from './helpers'

// The running algorithm's code beside the array (the play bar's </> button): the line each step is
// on lit, a pc arrow beside it.

const codeBoxes = (page: Page) => shapesOfType<CodeShapeProps>(page, 'code')
const stepLine = (page: Page) => page.locator('[data-step-line]').getAttribute('data-step-line')
/** The variables' values shown after the lines, top to bottom. */
const values = (page: Page) => page.locator('[data-value-line]').allTextContents()

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
	await page.getByTestId(`context-menu.${item}`).click()
}

/** The code box's line `i`, as drawn. */
const codeLine = (page: Page, i: number) => page.locator(`[data-code-line="${i}"]`)

test.beforeEach(({ page }) => open(page))

test('</> shows bubble sort beside the array: each step lights its line, pc beside it; Esc keeps the box', async ({ page }) => {
	await sketch(page, ['5', '2', '4'])
	await steps(page, 0, 'array-bubble-sort')
	expect(await codeBoxes(page)).toHaveLength(0)
	await page.getByTestId('play-code').click()
	await expect(page.getByTestId('play-code')).toHaveAttribute('aria-pressed', 'true')
	const [box] = await codeBoxes(page)
	expect(box.props).toMatchObject({ algorithm: 'bubble-sort', language: 'java' })
	expect(box.props.code).toMatch(/^void bubbleSort\(int\[\] a\) \{/)
	// To the array's right, its top level with the array's.
	const [array] = await shapesOfType(page, 'array')
	expect(box.x).toBeGreaterThan(array.x + 3 * CELL)

	// Step 1 compares a[0] and a[1]: the if line.
	await expect.poll(() => stepLine(page)).not.toBeNull()
	await expect(codeLine(page, Number(await stepLine(page)))).toHaveText('if (a[j] > a[j + 1]) {')
	// The loops' variables beside their lines, as the steps run.
	expect(await values(page)).toEqual(['pass = 1', 'swapped = false', 'j = 0'])
	await page.keyboard.press('ArrowRight')
	await expect(page.getByTestId('play-caption')).toHaveText('swap(a[0], a[1])')
	await expect(codeLine(page, Number(await stepLine(page)))).toHaveText('swap(a, j, j + 1);')
	expect(await values(page)).toEqual(['pass = 1', 'swapped = true', 'j = 0'])
	await page.keyboard.press('ArrowRight')
	expect(await values(page)).toEqual(['pass = 1', 'swapped = true', 'j = 1'])
	await page.keyboard.press('ArrowLeft')
	// pc points at the lit line.
	await transitionsDone(page)
	const pc = await page.locator('[data-pointer="pc"]').boundingBox()
	const lit = await page.locator('[data-step-line]').boundingBox()
	expect(Math.abs(pc!.y + pc!.height / 2 - (lit!.y + lit!.height / 2))).toBeLessThan(4)
	expect(pc!.x + pc!.width).toBeLessThanOrEqual(lit!.x + 2)

	// Cancelled: the array as it was, the box (asked for) stays, nothing lit.
	await page.keyboard.press('Escape')
	expect(await codeBoxes(page)).toHaveLength(1)
	await expect(page.locator('[data-step-line]')).toHaveCount(0)
	await expect(page.locator('[data-pointer="pc"]')).toHaveCount(0)
})

test('the next algorithm takes over the box (Esc puts the last one back); Python from the style panel; </> again takes it away', async ({ page }) => {
	await sketch(page, ['5', '2', '4'])
	await steps(page, 0, 'array-bubble-sort')
	await page.getByTestId('play-code').click()
	await page.keyboard.press('Enter')
	await expect(page.getByTestId('play-bar')).toHaveCount(0)

	// Selection sort: the same box shows its code, pressed already.
	await steps(page, 0, 'array-selection-sort')
	await expect(page.getByTestId('play-code')).toHaveAttribute('aria-pressed', 'true')
	expect((await codeBoxes(page))[0].props).toMatchObject({ algorithm: 'selection-sort' })
	await expect(codeLine(page, Number(await stepLine(page)))).toHaveText('int min = i;')
	await page.keyboard.press('Escape')
	expect((await codeBoxes(page))[0].props.algorithm).toBe('bubble-sort')

	// The box in Python: the same algorithm, written in Python.
	const [box] = await codeBoxes(page)
	await page.evaluate((id: string) => void window.editor!.select(id as never), String(box.id))
	await page.getByTestId('style.code-language.python').click()
	expect((await codeBoxes(page))[0].props.code).toMatch(/^def bubble_sort\(a\):/)
	await page.evaluate(() => void window.editor!.selectNone())

	// Find the largest in Python: maxval's strip stays under the array, the bar goes under the box.
	await steps(page, 0, 'array-find-max')
	expect((await codeBoxes(page))[0].props).toMatchObject({ algorithm: 'find-max', language: 'python' })
	await expect(codeLine(page, Number(await stepLine(page)))).toHaveText('maxval = a[0]')
	expect(await values(page)).toEqual(['maxval = 2', 'i = 0'])
	const strip = (await page.getByTestId('playback-strip').boundingBox())!
	const bar = (await page.getByTestId('play-bar').boundingBox())!
	const code = (await page.locator('[data-testid="code-box"] > rect').first().boundingBox())!
	expect(strip.y).toBeLessThan(code.y + code.height)
	expect(bar.y).toBeGreaterThan(code.y + code.height)

	await page.getByTestId('play-code').click()
	expect(await codeBoxes(page)).toHaveLength(0)
	await expect(page.getByTestId('play-code')).toHaveAttribute('aria-pressed', 'false')
})

test('predict mode: while a step is asked about, the line before it stays lit', async ({ page }) => {
	await sketch(page, ['5', '2', '4'])
	// Linear search for 4: 5 and 2 aren't it, then found.
	await steps(page, 2, 'array-linear-search')
	await page.getByTestId('play-code').click()
	await page.getByTestId('play-predict').click()
	await expect(codeLine(page, Number(await stepLine(page)))).toHaveText('if (a[i] == key) {')
	await page.keyboard.press('ArrowRight')
	await page.keyboard.press('ArrowRight')
	// Asking about step 3: step 2's line, until the answer.
	await page.keyboard.press('ArrowRight')
	await expect(page.getByTestId('play-caption')).toHaveAttribute('data-asking', 'true')
	await expect(codeLine(page, Number(await stepLine(page)))).toHaveText('if (a[i] == key) {')
	await page.keyboard.press('ArrowRight')
	await expect(page.getByTestId('play-caption')).toHaveText('i = 2: a[2] = 4. Found 4 at index 2')
	await expect(codeLine(page, Number(await stepLine(page)))).toHaveText('return i;')
	await page.getByTestId('play-predict').click()
})

test("Show > Times each line runs: lecture 3's column ticks up and ends on the totals (insertion sort, worst case)", async ({ page }) => {
	await sketch(page, ['3', '2', '1'])
	await steps(page, 0, 'array-insertion-sort')
	await page.getByTestId('play-code').click()
	await page.keyboard.press('Escape')
	const box = (await page.locator('[data-testid="code-box"] > rect').first().boundingBox())!
	await rightClick(page, [box.x + box.width / 2, box.y + box.height / 2])
	await page.getByTestId('context-menu-sub.drawds-code-show-button').click()
	await page.getByTestId('context-menu.code-line-counts').click()
	expect((await codeBoxes(page))[0].props.lineCounts).toBe(true)
	await page.keyboard.press('Escape')

	await steps(page, 0, 'array-insertion-sort')
	const counts = () => page.locator('[data-count-line]').allTextContents()
	// Nothing has run yet: every line of the loop at 0.
	expect(await counts()).toEqual(['×0', '×0', '×0', '×0', '×0', '×0'])
	while (!(await page.getByTestId('play-done').count())) await page.keyboard.press('ArrowRight')
	// n = 3: the for test n times, its body n - 1, the while test n(n + 1)/2 - 1, the swaps n(n - 1)/2.
	expect(await counts()).toEqual(['×3', '×2', '×2', '×5', '×3', '×3'])
})
