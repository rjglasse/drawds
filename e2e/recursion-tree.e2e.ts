import { expect, test, type Page } from '@playwright/test'
import type { RecursionTreeShapeProps } from '../src/shapes/recursion/recursion-tree-shape-types'
import { arrayStep, CELL, open, rightClick, shapesOfType, sketchArray, withEditor } from './helpers'

const caption = (page: Page) => page.getByTestId('play-caption')
const trees = (page: Page) => shapesOfType<RecursionTreeShapeProps>(page, 'recursion-tree')
/** The calls the tree draws now, each as "label result". */
const drawnCalls = (page: Page) =>
	page.locator('[data-call]').evaluateAll((gs) => gs.map((g) => [...g.querySelectorAll('text')].map((t) => t.textContent).join(' ')))

async function setValues(page: Page, values: string[]) {
	await page.evaluate((values) => {
		const editor = window.editor!
		const shape = editor.getCurrentPageShapes().find((s) => s.type === 'array')!
		editor.updateShape({ id: shape.id, type: 'array', props: { values } } as never)
	}, values)
}

/** Right-click the array (first cell at 200, 200), Step by step > item. */
async function sum(page: Page, item: 'array-sum-halves' | 'array-sum-rest') {
	await rightClick(page, [200, 200])
	await page.getByTestId('context-menu-sub.drawds-array-steps-button').click()
	await arrayStep(page, item)
	await expect(page.getByTestId('play-bar')).toBeVisible()
}

async function stepToEnd(page: Page) {
	while (!(await page.getByTestId('play-done').count())) await page.keyboard.press('ArrowRight')
}

test.beforeEach(({ page }) => open(page))

test('sum by halves grows its recursion tree beside the array, call by call, and leaves it with every result', async ({ page }) => {
	await sketchArray(page, [200, 200], 4)
	await setValues(page, ['3', '1', '4', '1'])
	await sum(page, 'array-sum-halves')
	const [tree] = await trees(page)
	const array = (await shapesOfType(page, 'array'))[0]
	expect(tree.props.structureId).toBe(array.id)
	expect(tree.props.calls.map((c) => c.label)).toEqual(['sum(0, 3)', 'sum(0, 1)', 'sum(0, 0)', 'sum(1, 1)', 'sum(2, 3)', 'sum(2, 2)', 'sum(3, 3)'])
	// To the array's right.
	expect(tree.x).toBeGreaterThan(200 + 4 * CELL)
	// Only the first call so far, waiting for its result; the heading keeps the count for the end.
	await expect(caption(page)).toHaveText('sum(0, 3): mid = (0 + 3) / 2 = 1, so sum(0, 1) + sum(2, 3)')
	expect(await drawnCalls(page)).toEqual(['sum(0, 3) = ?'])
	await expect(page.getByTestId('recursion-tree')).toContainText('sum by halves')
	await expect(page.getByTestId('recursion-tree')).not.toContainText('7 calls')
	await page.keyboard.press('ArrowRight')
	await page.keyboard.press('ArrowRight')
	// A base case is made and returns in one step.
	await expect(caption(page)).toHaveText('sum(0, 0): one value, so return a[0] = 3')
	expect(await drawnCalls(page)).toEqual(['sum(0, 3) = ?', 'sum(0, 1) = ?', 'sum(0, 0) = 3'])
	// The play bar goes under the tree beside the array, so it never covers it.
	const treeBottom = await withEditor(page, (e) => e.pageToViewport({ x: 0, y: e.getShapePageBounds(e.getCurrentPageShapes().find((s) => s.type === 'recursion-tree')!)!.maxY }).y)
	expect((await page.getByTestId('play-bar').boundingBox())!.y).toBeGreaterThan(treeBottom)
	await stepToEnd(page)
	await expect(caption(page)).toHaveText('sum(0, 3) = 9: 7 calls, but never more than 3 on the stack at once, and 3 additions')
	await expect(page.getByTestId('play-counts')).toHaveText('calls 7 · max depth 3 · additions 3')
	await page.keyboard.press('Enter')
	await expect(page.getByTestId('play-bar')).toHaveCount(0)
	await expect(page.getByTestId('recursion-tree')).toContainText('sum by halves: 7 calls, 3 deep')
	expect(await drawnCalls(page)).toEqual(['sum(0, 3) = 9', 'sum(0, 1) = 4', 'sum(0, 0) = 3', 'sum(1, 1) = 1', 'sum(2, 3) = 5', 'sum(2, 2) = 4', 'sum(3, 3) = 1'])
})

