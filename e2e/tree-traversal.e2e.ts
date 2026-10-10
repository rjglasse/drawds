import { expect, test, type Page } from '@playwright/test'
import { compareKeys } from '../src/data/compare'
import type { HeapShapeProps } from '../src/shapes/heap/heap-shape-types'
import { traverseTree } from '../src/shapes/tree/traverse'
import type { TreeShapeProps } from '../src/shapes/tree/tree-shape-types'
import { nodeScreenPosition, open, rightClick, shapesOfType, sketchHeap, sketchTree } from './helpers'

const tree = async (page: Page) => (await shapesOfType<TreeShapeProps>(page, 'binary-tree'))[0].props
const heap = async (page: Page) => (await shapesOfType<HeapShapeProps>(page, 'heap'))[0].props

/** Right-click a node: Step by step > the order (a tree's, or a heap's). */
async function traverseFrom(page: Page, key: string, item: string) {
	await rightClick(page, await nodeScreenPosition(page, key))
	await page.getByTestId(`context-menu-sub.drawds-${item.split('-')[0]}-steps-button`).click()
	await page.getByTestId(`context-menu.${item}`).click()
}

/** Step to the end (operations open paused), where the result is in and the bar waits. */
async function stepToEnd(page: Page) {
	while (!(await page.getByTestId('play-done').count())) await page.keyboard.press('ArrowRight')
}

test.beforeEach(({ page }) => open(page))

test('in-order on a BST outputs the keys sorted, and says so', async ({ page }) => {
	await page.keyboard.press('Shift+T')
	await page.getByTestId('style.tree-kind.bst').click()
	await sketchTree(page, [600, 150], 3, 1)
	const { nodes } = await tree(page)
	await traverseFrom(page, 'n', 'tree-in-order')
	await expect(page.getByTestId('play-caption')).toContainText('its left subtree first')
	await stepToEnd(page)
	const sorted = nodes.map((n) => n.value).sort(compareKeys)
	await expect(page.getByTestId('play-caption')).toHaveText(
		`Done: in-order visits ${sorted.join(', ')}: sorted, as in-order on a BST always is`
	)
	await expect(page.getByTestId('playback-strip').filter({ hasText: 'in-order output' })).toHaveCount(1)
})

test('pre-order from a subtree visits just that subtree; Shift+Enter keeps it as marks', async ({ page }) => {
	await sketchTree(page, [600, 150], 3, 1)
	const { nodes } = await tree(page)
	const expected = traverseTree(nodes, 'nL', 'pre').visited
	await traverseFrom(page, 'nL', 'tree-pre-order')
	await page.keyboard.press('Shift+Enter')
	expect(Object.keys((await tree(page)).marks).sort()).toEqual([...expected].sort())
	expect(new Set(Object.values((await tree(page)).marks))).toEqual(new Set(['blue']))
})

test('level order of a heap is its array order, lit in both views', async ({ page }) => {
	await sketchHeap(page, [600, 150], 6)
	const { values } = await heap(page)
	await traverseFrom(page, '0', 'heap-level-order')
	await stepToEnd(page)
	await expect(page.getByTestId('play-caption')).toHaveText(
		`Done: level order visits ${values.join(', ')}. That is the heap's array, index by index`
	)
	await page.keyboard.press('Shift+Enter')
	expect(Object.keys((await heap(page)).marks).sort()).toEqual(values.map((_, i) => String(i)).sort())
})

/** Lecture 8a's tree: A with children B and C; B with D and E. */
async function lectureTree(page: Page) {
	await sketchTree(page, [400, 150], 1)
	await page.evaluate(() => {
		const editor = window.editor!
		const shape = editor.getCurrentPageShapes().find((s) => s.type === 'binary-tree')!
		const n = (id: string, value: string, children: (string | null)[] = [null, null]) => ({ id, value, children, dx: 0, dy: 0 })
		editor.updateShape({ id: shape.id, type: 'binary-tree', props: { nodes: [n('a', 'A', ['b', 'c']), n('b', 'B', ['d', 'e']), n('c', 'C'), n('d', 'D'), n('e', 'E')] } } as never)
	})
}

test("lecture 8a's recursion that returns values: count the leaves, each node's answer badged as its call returns", async ({ page }) => {
	await lectureTree(page)
	await traverseFrom(page, 'a', 'tree-leaves')
	await stepToEnd(page)
	await expect(page.getByTestId('play-caption')).toHaveText('leaves(A) = 3: 3 leaves, each a base case returning 1, added up on the way back')
	// Height (a leaf is 0) with its code beside the tree: A is 2.
	await page.keyboard.press('Enter')
	await traverseFrom(page, 'a', 'tree-height')
	await page.getByTestId('play-code').click()
	await stepToEnd(page)
	await expect(page.getByTestId('play-caption')).toContainText('height(A) = 2: the longest way down from A, counted in edges')
	expect(await shapesOfType(page, 'code')).toHaveLength(1)
})

test("traversals show lecture 8's three-line code, the step's line lit", async ({ page }) => {
	await lectureTree(page)
	await traverseFrom(page, 'a', 'tree-in-order')
	await page.getByTestId('play-code').click()
	await page.keyboard.press('ArrowRight')
	// Step 2: in-order goes left to B: the call on node.left.
	const line = await page.locator('[data-step-line]').getAttribute('data-step-line')
	await expect(page.locator(`[data-code-line="${line}"]`)).toContainText('inOrder(node.left)')
})
