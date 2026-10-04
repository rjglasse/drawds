import { expect, test } from '@playwright/test'
import { nodeScreenPosition, open, sketchHeap, sketchTree } from './helpers'

const rings = (page: import('@playwright/test').Page) => page.locator('[data-warning]')

/** Double-click a node of the selected shape and type a new value. */
async function editNode(page: import('@playwright/test').Page, key: string, value: string) {
	await page.mouse.dblclick(...(await nodeScreenPosition(page, key)))
	await page.keyboard.press('ControlOrMeta+a')
	await page.keyboard.type(value)
	await page.keyboard.press('Enter')
}

test.beforeEach(({ page }) => open(page))

test('a BST rings a node edited out of order; the check can be switched off', async ({ page }) => {
	await page.keyboard.press('Shift+T')
	await page.getByTestId('style.tree-kind.bst').click()
	await sketchTree(page, [600, 170], 3, 1)
	await expect(rings(page)).toHaveCount(0)
	// The leftmost leaf can't be larger than its ancestors.
	await editNode(page, 'nLL', '999')
	await expect(rings(page)).toHaveCount(1)
	await expect(rings(page)).toHaveAttribute('data-warning', 'nLL')
	await page.getByTestId('style.invariant.off').click()
	await expect(rings(page)).toHaveCount(0)
	await page.getByTestId('style.invariant.check').click()
	await expect(rings(page)).toHaveCount(1)
})

test('a heap rings a value that breaks the heap property, in the tree and in the array', async ({ page }) => {
	await sketchHeap(page, [500, 170], 7)
	await expect(rings(page)).toHaveCount(0)
	// A min heap: a leaf smaller than everything breaks it against its parent.
	await editNode(page, '3', '-1')
	await expect(rings(page)).toHaveCount(2)
	expect(await rings(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-warning')).sort())).toEqual(['3', 'a3'])
})
