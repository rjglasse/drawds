import { expect, test, type Page } from '@playwright/test'
import { fillValues } from '../src/data/fill'
import type { ArrayShapeProps } from '../src/shapes/array/array-shape-types'
import type { ListShapeProps } from '../src/shapes/list/list-shape-types'
import { CELL, LIST_STEP, handlePosition, open, shapesOfType, sketchArray, sketchList, withEditor } from './helpers'

const array = async (page: Page) => (await shapesOfType<ArrayShapeProps>(page, 'array'))[0]
const list = async (page: Page) => (await shapesOfType<ListShapeProps>(page, 'linked-list'))[0]

/** Drag the selected shape's grow grip by (dx, dy). Leaves the pointer down if `release` is false. */
async function dragGrip(page: Page, dx: number, dy: number, release = true) {
	const [x, y] = await handlePosition(page, 'grow')
	await page.mouse.move(x, y)
	await page.mouse.down()
	await page.mouse.move(x + dx, y + dy, { steps: 12 })
	if (release) await page.mouse.up()
}

test.beforeEach(({ page }) => open(page))

test('array: the grip adds and removes cells and keeps typed values', async ({ page }) => {
	await sketchArray(page, [300, 200], 3)
	const sketched = (await array(page)).props.values
	await page.mouse.dblclick(300, 200)
	await page.keyboard.type('x')
	await page.keyboard.press('Enter')

	await dragGrip(page, CELL * 2.2, 0)
	const grown = await array(page)
	expect(grown.props.values).toHaveLength(5)
	expect(grown.props.values.slice(0, 3)).toEqual(['x', ...sketched.slice(1)])
	// New cells are fresh numbers: random fills stay distinct.
	expect(new Set(grown.props.values).size).toBe(5)
	expect(grown.props.values.slice(3).every((v) => /^\d+$/.test(v))).toBe(true)

	await dragGrip(page, -CELL * 3, 0)
	expect((await array(page)).props.values).toEqual(['x', grown.props.values[1]])

	await page.keyboard.press('ControlOrMeta+z')
	expect((await array(page)).props.values).toEqual(grown.props.values)
})

test('vertical array grows downwards', async ({ page }) => {
	await sketchArray(page, [300, 150], 2, 'down')
	await dragGrip(page, 0, CELL * 3)
	expect((await array(page)).props.values).toHaveLength(5)
})

test('list: the grip past null appends nodes', async ({ page }) => {
	await sketchList(page, [200, 200], 2)
	await dragGrip(page, LIST_STEP * 2.2, 0)
	const grown = await list(page)
	expect(grown.props.nodes.map((n) => n.id)).toEqual(['n0', 'n1', 'n2', 'n3'])
	expect(grown.props.nodes.map((n) => n.value)).toEqual(fillValues('random', grown.props.seed, 4))
})

test('left-running list keeps its head in place while growing', async ({ page }) => {
	await sketchList(page, [1100, 300], 2, 'left')
	const headOnPage = () =>
		withEditor(page, (editor) => {
			const shape = editor.getOnlySelectedShape()!
			const util = editor.getShapeUtil(shape) as unknown as { getScene(s: unknown): { nodes: { key: string; x: number; y: number }[] } }
			const head = util.getScene(shape).nodes.find((n) => n.key === 'n0')!
			const p = editor.getShapePageTransform(shape).applyToPoint(head)
			return [Math.round(p.x), Math.round(p.y)]
		})
	const before = await headOnPage()
	await dragGrip(page, -LIST_STEP * 3.2, 0)
	expect((await list(page)).props.nodes).toHaveLength(5)
	expect(await headOnPage()).toEqual(before)
})

test('Esc cancels a grow drag', async ({ page }) => {
	await sketchArray(page, [300, 200], 3)
	await dragGrip(page, CELL * 4, 0, false)
	expect((await array(page)).props.values.length).toBeGreaterThan(3)
	await page.keyboard.press('Escape')
	await page.mouse.up()
	expect((await array(page)).props.values).toHaveLength(3)
})
