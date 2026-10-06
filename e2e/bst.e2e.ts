import { expect, test, type Page } from '@playwright/test'
import { compareKeys } from '../src/data/compare'
import { bstDelete, bstInsert, bstViolations, inOrder } from '../src/shapes/tree/bst'
import type { TreeShapeProps } from '../src/shapes/tree/tree-shape-types'
import { hoverNode, insertKey, nodeScreenPosition, open, shapesOfType, sketchTree } from './helpers'

const tree = async (page: Page) => (await shapesOfType<TreeShapeProps>(page, 'binary-tree'))[0].props
const pickBst = (page: Page) => page.getByTestId('style.tree-kind.bst').click()
const sorted = (values: string[]) => [...values].sort(compareKeys)

/** Sketch a BST (tree tool, BST kind), returning its props. */
async function sketchBst(page: Page, depth: number, lean: number) {
	await page.keyboard.press('Shift+T')
	await pickBst(page)
	await sketchTree(page, [600, 170], depth, lean)
	return tree(page)
}

test.beforeEach(({ page }) => open(page))

test('any sketched BST is valid: keys sorted in in-order', async ({ page }) => {
	const props = await sketchBst(page, 4, 0.3)
	expect(props.kind).toBe('bst')
	const keys = inOrder(props.nodes).map((n) => n.value)
	expect(keys).toEqual(sorted(keys))
	expect(bstViolations(props.nodes).size).toBe(0)
})

test('insert a key: it lands where the BST algorithm puts it, after the animation', async ({ page }) => {
	const before = await sketchBst(page, 3, 0)
	// A key from the middle of the range that the random tree doesn't hold yet (50 might be there).
	const taken = new Set(before.nodes.map((n) => n.value))
	const key = String(Array.from({ length: 100 }, (_, i) => (50 + i) % 100).find((k) => !taken.has(String(k))))
	const expected = bstInsert(before.nodes, key)
	await insertKey(page, key)
	// Operations open paused on their first step; Enter finishes.
	await page.keyboard.press('Enter')
	expect((await tree(page)).nodes).toHaveLength(before.nodes.length + 1)
	const after = await tree(page)
	expect(after.nodes.map((n) => [n.id, n.children])).toEqual(expected.nodes.map((n) => [n.id, n.children]))
	expect(bstViolations(after.nodes).size).toBe(0)
	// Highlights fade: nothing is left marked.
	expect(after.marks).toEqual({})
	await page.keyboard.press('ControlOrMeta+z')
	expect((await tree(page)).nodes).toHaveLength(before.nodes.length)
})

test('inserting a key that is already there changes nothing', async ({ page }) => {
	const before = await sketchBst(page, 3, 0.5)
	await insertKey(page, before.nodes[0].value)
	await page.waitForTimeout(2000)
	expect((await tree(page)).nodes).toHaveLength(before.nodes.length)
})

test('Shift+Enter keeps the comparison path as marks', async ({ page }) => {
	const before = await sketchBst(page, 3, 1)
	const expected = bstInsert(before.nodes, '200')
	await insertKey(page, '200', true)
	await page.keyboard.press('Enter')
	const marks = (await tree(page)).marks
	for (const id of expected.path) expect(marks[id]).toBe('orange')
	expect(marks[expected.id!]).toBe('green')
})

test('deleting the root of a full BST promotes its in-order successor', async ({ page }) => {
	const before = await sketchBst(page, 3, 1)
	const expected = bstDelete(before.nodes, 'n')
	expect(expected.kind).toBe('two-children')
	await hoverNode(page, 'n')
	await page.getByTestId('remove-node-n').click()
	await page.keyboard.press('Enter')
	expect((await tree(page)).nodes).toHaveLength(before.nodes.length - 1)
	const after = await tree(page)
	expect(after.nodes[0].value).toBe(expected.nodes[0].value)
	expect(bstViolations(after.nodes).size).toBe(0)
})

test('switching a tree to BST keeps its keys and sorts them into in-order positions', async ({ page }) => {
	await sketchTree(page, [600, 170], 3, 0.5)
	const plain = await tree(page)
	await pickBst(page)
	const bst = await tree(page)
	expect(bst.kind).toBe('bst')
	expect(sorted(bst.nodes.map((n) => n.value))).toEqual(sorted(plain.nodes.map((n) => n.value)))
	expect(bstViolations(bst.nodes).size).toBe(0)
	// A BST has no free child slots; it offers "insert a key" instead.
	await hoverNode(page, 'n')
	await expect(page.getByTestId('add-child-n-left')).toHaveCount(0)
	await expect(page.getByTestId('insert-key')).toHaveCount(1)
})

test('search: curr walks down from the root, ruled-out subtrees fade; nothing changes', async ({ page }) => {
	const before = await sketchBst(page, 3, 1)
	const leaf = before.nodes.find((n) => n.id === 'nLR')!
	await page.mouse.click(...(await nodeScreenPosition(page, 'nLR')), { button: 'right' })
	await page.getByTestId('context-menu-sub.drawds-bst-search-button').click()
	await page.getByTestId('context-menu.bst-search').click()
	await expect(page.getByTestId('play-caption')).toHaveText(`curr = root (${before.nodes[0].value}). Is it ${leaf.value}?`)
	await page.keyboard.press('ArrowRight')
	await expect(page.getByTestId('play-caption')).toContainText("so it can't be on the right: curr = curr.left")
	await page.keyboard.press('ArrowRight')
	await page.keyboard.press('ArrowRight')
	await expect(page.getByTestId('play-caption')).toHaveText(`Yes: found ${leaf.value}, after 3 comparisons`)
	await page.keyboard.press('Enter')
	expect(await tree(page)).toEqual(before)
})

test('search for a missing key falls off the tree; traversals are still numbered 0', async ({ page }) => {
	await sketchBst(page, 2, 1)
	await page.mouse.click(...(await nodeScreenPosition(page, 'n')), { button: 'right' })
	await expect(page.getByTestId('context-menu-sub.drawds-node-operations-0-button')).toContainText('Traverse from')
	await page.getByTestId('context-menu-sub.drawds-bst-search-button').click()
	await page.getByTestId('context-menu.bst-search-value').click()
	await page.getByTestId('key-prompt').fill('1000')
	await page.keyboard.press('Enter')
	await page.keyboard.press('ArrowRight')
	await page.keyboard.press('ArrowRight')
	await expect(page.getByTestId('play-caption')).toContainText('curr = null, so 1000 is not in the tree')
})
