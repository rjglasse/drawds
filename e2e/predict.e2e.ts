import { expect, test, type Page } from '@playwright/test'
import type { TreeShapeProps } from '../src/shapes/tree/tree-shape-types'
import { arrayStep, insertKey, nodeScreenPosition, open, rightClick, shapesOfType, sketchArray, sketchGraph, sketchTree } from './helpers'

const tree = async (page: Page) => (await shapesOfType<TreeShapeProps>(page, 'binary-tree'))[0].props
const caption = (page: Page) => page.getByTestId('play-caption')
const counter = (page: Page) => page.getByTestId('play-counter')
const asking = (page: Page) => page.locator('[data-testid="play-caption"][data-asking]')
const pulsing = (page: Page) => page.locator('[data-pulse]')

/** A full BST of depth 3: ids n, nL, nR, nLL ... nRR. */
async function sketchBst(page: Page) {
	await page.keyboard.press('Shift+T')
	await page.getByTestId('style.tree-kind.bst').click()
	await sketchTree(page, [600, 170], 3, 1)
	return tree(page)
}

/** Predict mode on before the page loads, as if switched on in an earlier lesson. */
const predicting = (page: Page) => page.addInitScript(() => window.localStorage.setItem('drawds:predict', 'on'))

test('predict mode: each step is first a question, then its answer; back undoes one press at a time', async ({ page }) => {
	await open(page)
	const { nodes } = await sketchBst(page)
	const value = (id: string) => nodes.find((n) => n.id === id)!.value
	// 200 is bigger than every key: it walks the right spine, n, nR, nRR.
	await insertKey(page, '200')
	await expect(caption(page)).toHaveText(`200 > ${value('n')}: go right`)
	await page.getByTestId('play-predict').click()
	await expect(page.getByTestId('play-predict')).toHaveAttribute('aria-pressed', 'true')

	// The question about step 2, with step 1 still on screen and the node to compare pulsing.
	await page.keyboard.press('ArrowRight')
	await expect(asking(page)).toHaveText(`200 vs ${value('nR')}: which way?`)
	await expect(counter(page)).toHaveText('2/3')
	await expect(pulsing(page)).toHaveCount(1)
	await expect(pulsing(page)).toHaveAttribute('data-pulse', 'nR')
	await expect(page.getByTestId('play-forward')).toHaveAttribute('title', 'Show the answer (Right or PageDown)')
	// The answer.
	await page.keyboard.press('ArrowRight')
	await expect(caption(page)).toHaveText(`200 > ${value('nR')}: go right`)
	await expect(asking(page)).toHaveCount(0)
	await expect(pulsing(page)).toHaveCount(0)

	// Back: the question again, then the step before, then its question.
	await page.keyboard.press('ArrowLeft')
	await expect(asking(page)).toHaveText(`200 vs ${value('nR')}: which way?`)
	await page.keyboard.press('ArrowLeft')
	await expect(caption(page)).toHaveText(`200 > ${value('n')}: go right`)
	await expect(counter(page)).toHaveText('1/3')
	await page.keyboard.press('ArrowLeft')
	await expect(asking(page)).toHaveText(`Insert 200, starting at the root: 200 vs ${value('n')}, which way?`)
	await expect(pulsing(page)).toHaveAttribute('data-pulse', 'n')
	await expect(page.getByTestId('play-back')).toBeDisabled()

	// Through to the end: two presses a step, then the result as usual.
	for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight')
	await expect(caption(page)).toHaveText(`200 > ${value('nRR')}, which has no right child: 200 goes there`)
	await page.keyboard.press('ArrowRight')
	await expect(page.getByTestId('play-done')).toBeVisible()
	expect((await tree(page)).nodes).toHaveLength(nodes.length + 1)
	// Once the result is in, stepping back goes straight through the steps: nothing left to guess.
	await page.keyboard.press('ArrowLeft')
	await expect(caption(page)).toHaveText(`200 > ${value('nR')}: go right`)
})

test('predict mode stays on: the next operation opens on its first question', async ({ page }) => {
	await open(page)
	const { nodes } = await sketchBst(page)
	await insertKey(page, '200')
	await page.getByTestId('play-predict').click()
	await page.keyboard.press('Escape')
	// Kept for the next lesson too (the tests below start with it on).
	expect(await page.evaluate(() => window.localStorage.getItem('drawds:predict'))).toBe('on')
	await insertKey(page, '200')
	await expect(asking(page)).toHaveText(`Insert 200, starting at the root: 200 vs ${nodes[0].value}, which way?`)
	await expect(counter(page)).toHaveText('1/3')
	// Switched off mid-question: the answer shows.
	await page.getByTestId('play-predict').click()
	await expect(caption(page)).toHaveText(`200 > ${nodes[0].value}: go right`)
	await expect(asking(page)).toHaveCount(0)
})

test('in predict mode, playing goes straight through: no questions', async ({ page }) => {
	await predicting(page)
	await open(page)
	const { nodes } = await sketchBst(page)
	await insertKey(page, '200')
	await expect(asking(page)).toHaveCount(1)
	// Space answers the question and plays on to the result.
	await page.keyboard.press('Space')
	await expect(asking(page)).toHaveCount(0)
	await expect(page.getByTestId('play-done')).toBeVisible({ timeout: 5000 })
	await expect(caption(page)).toHaveText(`200 > ${nodes.find((n) => n.id === 'nRR')!.value}, which has no right child: 200 goes there`)
	expect((await tree(page)).nodes).toHaveLength(nodes.length + 1)
})

