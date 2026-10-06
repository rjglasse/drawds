import { expect, test, type Page } from '@playwright/test'
import type { ListShapeProps } from '../src/shapes/list/list-shape-types'
import { focusedLabel, handlePosition, open, rightClick, shapesOfType, sketchList, withEditor } from './helpers'

const lists = (page: Page) => shapesOfType<ListShapeProps>(page, 'linked-list')
const values = async (page: Page) => (await lists(page))[0].props.nodes.map((n) => n.value)
const moved = async (page: Page) => (await lists(page))[0].props.nodes.filter((n) => n.dx || n.dy).map((n) => n.id)

test.beforeEach(({ page }) => open(page))

test('sketches lists in the drag direction', async ({ page }) => {
	await sketchList(page, [200, 150], 4, 'right')
	await sketchList(page, [1100, 350], 3, 'left')
	await sketchList(page, [200, 450], 3, 'down')
	const shapes = await lists(page)
	expect(shapes.map((s) => [s.props.direction, s.props.nodes.length]).sort()).toEqual([
		['down', 3],
		['left', 3],
		['right', 4],
	])
})

test('edits node values in place', async ({ page }) => {
	await sketchList(page, [200, 150], 3)
	const before = await values(page)
	// The value compartment is left of the node centre.
	await page.mouse.dblclick(188, 150)
	await expect.poll(() => focusedLabel(page)).toBe('Cell n0')
	await page.keyboard.type('42')
	await page.keyboard.press('Tab')
	await expect.poll(() => focusedLabel(page)).toBe('Cell n1')
	await page.keyboard.type('7')
	await page.keyboard.press('Enter')
	expect(await values(page)).toEqual(['42', '7', before[2]])
})

test('drags nodes by their handles; undo and Re-layout restore the layout', async ({ page }) => {
	await sketchList(page, [200, 150], 4)
	const [x, y] = await handlePosition(page, 'n1')
	await page.mouse.move(x, y)
	await page.mouse.down()
	await page.mouse.move(x + 30, y + 140, { steps: 10 })
	await page.mouse.up()
	expect(await moved(page)).toEqual(['n1'])

	await page.keyboard.press('ControlOrMeta+z')
	expect(await moved(page)).toEqual([])
	await page.keyboard.press('ControlOrMeta+Shift+z')
	expect(await moved(page)).toEqual(['n1'])

	await rightClick(page, [200, 150])
	await page.getByTestId('context-menu.drawds.relayout').click()
	expect(await moved(page)).toEqual([])
})

test('exports arrows, the head label and the null marker', async ({ page }) => {
	await sketchList(page, [200, 150], 3)
	const svg = await withEditor(page, async (e) => (await e.getSvgString([...e.getCurrentPageShapeIds()]))?.svg ?? '')
	expect(svg).toContain('>head<')
	expect(svg).toContain('>null<')
	// One arrowhead per next pointer (3, the last into null) plus the head arrow.
	expect(svg.match(/<polygon/g)).toHaveLength(4)
})
