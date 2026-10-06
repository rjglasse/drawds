import { expect, test, type Page } from '@playwright/test'
import type { TreeShapeProps } from '../src/shapes/tree/tree-shape-types'
import { insertKey, open, shapesOfType, sketchArray, sketchHeap, sketchTree } from './helpers'

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

test('an operation opens paused on step 1: step back and forward, then cancel: nothing changes', async ({ page }) => {
	const before = await sketchBst(page)
	// 200 is bigger than every key: it walks the right spine (3 comparisons).
	await insertKey(page, '200')
	await page.waitForTimeout(1500)
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

test('a presentation clicker steps too: PageDown forward (the result at the end), PageUp back', async ({ page }) => {
	const before = await sketchBst(page)
	await insertKey(page, '200')
	const camera = await page.evaluate(() => window.editor!.getCamera())
	await expect(page.getByTestId('play-forward')).toHaveAttribute('title', 'Step forward (Right or PageDown)')
	await expect(page.getByTestId('play-back')).toHaveAttribute('title', 'Step back (Left or PageUp)')
	await page.keyboard.press('PageDown')
	await page.keyboard.press('PageDown')
	await expect(counter(page)).toHaveText('3/3')
	await page.keyboard.press('PageUp')
	await expect(counter(page)).toHaveText('2/3')
	await page.keyboard.press('PageDown')
	await expect(page.getByTestId('play-forward')).toHaveAttribute('title', 'Show the result (Right or PageDown)')
	await page.keyboard.press('PageDown')
	// Like Right, forward from the last step commits the result and the bar stays for review.
	await expect(page.getByTestId('play-done')).toBeVisible()
	expect((await tree(page)).nodes).toHaveLength(before.nodes.length + 1)
	await page.keyboard.press('PageUp')
	await expect(counter(page)).toHaveText('2/3')
	// The keys went to the operation only: the tree is still selected and the page didn't move.
	expect(await page.evaluate(() => window.editor!.getSelectedShapeIds().length)).toBe(1)
	expect(await page.evaluate(() => window.editor!.getCamera())).toEqual(camera)
})

test('Enter finishes at once, as one undo step', async ({ page }) => {
	const before = await sketchBst(page)
	await insertKey(page, '200')
	await page.keyboard.press('Enter')
	await expect(page.getByTestId('play-bar')).toHaveCount(0)
	expect((await tree(page)).nodes).toHaveLength(before.nodes.length + 1)
	await page.keyboard.press('ControlOrMeta+z')
	expect((await tree(page)).nodes).toEqual(before.nodes)
})

test('the play bar buttons step too; forward on the last step shows the result and the bar stays', async ({ page }) => {
	const before = await sketchBst(page)
	await insertKey(page, '200')
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
	// Play it through.
	await page.keyboard.press('Space')
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
	// Play it through.
	await page.keyboard.press('Space')
	await expect(page.getByTestId('play-done')).toBeVisible({ timeout: 5000 })
	await page.mouse.click(150, 700)
	await expect(page.getByTestId('play-bar')).toHaveCount(0)
})

test('with autoplay on, operations play by themselves', async ({ page }) => {
	await sketchHeap(page, [600, 150], 7)
	await insertKey(page, '0')
	await expect(page.getByTestId('play-autoplay')).toHaveAttribute('aria-pressed', 'false')
	// Turning it on plays the open operation too.
	await page.getByTestId('play-autoplay').click()
	await expect(page.getByTestId('play-autoplay')).toHaveAttribute('aria-pressed', 'true')
	await expect(page.getByTestId('play-done')).toBeVisible({ timeout: 8000 })
	await page.keyboard.press('Enter')
	await insertKey(page, '-1')
	await expect(caption(page)).toHaveText('Append -1 at the end (index 8)')
	await expect(page.getByTestId('play-done')).toBeVisible({ timeout: 8000 })
	await expect(caption(page)).toContainText('done')
})

test('the speed button cycles 1x, 2x, 4x, ½x and is remembered', async ({ page }) => {
	await sketchBst(page)
	await insertKey(page, '200')
	const speed = page.getByTestId('play-speed')
	await expect(speed).toHaveText('1×')
	for (const next of ['2×', '4×', '½×', '1×', '2×']) {
		await speed.click()
		await expect(speed).toHaveText(next)
	}
	// Faster playing: 3 steps at 2x are done well within a second.
	await page.keyboard.press('Space')
	await expect(page.getByTestId('play-done')).toBeVisible({ timeout: 1500 })
	await page.reload()
	await page.waitForFunction(() => !!window.editor)
	expect(await page.evaluate(() => localStorage.getItem('drawds:speed'))).toBe('2')
})

test('the play bar holds still: its buttons stay put as captions, strips and rows come and go', async ({ page }) => {
	const where = async () => {
		const boxes = await Promise.all(['play-toggle', 'play-forward', 'play-speed'].map((id) => page.getByTestId(id).boundingBox()))
		return boxes.map((b) => [Math.round(b!.x), Math.round(b!.y)])
	}
	const holdsStill = async (steps: number) => {
		const first = await where()
		for (let i = 0; i < steps; i++) {
			await page.keyboard.press('ArrowRight')
			expect(await where()).toEqual(first)
		}
	}
	await sketchArray(page, [200, 250], 6)
	await page.mouse.click(200, 250, { button: 'right' })
	await page.getByTestId('context-menu-sub.drawds-array-steps-button').click()
	await page.getByTestId('context-menu.array-bubble-sort').click()
	await holdsStill(8)
	await page.keyboard.press('Escape')
	await page.waitForTimeout(400)
	// A fixed array growing: a second row appears under it, then goes.
	await page.getByTestId('style.array-sizing.fixed').click()
	await page.mouse.click(200, 250, { button: 'right' })
	await page.getByTestId('context-menu-sub.drawds-array-steps-button').click()
	await page.getByTestId('context-menu.array-grow').click()
	await holdsStill(7)
})
