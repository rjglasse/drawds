import { expect, test, type Page } from '@playwright/test'
import { arrayStep, insertKey, nodeScreenPosition, open, rightClick, sketchArray, sketchList, sketchTree } from './helpers'

// The code beside more operations: BST insert, a list's delete, an array's insert by shifting. Each
// opens its code (the play bar's </>) and lights the line its step is on.

/** The text of the line the step on screen lights. */
async function litLine(page: Page) {
	const line = await page.locator('[data-step-line]').getAttribute('data-step-line')
	return page.locator(`[data-code-line="${line}"]`).textContent()
}

test.beforeEach(({ page }) => open(page))

test('BST insert: walk down comparing, each step a line of insert', async ({ page }) => {
	await page.keyboard.press('Shift+T')
	await page.getByTestId('style.tree-kind.bst').click()
	await sketchTree(page, [600, 170], 3, 1)
	await insertKey(page, '1000')
	await page.getByTestId('play-code').click()
	// 1000 is larger than every key: right every time.
	await expect.poll(() => litLine(page)).toContain('} else {')
})

test("a list's delete: prev and curr walk, then the arrow before it goes round it", async ({ page }) => {
	await sketchList(page, [200, 200], 3)
	await rightClick(page, await nodeScreenPosition(page, 'n2'))
	await page.getByTestId('context-menu-sub.drawds-list-steps-button').click()
	await page.getByTestId('context-menu.list-delete').click()
	await page.getByTestId('play-code').click()
	await expect.poll(() => litLine(page)).toContain('Node prev = null, curr = head;')
	await page.keyboard.press('ArrowRight')
	await page.keyboard.press('ArrowRight')
	await page.keyboard.press('ArrowRight')
	await expect.poll(() => litLine(page)).toContain('else prev.next = curr.next;')
})

test("an array's insert by shifting: grow, shift from the end, place", async ({ page }) => {
	await sketchArray(page, [200, 200], 3)
	await rightClick(page, [200, 200])
	await page.getByTestId('context-menu-sub.drawds-array-steps-button').click()
	await arrayStep(page, 'array-insert')
	await page.getByTestId('play-code').click()
	await expect.poll(() => litLine(page)).toContain('a = Arrays.copyOf(a, a.length + 1);')
	await page.keyboard.press('ArrowRight')
	await expect.poll(() => litLine(page)).toContain('a[i] = a[i - 1];')
})
