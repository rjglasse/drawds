import { expect, test, type Page } from '@playwright/test'
import type { TreeShapeProps } from '../src/shapes/tree/tree-shape-types'
import { insertKey, open, shapesOfType, sketchHeap, sketchTree } from './helpers'

const tree = async (page: Page) => (await shapesOfType<TreeShapeProps>(page, 'binary-tree'))[0].props
const caption = (page: Page) => page.getByTestId('play-caption')
const counter = (page: Page) => page.getByTestId('play-counter')

/** A full BST of depth 3 (7 nodes), keys 0-99. */
async function sketchBst(page: Page) {
	await page.keyboard.press('Shift+T')
	await page.getByTestId('style.tree-kind.bst').click()
	await sketchTree(page, [600, 170], 3, 1)
	return tree(page)
}

test.beforeEach(({ page }) => open(page))

test('pause an operation, step back and forward, then cancel: nothing changes', async ({ page }) => {
	const before = await sketchBst(page)
	// 200 is bigger than every key: it walks the right spine (3 comparisons).
	await insertKey(page, '200')
	await page.keyboard.press('Space')
	await expect(counter(page)).toHaveText('1/3')
	await expect(caption(page)).toHaveText(`200 > ${before.nodes[0].value}: go right`)
	await page.keyboard.press('ArrowRight')
	await page.keyboard.press('ArrowRight')
	await expect(counter(page)).toHaveText('3/3')
	await expect(caption(page)).toContainText('which has no right child: 200 goes there')
	await page.keyboard.press('ArrowLeft')
	await expect(counter(page)).toHaveText('2/3')
	// Paused: it stays on this step.
	await page.waitForTimeout(1000)
	await expect(counter(page)).toHaveText('2/3')
	await page.keyboard.press('Escape')
	await expect(page.getByTestId('play-bar')).toHaveCount(0)
	expect((await tree(page)).nodes).toEqual(before.nodes)
	// Esc went to the operation, not to tldraw: the tree is still selected.
	expect(await page.evaluate(() => window.editor!.getSelectedShapeIds().length)).toBe(1)
})

test('Enter finishes at once, as one undo step', async ({ page }) => {
	const before = await sketchBst(page)
	await insertKey(page, '200')
	await page.keyboard.press('Space')
	await page.keyboard.press('Enter')
	await expect(page.getByTestId('play-bar')).toHaveCount(0)
	expect((await tree(page)).nodes).toHaveLength(before.nodes.length + 1)
	await page.keyboard.press('ControlOrMeta+z')
	expect((await tree(page)).nodes).toEqual(before.nodes)
})

test('the play bar buttons step too; forward on the last step shows the result and the bar stays', async ({ page }) => {
	const before = await sketchBst(page)
	await insertKey(page, '200')
	await page.getByTestId('play-toggle').click()
	await expect(page.getByTestId('play-back')).toBeDisabled()
	await page.getByTestId('play-forward').click()
	await expect(counter(page)).toHaveText('2/3')
	await page.getByTestId('play-back').click()
	await expect(counter(page)).toHaveText('1/3')
	for (let i = 0; i < 3; i++) await page.getByTestId('play-forward').click()
	// The result is in (one undo step); the bar stays on the last step until Done.
	expect((await tree(page)).nodes).toHaveLength(before.nodes.length + 1)
	await expect(page.getByTestId('play-forward')).toBeDisabled()
	await page.getByTestId('play-done').click()
	await expect(page.getByTestId('play-bar')).toHaveCount(0)
	expect((await tree(page)).nodes).toHaveLength(before.nodes.length + 1)
})

test('after playing, the bar stays: step back through it, replay it; Esc closes it and keeps the result', async ({
	page,
}) => {
	const before = await sketchBst(page)
	await insertKey(page, '200')
	await expect(page.getByTestId('play-done')).toBeVisible({ timeout: 5000 })
	await expect(counter(page)).toHaveText('3/3')
	await page.keyboard.press('ArrowLeft')
	await page.keyboard.press('ArrowLeft')
	await expect(counter(page)).toHaveText('1/3')
	await expect(caption(page)).toHaveText(`200 > ${before.nodes[0].value}: go right`)
	await page.keyboard.press('ArrowRight')
	await page.keyboard.press('ArrowRight')
	await expect(page.getByTestId('play-toggle')).toHaveAttribute('aria-label', 'Replay (Space)')
	await page.keyboard.press('Space')
	await expect(counter(page)).toHaveText('3/3', { timeout: 5000 })
	await page.keyboard.press('Escape')
	await expect(page.getByTestId('play-bar')).toHaveCount(0)
	expect((await tree(page)).nodes).toHaveLength(before.nodes.length + 1)
})

test('selecting something else closes a finished operation', async ({ page }) => {
	await sketchBst(page)
	await insertKey(page, '200')
	await expect(page.getByTestId('play-done')).toBeVisible({ timeout: 5000 })
	await page.mouse.click(150, 700)
	await expect(page.getByTestId('play-bar')).toHaveCount(0)
})

test('step-by-step mode: operations open paused on their first step', async ({ page }) => {
	await sketchHeap(page, [600, 150], 7)
	await insertKey(page, '0')
	await page.getByTestId('play-step-mode').click()
	await expect(page.getByTestId('play-step-mode')).toHaveAttribute('aria-pressed', 'true')
	await page.keyboard.press('Enter')
	await insertKey(page, '-1')
	await expect(caption(page)).toHaveText('Append -1 at the end (index 8)')
	await page.waitForTimeout(1200)
	await expect(counter(page)).toHaveText(/^1\//)
	await page.keyboard.press('ArrowRight')
	await expect(counter(page)).toHaveText(/^2\//)
	await expect(caption(page)).toContainText(', its parent: swap them')
})
