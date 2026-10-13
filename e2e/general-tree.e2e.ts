import { expect, test, type Page } from '@playwright/test'
import type { GeneralTreeShapeProps } from '../src/shapes/general-tree/general-tree-shape-types'
import { CELL, focusedLabel, hoverNode, menusClosed, nodeScreenPosition, open, rightClick, shapesOfType, TREE_LEVEL, withEditor } from './helpers'

const trees = (page: Page) => shapesOfType<GeneralTreeShapeProps>(page, 'general-tree')
const tree = async (page: Page) => (await trees(page))[0]?.props
const values = async (page: Page) => Object.fromEntries((await tree(page)).nodes.map((n) => [n.id, n.value]))

/** Sketch a general tree with `depth` levels, root centred on `at`; `lean` -1 (a stick) .. 1 (every node full). */
async function sketchGeneralTree(page: Page, [x, y]: [number, number], depth: number, lean = 0) {
	await page.keyboard.press('Shift+K')
	await page.mouse.move(x, y)
	await page.mouse.down()
	await page.mouse.move(x + lean * 2 * CELL, y + (depth - 1) * TREE_LEVEL + 10, { steps: 20 })
	await page.mouse.up()
}

/** A node's scene box, its centre in page space. */
const nodeBox = (page: Page, key: string) =>
	page.evaluate((key) => {
		const editor = window.editor!
		const shape = editor.getOnlySelectedShape()!
		const scene = (editor.getShapeUtil(shape) as unknown as {
			getScene(s: unknown): { nodes: { key: string; x: number; y: number; w: number; h: number }[] }
		}).getScene(shape)
		const node = scene.nodes.find((n) => n.key === key)!
		const p = editor.getShapePageTransform(shape).applyToPoint(node)
		return { x: Math.round(p.x), y: Math.round(p.y), w: node.w, h: node.h }
	}, key)

test.beforeEach(({ page }) => open(page))

test('Shift+K: drag down for depth; lean left for a stick, right for every node with three children', async ({ page }) => {
	await sketchGeneralTree(page, [300, 150], 4, -1)
	const stick = await tree(page)
	expect(stick.nodes).toHaveLength(4)
	expect(stick.nodes.every((n) => n.children.length <= 1)).toBe(true)
	expect(await nodeBox(page, 'n')).toMatchObject({ x: 300, y: 150 })

	await sketchGeneralTree(page, [800, 150], 3, 1)
	const full = (await trees(page)).find((s) => s.props.nodes.length !== 4)!
	expect(full.props.nodes).toHaveLength(1 + 3 + 9)
	expect(full.props).toMatchObject({ arity: '3', depth: 3, fullness: 1 })
})

test('build one live: a + adds a last child, a long name widens its node, x removes a subtree, undo', async ({ page }) => {
	await sketchGeneralTree(page, [600, 150], 1)
	for (const name of ['bin', 'home', 'usr']) {
		await hoverNode(page, 'n')
		await page.getByTestId('add-child-n').click()
		await expect.poll(() => focusedLabel(page)).toMatch(/^Cell n\d$/)
		await page.keyboard.type(name)
		await page.keyboard.press('Enter')
	}
	expect((await tree(page)).nodes[0].children).toEqual(['n0', 'n1', 'n2'])
	await hoverNode(page, 'n1')
	await page.getByTestId('add-child-n1').click()
	await expect.poll(() => focusedLabel(page)).toBe('Cell n10')
	await page.keyboard.type('Documents')
	await page.keyboard.press('Enter')
	expect(await values(page)).toMatchObject({ n0: 'bin', n1: 'home', n2: 'usr', n10: 'Documents' })
	// A circle a cell across for "bin"; a stadium for the longer names, as tall.
	expect(await nodeBox(page, 'n0')).toMatchObject({ w: CELL, h: CELL })
	const wide = await nodeBox(page, 'n10')
	expect(wide.w).toBeGreaterThan(CELL * 2)
	expect(wide.h).toBe(CELL)

	await hoverNode(page, 'n1')
	await page.getByTestId('remove-node-n1').click()
	expect((await tree(page)).nodes.map((n) => n.id)).toEqual(['n', 'n0', 'n2'])
	await page.keyboard.press('ControlOrMeta+z')
	expect((await tree(page)).nodes.map((n) => n.id)).toEqual(['n', 'n0', 'n1', 'n2', 'n10'])
})

test('Children per node, picked with the tree selected, sketches it again: values stay, nodes only added', async ({ page }) => {
	await sketchGeneralTree(page, [600, 150], 3, 0.5)
	const before = await values(page)
	await page.getByTestId('style.tree-arity.5').click()
	await expect.poll(async () => (await tree(page)).arity).toBe('5')
	const after = await values(page)
	expect(Object.keys(after).length).toBeGreaterThan(Object.keys(before).length)
	for (const [id, value] of Object.entries(before)) expect(after[id]).toBe(value)
	await page.keyboard.press('ControlOrMeta+z')
	expect(await values(page)).toEqual(before)
})

test('a node moves among its siblings, and a traversal from it plays with its code', async ({ page }) => {
	await sketchGeneralTree(page, [600, 150], 1)
	await withEditor(page, (editor) => {
		const s = editor.getOnlySelectedShape()!
		const N = (id: string, value: string, children: string[] = []) => ({ id, value, children, dx: 0, dy: 0 })
		void editor.updateShape({
			id: s.id,
			type: 'general-tree',
			props: { nodes: [N('n', 'A', ['n0', 'n1', 'n2']), N('n0', 'B'), N('n1', 'C', ['n10']), N('n2', 'D'), N('n10', 'E')] },
		})
	})
	await rightClick(page, await nodeScreenPosition(page, 'n1'))
	await page.getByTestId('context-menu-sub.drawds-general-tree-actions-button').click()
	await page.getByTestId('context-menu.general-tree-move-left').click()
	expect((await tree(page)).nodes[0].children).toEqual(['n1', 'n0', 'n2'])

	await menusClosed(page)
	await rightClick(page, await nodeScreenPosition(page, 'n'))
	await page.getByTestId('context-menu-sub.drawds-general-tree-steps-button').click()
	await page.getByTestId('context-menu.general-tree-post-order').click()
	await expect(page.getByTestId('play-bar')).toBeVisible()
	await expect(page.getByTestId('play-code')).toBeVisible()
	for (let i = 0; i < 30 && !(await page.getByTestId('play-done').isVisible()); i++) await page.keyboard.press('ArrowRight')
	// Post-order: each node's children first, in their new order.
	await expect(page.getByTestId('play-caption')).toHaveText('Done: post-order visits E, C, B, D, A')
	await page.keyboard.press('Enter')
	await expect(page.getByTestId('play-bar')).toBeHidden()
})
