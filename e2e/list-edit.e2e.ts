import { expect, test, type Page } from '@playwright/test'
import type { ListShapeProps } from '../src/shapes/list/list-shape-types'
import { LIST_STEP, focusedLabel, handlePosition, hoverNode, open, shapesOfType, sketchList, withEditor } from './helpers'

const ids = async (page: Page) =>
	(await shapesOfType<ListShapeProps>(page, 'linked-list'))[0].props.nodes.map((n) => n.id)

/** Page position of a list node, and the list's edges as [from, to] pairs. */
const layout = (page: Page) =>
	withEditor(page, (editor) => {
		const shape = editor.getOnlySelectedShape()!
		const scene = (editor.getShapeUtil(shape) as unknown as {
			getScene(s: unknown): { nodes: { key: string; x: number; y: number }[]; edges: { from: string; to: string }[] }
		}).getScene(shape)
		const at: Record<string, [number, number]> = {}
		for (const n of scene.nodes) {
			const p = editor.getShapePageTransform(shape).applyToPoint(n)
			at[n.key] = [Math.round(p.x), Math.round(p.y)]
		}
		return { at, edges: scene.edges.map((e) => [e.from, e.to]) }
	})

async function dragGrip(page: Page, id: string, dx: number, dy: number) {
	const [x, y] = await handlePosition(page, id)
	await page.mouse.move(x, y)
	await page.mouse.down()
	await page.mouse.move(x + dx, y + dy, { steps: 12 })
	await page.mouse.up()
}

test.beforeEach(({ page }) => open(page))

test('x removes a middle node and the list closes the gap', async ({ page }) => {
	await sketchList(page, [300, 250], 4)
	await hoverNode(page, 'n1')
	await page.getByTestId('remove-node-n1').click()
	expect(await ids(page)).toEqual(['n0', 'n2', 'n3'])
	const { edges } = await layout(page)
	expect(edges).toContainEqual(['n0', 'n2'])
	expect(edges).not.toContainEqual(['n0', 'n1'])

	await page.keyboard.press('ControlOrMeta+z')
	expect(await ids(page)).toEqual(['n0', 'n1', 'n2', 'n3'])
})

test('removing the head makes the next node the head, in place', async ({ page }) => {
	await sketchList(page, [300, 250], 3)
	const before = (await layout(page)).at.n1
	await hoverNode(page, 'n0')
	await page.getByTestId('remove-node-n0').click()
	const after = await layout(page)
	expect(await ids(page)).toEqual(['n1', 'n2'])
	expect(after.at.n1).toEqual(before)
	expect(after.edges).toContainEqual(['#head', 'n1'])
})

test('the last node has no x', async ({ page }) => {
	await sketchList(page, [300, 250], 2)
	await hoverNode(page, 'n1')
	await page.getByTestId('remove-node-n1').click()
	expect(await ids(page)).toEqual(['n0'])
	await hoverNode(page, 'n0')
	await expect(page.getByTestId('remove-node-n0')).toHaveCount(0)
})

test('the start grip inserts at the head and the old nodes stay put', async ({ page }) => {
	await sketchList(page, [600, 250], 2)
	const before = (await layout(page)).at.n0
	await dragGrip(page, 'grow-start', -LIST_STEP * 2.2, 0)
	const after = await layout(page)
	expect(await ids(page)).toEqual(['n3', 'n2', 'n0', 'n1'])
	expect(after.at.n0).toEqual(before)
	expect(after.edges).toContainEqual(['#head', 'n3'])
	expect(after.edges).toContainEqual(['n2', 'n0'])

	// Dragging it back past the old head removes nodes from the head.
	await dragGrip(page, 'grow-start', LIST_STEP * 3, 0)
	expect(await ids(page)).toEqual(['n1'])
})

test('node and edge controls appear near the pointer, and only while selected', async ({ page }) => {
	await sketchList(page, [300, 250], 3)
	await hoverNode(page, 'n0')
	await expect(page.getByTestId('remove-node-n0')).toHaveCount(1)
	await expect(page.getByTestId('remove-node-n1')).toHaveCount(0)
	await expect(page.getByTestId('insert-on-n1->')).toHaveCount(0)

	await hoverNode(page, 'n1', 'n2')
	await expect(page.getByTestId('insert-on-n1->')).toHaveCount(1)
	await expect(page.getByTestId('remove-node-n0')).toHaveCount(0)

	// Deselect, then point at the head again (sketched with its centre at 300, 250).
	await page.mouse.click(700, 600)
	await page.mouse.move(300, 250)
	await expect(page.getByTestId('remove-node-n0')).toHaveCount(0)
})

const values = async (page: Page) =>
	(await shapesOfType<ListShapeProps>(page, 'linked-list'))[0].props.nodes.map((n) => n.value)

test('+ on an arrow inserts a node after its source and opens it for editing', async ({ page }) => {
	await sketchList(page, [300, 250], 3)
	const before = await values(page)
	await hoverNode(page, 'n0', 'n1')
	await page.getByTestId('insert-on-n0->').click()
	await expect.poll(() => focusedLabel(page)).toBe('Cell n3')
	const generated = (await values(page))[1]
	await page.keyboard.type('42')
	await page.keyboard.press('Enter')
	expect(await ids(page)).toEqual(['n0', 'n3', 'n1', 'n2'])
	expect(await values(page)).toEqual([before[0], '42', before[1], before[2]])
	expect((await layout(page)).edges).toEqual(expect.arrayContaining([['n0', 'n3'], ['n3', 'n1']]))

	// Undo the typed value, then the insertion.
	await page.keyboard.press('ControlOrMeta+z')
	expect(await ids(page)).toEqual(['n0', 'n3', 'n1', 'n2'])
	expect((await values(page))[1]).toBe(generated)
	await page.keyboard.press('ControlOrMeta+z')
	expect(await ids(page)).toEqual(['n0', 'n1', 'n2'])
})

test('+ on the arrow to null inserts after the tail; Esc keeps the generated value', async ({ page }) => {
	await sketchList(page, [300, 250], 2)
	await hoverNode(page, 'n1', '#null')
	await page.getByTestId('insert-on-n1->').click()
	await page.keyboard.press('Escape')
	expect(await ids(page)).toEqual(['n0', 'n1', 'n2'])
	expect((await values(page))[2]).toMatch(/^\d+$/)
	expect(await withEditor(page, (e) => e.getPath())).toBe('select.idle')
})
