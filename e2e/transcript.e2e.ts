import { expect, test, type Page } from '@playwright/test'
import { arrayStep, hoverNode, insertKey, nodeScreenPosition, open, rightClick, sketchArray, sketchList, sketchTree } from './helpers'

// The code beside an array: every move made on it, as code, kept in its meta so undo and redo take
// the lines with the moves.

const lines = (page: Page) => page.locator('[data-shape-type="code"] [data-code-line]').allTextContents()

async function menu(page: Page, sub: 'show' | 'actions' | 'steps', item: string) {
	await rightClick(page, [200, 200])
	await page.getByTestId(`context-menu-sub.drawds-array-${sub}-button`).click()
	if (sub === 'steps') await arrayStep(page, item)
	else await page.getByTestId(`context-menu.${item}`).click()
}

test.beforeEach(({ page }) => open(page))

test('the code beside an array: a line per move, typing one line, an operation its call; undo takes the line too', async ({ page }) => {
	await sketchArray(page, [200, 200], 4)
	await menu(page, 'show', 'array-code-beside')
	await expect.poll(() => lines(page)).toHaveLength(1)
	expect((await lines(page))[0]).toMatch(/^List<Integer> a = new ArrayList<>\(List\.of\(\d+, \d+, \d+, \d+\)\);$/)

	// Typing 4, then 42: one line.
	await page.mouse.dblclick(200, 200)
	await page.keyboard.type('42')
	await page.keyboard.press('Enter')
	await expect.poll(() => lines(page)).toHaveLength(2)
	expect((await lines(page))[1]).toBe('a.set(0, 42);')

	await menu(page, 'actions', 'array-reverse')
	await expect.poll(() => lines(page)).toHaveLength(3)
	expect((await lines(page))[2]).toBe('Collections.reverse(a);')

	// Played step by step and put in (Enter: the result, and the bar goes): the algorithm, not what a
	// diff would guess.
	await menu(page, 'steps', 'array-bubble-sort')
	await page.keyboard.press('Enter')
	await expect.poll(() => lines(page)).toHaveLength(4)
	expect((await lines(page))[3]).toBe('bubbleSort(a);')

	await page.keyboard.press('ControlOrMeta+z')
	await expect.poll(() => lines(page)).toHaveLength(3)
	await page.keyboard.press('ControlOrMeta+Shift+z')
	await expect.poll(() => lines(page)).toHaveLength(4)

	// Another language: the same moves written out again.
	await page.evaluate(() => {
		const editor = window.editor!
		void editor.select(editor.getCurrentPageShapes().find((s) => s.type === 'code')!.id)
	})
	await page.getByTestId('style.code-language.python').click()
	await expect.poll(async () => (await lines(page)).slice(1)).toEqual(['a[0] = 42', 'a.reverse()', 'bubble_sort(a)'])
})

test('the code beside a list: drawds’ own list methods, a + insert then typing one line, an operation its call', async ({ page }) => {
	await sketchList(page, [200, 200], 4)
	const node = (key: string) => nodeScreenPosition(page, key)
	await rightClick(page, await node('n0'))
	await page.getByTestId('context-menu-sub.drawds-list-show-button').click()
	await page.getByTestId('context-menu.list-code-beside').click()
	await expect.poll(() => lines(page)).toHaveLength(1)
	expect((await lines(page))[0]).toMatch(/^LinkedList a = new LinkedList\(\d+, \d+, \d+, \d+\);$/)

	await expect(page.locator('.tlui-menu')).toHaveCount(0)
	await page.mouse.dblclick(...(await node('n0')))
	await page.keyboard.type('42')
	await page.keyboard.press('Enter')
	await expect.poll(() => lines(page)).toEqual([expect.any(String), 'a.nodeAt(0).value = 42;'])

	await hoverNode(page, 'n0', 'n1')
	await page.getByTestId('insert-on-n0->').click()
	await page.keyboard.type('7')
	await page.keyboard.press('Enter')
	await expect.poll(async () => (await lines(page)).at(-1)).toBe('a.insertAfter(a.nodeAt(0), 7);')

	await rightClick(page, await node('n0'))
	await page.getByTestId('context-menu-sub.drawds-list-steps-button').click()
	await page.getByTestId('context-menu.list-reverse').click()
	await page.keyboard.press('Enter')
	await expect.poll(async () => (await lines(page)).at(-1)).toBe('a.reverse();')
	await page.keyboard.press('ControlOrMeta+z')
	await expect.poll(async () => (await lines(page)).at(-1)).toBe('a.insertAfter(a.nodeAt(0), 7);')
})

test('the code beside a tree: nodes by their paths; a BST insert and delete are calls with their key and node', async ({ page }) => {
	await sketchTree(page, [400, 150], 1)
	await rightClick(page, await nodeScreenPosition(page, 'n'))
	await page.getByTestId('context-menu-sub.drawds-tree-show-button').click()
	await page.getByTestId('context-menu.tree-code-beside').click()
	await expect.poll(() => lines(page)).toHaveLength(1)
	await page.evaluate(() => {
		const editor = window.editor!
		void editor.select(editor.getCurrentPageShapes().find((s) => s.type === 'binary-tree')!.id)
	})
	await hoverNode(page, 'n')
	await page.getByTestId('add-child-n-left').click()
	await page.keyboard.type('3')
	await page.keyboard.press('Enter')
	await expect.poll(async () => (await lines(page)).at(-1)).toBe('a.root.left = new Node(3);')

	// A BST: the operations are calls, their key and node told from what they did.
	await page.evaluate(() => {
		const editor = window.editor!
		const tree = editor.getCurrentPageShapes().find((s) => s.type === 'binary-tree')!
		editor.updateShape({ id: tree.id, type: 'binary-tree', props: { kind: 'bst', nodes: [{ ...(tree.props as { nodes: object[] }).nodes[0], value: '8' }, ...(tree.props as { nodes: object[] }).nodes.slice(1)] } } as never)
	})
	await insertKey(page, '12')
	await page.keyboard.press('Enter')
	await expect.poll(async () => (await lines(page)).at(-1)).toBe('a.insert(12);')
	await hoverNode(page, 'nL')
	await page.getByTestId('remove-node-nL').click()
	await page.keyboard.press('Enter')
	await expect.poll(async () => (await lines(page)).at(-1)).toBe('a.delete(a.root.left);')
	await page.keyboard.press('ControlOrMeta+z')
	await expect.poll(async () => (await lines(page)).at(-1)).toBe('a.insert(12);')
})
