import { expect, test, type Page } from '@playwright/test'
import { compareKeys } from '../src/data/compare'
import { bstDelete, bstInsert, bstViolations, inOrder } from '../src/shapes/tree/bst'
import type { TreeShapeProps } from '../src/shapes/tree/tree-shape-types'
import { hoverNode, insertKey, open, shapesOfType, sketchTree } from './helpers'

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
	const expected = bstInsert(before.nodes, '50')
	await insertKey(page, '50')
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
