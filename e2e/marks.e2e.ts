import { expect, test, type Page } from '@playwright/test'
import type { ArrayShapeProps } from '../src/shapes/array/array-shape-types'
import type { ListShapeProps } from '../src/shapes/list/list-shape-types'
import type { TreeShapeProps } from '../src/shapes/tree/tree-shape-types'
import { CELL, hoverNode, open, rightClick, shapesOfType, sketchArray, sketchList, sketchTree, withEditor } from './helpers'

const arrayProps = async (page: Page) => (await shapesOfType<ArrayShapeProps>(page, 'array'))[0].props
const listMarks = async (page: Page) => (await shapesOfType<ListShapeProps>(page, 'linked-list'))[0].props.marks
const treeMarks = async (page: Page) => (await shapesOfType<TreeShapeProps>(page, 'binary-tree'))[0].props.marks
const cellAt = (i: number): [number, number] => [300 + i * CELL, 200]

test.beforeEach(({ page }) => open(page))

test('point at a cell and press 1-4 to mark it; the same key or 0 clears; one undo each', async ({ page }) => {
	await sketchArray(page, [300, 200], 4)
	await page.mouse.move(...cellAt(0))
	await page.keyboard.press('1')
	expect((await arrayProps(page)).marks).toEqual({ '0': 'red' })
	await page.keyboard.press('1')
	expect((await arrayProps(page)).marks).toEqual({})
	await page.keyboard.press('2')
	await page.mouse.move(...cellAt(2))
	await page.keyboard.press('3')
	expect((await arrayProps(page)).marks).toEqual({ '0': 'orange', '2': 'green' })
	await page.keyboard.press('0')
	expect((await arrayProps(page)).marks).toEqual({ '0': 'orange' })
	await page.keyboard.press('ControlOrMeta+z')
	expect((await arrayProps(page)).marks).toEqual({ '0': 'orange', '2': 'green' })
	// Digits never switch tools (tldraw's numbered toolbar shortcuts are off).
	expect(await withEditor(page, (e) => e.getPath())).toBe('select.idle')
})

test('digits typed into a cell are values, not marks', async ({ page }) => {
	await sketchArray(page, [300, 200], 3)
	await page.mouse.dblclick(...cellAt(1))
	await page.keyboard.type('123')
	await page.keyboard.press('Enter')
	const props = await arrayProps(page)
	expect(props.values[1]).toBe('123')
	expect(props.marks).toEqual({})
})

test('marks follow list nodes and go when a node is removed', async ({ page }) => {
	await sketchList(page, [300, 250], 3)
	await hoverNode(page, 'n1')
	await page.keyboard.press('4')
	expect(await listMarks(page)).toEqual({ n1: 'blue' })
	await hoverNode(page, 'n0', 'n1')
	await page.getByTestId('insert-on-n0->').click()
	await page.keyboard.press('Enter')
	expect(await listMarks(page)).toEqual({ n1: 'blue' })
	await hoverNode(page, 'n1')
	await page.getByTestId('remove-node-n1').click()
	expect(await listMarks(page)).toEqual({})
})

test("a tree node added where a marked one was removed doesn't inherit its mark", async ({ page }) => {
	await sketchTree(page, [500, 150], 1)
	await hoverNode(page, 'n')
	await page.getByTestId('add-child-n-left').click()
	await page.keyboard.press('Enter')
	await hoverNode(page, 'nL')
	await page.keyboard.press('1')
	expect(await treeMarks(page)).toEqual({ nL: 'red' })
	await page.getByTestId('remove-node-nL').click()
	await hoverNode(page, 'n')
	await page.getByTestId('add-child-n-left').click()
	await page.keyboard.press('Enter')
	expect(await treeMarks(page)).toEqual({})
})

test('the context menu marks the element under the pointer', async ({ page }) => {
	await sketchArray(page, [300, 200], 4)
	await rightClick(page, cellAt(1))
	await page.getByTestId('context-menu-sub.drawds-mark-button').click()
	await page.getByTestId('context-menu.mark-green').click()
	expect((await arrayProps(page)).marks).toEqual({ '1': 'green' })
})

test('marks are exported', async ({ page }) => {
	await sketchArray(page, [300, 200], 3)
	await page.mouse.move(...cellAt(1))
	await page.keyboard.press('3')
	const { svg, green } = await withEditor(page, async (e) => ({
		svg: (await e.getSvgString([...e.getCurrentPageShapeIds()]))?.svg ?? '',
		green: e.getCurrentTheme().colors.light.green.solid,
	}))
	expect(svg).toContain(green)
})