test('Esc takes a new tree away; the same run again reuses its tree; another sits beside it; all go with the array', async ({ page }) => {
	await sketchArray(page, [200, 200], 3)
	await setValues(page, ['2', '7', '1'])
	await sum(page, 'array-sum-halves')
	expect(await trees(page)).toHaveLength(1)
	await page.keyboard.press('Escape')
	await expect(page.getByTestId('play-bar')).toHaveCount(0)
	expect(await trees(page)).toHaveLength(0)
	await sum(page, 'array-sum-halves')
	await page.keyboard.press('Enter')
	await sum(page, 'array-sum-halves')
	expect(await trees(page)).toHaveLength(1)
	// Esc on a run whose tree was already there leaves it.
	await page.keyboard.press('Escape')
	expect(await trees(page)).toHaveLength(1)
	await sum(page, 'array-sum-rest')
	await stepToEnd(page)
	await page.keyboard.press('Enter')
	const [halves, rest] = await withEditor(page, (e) =>
		e
			.getCurrentPageShapes()
			.filter((s) => s.type === 'recursion-tree')
			.map((s) => ({ title: (s.props as RecursionTreeShapeProps).title, minX: e.getShapePageBounds(s)!.minX, maxX: e.getShapePageBounds(s)!.maxX }))
	)
	expect([halves.title, rest.title]).toEqual(['sum by halves', 'sum by last + rest'])
	expect(rest.minX).toBeGreaterThan(halves.maxX)
	// Undo takes the second tree away (its sum changed nothing else).
	await page.keyboard.press('ControlOrMeta+z')
	await expect.poll(async () => (await trees(page)).length).toBe(1)
	await page.keyboard.press('ControlOrMeta+Shift+z')
	await expect.poll(async () => (await trees(page)).length).toBe(2)
	await withEditor(page, (e) => void e.deleteShapes([e.getCurrentPageShapes().find((s) => s.type === 'array')!.id]))
	await expect.poll(async () => (await trees(page)).length).toBe(0)
})

test('the lesson log replays a sum with its tree as it was, then puts the board back', async ({ page }) => {
	await sketchArray(page, [200, 200], 2)
	await setValues(page, ['5', '6'])
	await sum(page, 'array-sum-halves')
	await page.keyboard.press('Enter')
	await withEditor(page, (e) => void e.deleteShapes(e.getCurrentPageShapes().filter((s) => s.type === 'recursion-tree').map((s) => s.id)))
	await page.getByTestId('main-menu.button').click()
	await page.getByTestId('main-menu.drawds.lesson-log').click()
	await page.getByTestId('lesson-replay-0').click()
	await expect(caption(page)).toHaveText('sum(0, 1): mid = (0 + 1) / 2 = 0, so sum(0, 0) + sum(1, 1)')
	expect(await drawnCalls(page)).toEqual(['sum(0, 1) = ?'])
	await page.keyboard.press('ArrowRight')
	expect(await drawnCalls(page)).toEqual(['sum(0, 1) = ?', 'sum(0, 0) = 5'])
	await page.keyboard.press('Escape')
	await expect(page.getByTestId('play-bar')).toHaveCount(0)
	await expect.poll(async () => (await trees(page)).length).toBe(0)
})