test('BFS asks which node leaves the queue and, edge by edge, whether the far end is new', async ({ page }) => {
	await predicting(page)
	await open(page)
	await sketchGraph(page, [300, 200], 5)
	await rightClick(page, await nodeScreenPosition(page, 'v0'))
	await page.getByTestId('context-menu-sub.drawds-graph-steps-button').click()
	await page.getByTestId('context-menu.graph-bfs').click()
	await expect(asking(page)).toHaveText('What happens next?')
	await page.keyboard.press('ArrowRight')
	await expect(caption(page)).toHaveText('Start at A: queue it and mark it visited (1)')
	await page.keyboard.press('ArrowRight')
	await expect(asking(page)).toHaveText('Which node comes off the queue next?')
	await page.keyboard.press('ArrowRight')
	await expect(caption(page)).toHaveText('Dequeue A and look at its edges')
	await page.keyboard.press('ArrowRight')
	await expect(asking(page)).toHaveText(/^A–(\w): is \1 new\?$/)
	await expect(pulsing(page)).toHaveAttribute('data-pulse', /^edge:/)
	await page.keyboard.press('ArrowRight')
	await expect(caption(page)).toHaveText(/^A–(\w): \1 is new: mark it visited \(2\) and queue it$/)
})

test('hash insert asks which bucket the key hashes to', async ({ page }) => {
	await predicting(page)
	await open(page)
	await page.keyboard.press('Shift+B')
	await page.mouse.move(300, 150)
	await page.mouse.down()
	await page.mouse.move(300, 150 + 6 * 48 + 10, { steps: 20 })
	await page.mouse.up()
	await page.evaluate(() => {
		const editor = window.editor!
		const shape = editor.getCurrentPageShapes().find((s) => s.type === 'hash-table')!
		editor.updateShape({ id: shape.id, type: 'hash-table', props: { buckets: [[], ['8'], [], [], [], [], []] } } as never)
	})
	await insertKey(page, '22')
	await expect(asking(page)).toHaveText('Insert 22: with m = 7, which bucket does h(22) give?')
	await page.keyboard.press('ArrowRight')
	await expect(caption(page)).toHaveText("Insert 22: h(22) = 22 mod 7 = 1: walk bucket 1's chain")
})

/** An array at (200, 200) holding `values`, selected; right-click cell `i` > Step by step > `item`. */
async function arrayOperation(page: Page, values: string[], i: number, item: string) {
	await sketchArray(page, [200, 200], values.length)
	await page.evaluate((values) => {
		const e = window.editor!
		const s = e.getOnlySelectedShape()!
		e.updateShape({ id: s.id, type: 'array', props: { values } } as never)
	}, values)
	await rightClick(page, [200 + i * 48, 200])
	await page.getByTestId('context-menu-sub.drawds-array-steps-button').click()
	await arrayStep(page, item)
}

test('binary search asks where mid is, then "found it, or which half?" with that cell pulsing', async ({ page }) => {
	await predicting(page)
	await open(page)
	await arrayOperation(page, ['10', '20', '30', '40', '50'], 3, 'array-binary-search')
	await expect(asking(page)).toHaveText('Binary search for 40: where do lo and hi start?')
	await page.keyboard.press('ArrowRight')
	await expect(caption(page)).toHaveText('lo = 0, hi = 4: 40 could be anywhere in a[0..4]')
	await page.keyboard.press('ArrowRight')
	await expect(asking(page)).toHaveText('lo = 0, hi = 4: which index is mid?')
	await page.keyboard.press('ArrowRight')
	await expect(caption(page)).toHaveText('mid = (0 + 4) / 2 = 2. Is a[2] = 30 equal to 40?')
	await page.keyboard.press('ArrowRight')
	await expect(asking(page)).toHaveText('a[2] = 30 vs 40: found it, or which half is left?')
	await expect(pulsing(page)).toHaveAttribute('data-pulse', '2')
	await page.keyboard.press('ArrowRight')
	await expect(caption(page)).toHaveText('30 < 40, so 40 can only be right of mid: lo = mid + 1 = 3')
	await expect(pulsing(page)).toHaveCount(0)
})

test('bubble sort: "swap or leave?", then the swap itself shows in one press, either way', async ({ page }) => {
	await predicting(page)
	await open(page)
	await arrayOperation(page, ['20', '10', '30'], 0, 'array-bubble-sort')
	await expect(asking(page)).toHaveText('a[0] = 20 vs a[1] = 10: swap them or leave them?')
	await expect(page.locator('[data-pulse]')).toHaveCount(2)
	await page.keyboard.press('ArrowRight')
	await expect(caption(page)).toHaveText('Pass 1: a[0] = 20 > a[1] = 10: swap them')
	// Nothing to guess: the swap was just announced.
	await page.keyboard.press('ArrowRight')
	await expect(caption(page)).toHaveText('swap(a[0], a[1])')
	await expect(asking(page)).toHaveCount(0)
	await page.keyboard.press('ArrowRight')
	await expect(asking(page)).toHaveText('a[1] = 20 vs a[2] = 30: swap them or leave them?')
	// Back: the step before (no question to ask again on the swap), then the comparison.
	await page.keyboard.press('ArrowLeft')
	await expect(caption(page)).toHaveText('swap(a[0], a[1])')
	await page.keyboard.press('ArrowLeft')
	await expect(caption(page)).toHaveText('Pass 1: a[0] = 20 > a[1] = 10: swap them')
})
