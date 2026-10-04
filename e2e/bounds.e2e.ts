import { expect, test, type Page } from '@playwright/test'
import { handlePosition, hoverNode, nodeScreenPosition, open, sketchArray, sketchGraph, sketchList, sketchTree, withEditor } from './helpers'

/**
 * tldraw puts a shape's box at the shape's origin, sized to its bounds; drawing outside the box
 * leaves ghosts when the camera moves. So the bounds must start at (0, 0), and the box on screen
 * must cover exactly what is drawn.
 */
async function expectBoxFitsDrawing(page: Page) {
	const { min, drawn, box } = await withEditor(page, (e) => {
		const s = e.getOnlySelectedShape()!
		const b = e.getShapeGeometry(s).bounds
		const t = e.getShapePageTransform(s)
		const from = e.pageToScreen(t.applyToPoint({ x: b.minX, y: b.minY }))
		const to = e.pageToScreen(t.applyToPoint({ x: b.maxX, y: b.maxY }))
		const r = document.querySelector(`[data-shape-id="${s.id}"]`)!.getBoundingClientRect()
		return { min: [b.minX, b.minY], drawn: [from.x, from.y, to.x, to.y], box: [r.left, r.top, r.right, r.bottom] }
	})
	expect(min[0]).toBeCloseTo(0, 3)
	expect(min[1]).toBeCloseTo(0, 3)
	box.forEach((v, i) => expect(Math.abs(v - drawn[i])).toBeLessThan(1.5))
}

const rounded = async (page: Page, key: string) => (await nodeScreenPosition(page, key)).map(Math.round)

test.beforeEach(({ page }) => open(page))

test('graph: deleting the leftmost nodes keeps the box on the drawing, and nothing moves', async ({ page }) => {
	await sketchGraph(page, [300, 200], 6)
	const before = await rounded(page, 'v2')
	for (const key of ['v0', 'v5']) {
		await hoverNode(page, key)
		await page.getByTestId(`remove-node-${key}`).click()
	}
	await expectBoxFitsDrawing(page)
	expect(await rounded(page, 'v2')).toEqual(before)
})

test('graph: a node dragged up and left follows the pointer exactly', async ({ page }) => {
	await sketchGraph(page, [400, 300], 6)
	const [x, y] = await handlePosition(page, 'v0')
	await page.mouse.move(x, y)
	await page.mouse.down()
	await page.mouse.move(x - 150, y - 80, { steps: 15 })
	await page.mouse.up()
	expect(await rounded(page, 'v0')).toEqual([250, 220])
	await expectBoxFitsDrawing(page)
})

test('array: a pointer above the cells moves the box, not the cells', async ({ page }) => {
	await sketchArray(page, [300, 400], 4)
	const cell = () => withEditor(page, (e) => {
		const s = e.getOnlySelectedShape()!
		const box = (e.getShapeUtil(s) as unknown as { cells: { cellBox(s: unknown, k: string): { x: number; y: number } } }).cells.cellBox(s, '0')
		const p = e.pageToScreen(e.getShapePageTransform(s).applyToPoint(box))
		return [Math.round(p.x), Math.round(p.y)]
	})
	const before = await cell()
	await withEditor(page, (e) => {
		const s = e.getOnlySelectedShape()!
		e.updateShape({ id: s.id, type: s.type, props: { pointers: [{ id: 'p0', name: 'j', at: '-1' }] } } as never)
	})
	expect(await cell()).toEqual(before)
	await expectBoxFitsDrawing(page)
})

test('list and tree: a head dragged left, a pointer above the root', async ({ page }) => {
	await sketchList(page, [400, 200], 3)
	const tail = await rounded(page, 'n2')
	const [x, y] = await handlePosition(page, 'n0')
	await page.mouse.move(x, y)
	await page.mouse.down()
	await page.mouse.move(x - 120, y - 60, { steps: 15 })
	await page.mouse.up()
	await expectBoxFitsDrawing(page)
	expect(await rounded(page, 'n2')).toEqual(tail)

	await sketchTree(page, [700, 450], 2, 1)
	const root = await rounded(page, 'n')
	await withEditor(page, (e) => {
		const s = e.getOnlySelectedShape()!
		e.updateShape({ id: s.id, type: s.type, props: { pointers: [{ id: 'p0', name: 'root', at: 'n' }] } } as never)
	})
	await expectBoxFitsDrawing(page)
	expect(await rounded(page, 'n')).toEqual(root)
})

test('matrix: the box covers the cells and their indices, before and after growing', async ({ page }) => {
	await page.keyboard.press('Shift+M')
	await page.mouse.move(300, 300)
	await page.mouse.down()
	await page.mouse.move(400, 360, { steps: 10 })
	await page.mouse.up()
	await expectBoxFitsDrawing(page)
	const [x, y] = await handlePosition(page, 'grow-rows')
	await page.mouse.move(x, y)
	await page.mouse.down()
	await page.mouse.move(x, y + 100, { steps: 10 })
	await page.mouse.up()
	await expectBoxFitsDrawing(page)
})
