import { expect, test, type Page } from '@playwright/test'
import type { TreeShapeProps } from '../src/shapes/tree/tree-shape-types'
import { CELL, TREE_LEVEL, focusedLabel, hoverNode, open, shapesOfType, sketchTree, withEditor } from './helpers'

const tree = async (page: Page) => (await shapesOfType<TreeShapeProps>(page, 'binary-tree'))[0]?.props
const ids = async (page: Page) => (await tree(page)).nodes.map((n) => n.id)

/** Page position of the root, and how many null markers the scene draws. */
const sceneFacts = (page: Page) =>
	withEditor(page, (editor) => {
		const shape = editor.getOnlySelectedShape()!
		const scene = (editor.getShapeUtil(shape) as unknown as {
			getScene(s: unknown): { nodes: { key: string; kind: string; x: number; y: number }[] }
		}).getScene(shape)
		const root = scene.nodes.find((n) => n.key === 'n')!
		const p = editor.getShapePageTransform(shape).applyToPoint(root)
		return { root: [Math.round(p.x), Math.round(p.y)], nulls: scene.nodes.filter((n) => n.kind === 'null').length }
	})

async function addChild(page: Page, parent: string, side: 'left' | 'right', value?: string) {
	await hoverNode(page, parent)
	await page.getByTestId(`add-child-${parent}-${side}`).click()
	if (value) await page.keyboard.type(value)
	await page.keyboard.press('Enter')
}

test.beforeEach(({ page }) => open(page))

test('drag down for depth; lean left for a stick, right for a perfect tree', async ({ page }) => {
	await sketchTree(page, [300, 150], 4, -1)
	const stick = await tree(page)
	expect(stick.nodes).toHaveLength(4)
	expect(stick.nodes.every((n) => n.children.filter(Boolean).length <= 1)).toBe(true)
	expect((await sceneFacts(page)).root).toEqual([300, 150])

	await sketchTree(page, [800, 150], 3, 1)
	const perfect = (await shapesOfType<TreeShapeProps>(page, 'binary-tree')).find((s) => s.props.nodes.length !== 4)!
	expect(perfect.props.nodes).toHaveLength(7)
})

test('values stay put as the tree grows during the drag', async ({ page }) => {
	await page.keyboard.press('Shift+T')
	await page.mouse.move(500, 150)
	await page.mouse.down()
	await page.mouse.move(500 + CELL, 150 + TREE_LEVEL + 10, { steps: 8 })
	const shallow = await withEditor(page, (e) =>
		Object.fromEntries((e.getCurrentPageShapes()[0].props as TreeShapeProps).nodes.map((n) => [n.id, n.value]))
	)
	await page.mouse.move(500 + CELL * 1.5, 150 + TREE_LEVEL * 3 + 10, { steps: 8 })
	await page.mouse.up()
	const deep = Object.fromEntries((await tree(page)).nodes.map((n) => [n.id, n.value]))
	for (const [id, value] of Object.entries(shallow)) expect(deep[id]).toBe(value)
	expect(Object.keys(deep).length).toBeGreaterThan(Object.keys(shallow).length)
})

test('build a tree live: add children, type values, remove a subtree, undo', async ({ page }) => {
	await sketchTree(page, [600, 150], 1)
	await hoverNode(page, 'n')
	await page.getByTestId('add-child-n-left').click()
	expect(await focusedLabel(page)).toBe('Cell nL')
	await page.keyboard.type('42')
	await page.keyboard.press('Enter')
	await addChild(page, 'n', 'right')
	await addChild(page, 'nL', 'right', '7')
	const built = await tree(page)
	expect(built.nodes.map((n) => [n.id, n.children])).toEqual([
		['n', ['nL', 'nR']],
		['nL', [null, 'nLR']],
		['nR', [null, null]],
		['nLR', [null, null]],
	])
	expect(built.nodes.find((n) => n.id === 'nL')!.value).toBe('42')
	expect(built.nodes.find((n) => n.id === 'nLR')!.value).toBe('7')
	// The root stayed where it was sketched.
	expect((await sceneFacts(page)).root).toEqual([600, 150])

	await hoverNode(page, 'nL')
	await page.getByTestId('remove-node-nL').click()
	expect(await ids(page)).toEqual(['n', 'nR'])
	await page.keyboard.press('ControlOrMeta+z')
	expect(await ids(page)).toEqual(['n', 'nL', 'nR', 'nLR'])

	// The root can't be removed (delete the shape for that), and a full node offers no + slots.
	await hoverNode(page, 'n')
	await expect(page.getByTestId('remove-node-n')).toHaveCount(0)
	await expect(page.getByTestId('add-child-n-left')).toHaveCount(0)
})

test('double-click a node to edit its value', async ({ page }) => {
	await sketchTree(page, [400, 200], 2, 1)
	await page.mouse.dblclick(400, 200)
	expect(await focusedLabel(page)).toBe('Cell n')
	await page.keyboard.type('99')
	await page.keyboard.press('Enter')
	expect((await tree(page)).nodes[0].value).toBe('99')
})

test('null children can be shown in every empty slot', async ({ page }) => {
	await sketchTree(page, [500, 150], 3, 0)
	const emptySlots = (await tree(page)).nodes.reduce((sum, n) => sum + n.children.filter((c) => !c).length, 0)
	expect((await sceneFacts(page)).nulls).toBe(0)
	await page.getByTestId('style.nulls.show').click()
	expect((await tree(page)).nulls).toBe('show')
	expect((await sceneFacts(page)).nulls).toBe(emptySlots)
})

test('Esc cancels a tree sketch', async ({ page }) => {
	await page.keyboard.press('Shift+T')
	await page.mouse.move(400, 150)
	await page.mouse.down()
	await page.mouse.move(400, 400, { steps: 6 })
	expect(await tree(page)).toBeDefined()
	await page.keyboard.press('Escape')
	await page.mouse.up()
	expect(await tree(page)).toBeUndefined()
})
