import { expect, test, type Page } from '@playwright/test'
import type { ArrayShapeProps } from '../src/shapes/array/array-shape-types'
import type { TreeShapeProps } from '../src/shapes/tree/tree-shape-types'
import { CELL, hoverNode, nodeScreenPosition, open, rightClick, shapesOfType, sketchArray, sketchTree, withEditor } from './helpers'

const cellAt = (i: number): [number, number] => [300 + i * CELL, 200]

/** Page bounds of every shape, by id. */
const boundsById = (page: Page) =>
	withEditor(page, (e) => Object.fromEntries(e.getCurrentPageShapes().map((s) => [s.id, e.getShapePageBounds(s)!])))

test.beforeEach(({ page }) => open(page))

test('clean copy: the same array again underneath, without its marks or pointers; one undo', async ({ page }) => {
	await sketchArray(page, [300, 200], 5)
	await page.mouse.move(...cellAt(0))
	await page.keyboard.press('1')
	await page.mouse.move(...cellAt(2))
	await page.keyboard.press('3')
	await rightClick(page, cellAt(1))
	await page.getByTestId('context-menu-sub.drawds-pointer-button').click()
	await page.getByTestId('context-menu.pointer-i').click()
	const [original] = await shapesOfType<ArrayShapeProps>(page, 'array')
	expect(Object.keys(original.props.marks)).toHaveLength(2)
	expect(original.props.pointers).toHaveLength(1)

	await rightClick(page, cellAt(3))
	await page.getByTestId('context-menu-sub.drawds-array-actions-button').click()
	await page.getByTestId('context-menu.clean-copy').click()
	const arrays = await shapesOfType<ArrayShapeProps>(page, 'array')
	expect(arrays).toHaveLength(2)
	const copy = arrays.find((s) => s.id !== original.id)!
	expect(copy.props).toEqual({ ...original.props, marks: {}, pointers: [] })
	expect(await withEditor(page, (e) => e.getSelectedShapeIds())).toEqual([copy.id])
	// Underneath, clear of it.
	const bounds = await boundsById(page)
	expect(bounds[copy.id].x).toBeCloseTo(bounds[original.id].x)
	expect(bounds[copy.id].y).toBeGreaterThan(bounds[original.id].y + bounds[original.id].h)
	// The original keeps its markup.
	expect((await shapesOfType<ArrayShapeProps>(page, 'array')).find((s) => s.id === original.id)!.props).toEqual(original.props)

	await page.keyboard.press('ControlOrMeta+z')
	expect(await shapesOfType(page, 'array')).toHaveLength(1)
})

test('clean copy of a tree: the same nodes, no marks; past a shape in the way', async ({ page }) => {
	await sketchTree(page, [400, 150], 3, 1)
	await hoverNode(page, 'n')
	await page.keyboard.press('2')
	const [original] = await shapesOfType<TreeShapeProps>(page, 'binary-tree')
	// Something right under the tree: the copy goes below it.
	const tree = (await boundsById(page))[original.id]
	await sketchArray(page, [tree.x + 24, tree.y + tree.h + 60], 3)
	await withEditor(page, (e) => void e.selectNone())
	await rightClick(page, [400, 150])
	await page.getByTestId('context-menu-sub.drawds-tree-actions-button').click()
	await page.getByTestId('context-menu.clean-copy').click()
	const trees = await shapesOfType<TreeShapeProps>(page, 'binary-tree')
	const copy = trees.find((s) => s.id !== original.id)!
	expect(copy.props).toEqual({ ...original.props, marks: {}, pointers: [] })
	const bounds = await boundsById(page)
	const [array] = await shapesOfType(page, 'array')
	expect(bounds[copy.id].y).toBeGreaterThan(bounds[array.id].y + bounds[array.id].h)
	expect(await nodeScreenPosition(page, 'n')).toBeTruthy()
})
