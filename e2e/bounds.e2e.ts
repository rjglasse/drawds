import { expect, test, type Page } from '@playwright/test'
import { handlePosition, hoverNode, nodeScreenPosition, open, rightClick, sketchArray, sketchGraph, sketchHeap, sketchList, sketchTree, withEditor } from './helpers'

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

// While an operation is open, its steps can draw more than the shape (a bigger table, a heap's new
// level, a list node off the line): the box must hold every step, and whatever a step leaves alone
// must stay put on the page.

/** The step on screen: elements outside the box, and the box against the drawing as above. */
async function expectStepInBox(page: Page) {
	const outside = await withEditor(page, (e) => {
		const s = e.getOnlySelectedShape()!
		const b = e.getShapeGeometry(s).bounds
		const util = e.getShapeUtil(s) as unknown as { displayScene(s: unknown): { nodes: { key: string; x: number; y: number; w: number; h: number }[] } }
		return util
			.displayScene(s)
			.nodes.filter((n) => n.x - n.w / 2 < b.minX - 0.5 || n.y - n.h / 2 < b.minY - 0.5 || n.x + n.w / 2 > b.maxX + 0.5 || n.y + n.h / 2 > b.maxY + 0.5)
			.map((n) => n.key)
	})
	expect(outside).toEqual([])
	await expectBoxFitsDrawing(page)
}

/** Where a node of the step on screen is drawn, on the screen. */
const shownAt = (page: Page, key: string) =>
	page.evaluate((key) => {
		const e = window.editor!
		const s = e.getOnlySelectedShape()!
		const util = e.getShapeUtil(s) as unknown as { displayScene(s: unknown): { nodes: { key: string; x: number; y: number }[] } }
		const node = util.displayScene(s).nodes.find((n) => n.key === key)!
		const p = e.pageToScreen(e.getShapePageTransform(s).applyToPoint(node))
		return [Math.round(p.x), Math.round(p.y)]
	}, key)

/** Step through to the result and Done, checking every step on the way (and `still` stays put). */
async function checkEveryStep(page: Page, still?: string) {
	const at = still && (await shownAt(page, still))
	for (;;) {
		await expectStepInBox(page)
		if (still) expect(await shownAt(page, still)).toEqual(at)
		if (await page.getByTestId('play-done').count()) break
		await page.keyboard.press('ArrowRight')
	}
	await page.keyboard.press('Enter')
	await expect(page.getByTestId('play-bar')).toHaveCount(0)
	await expectBoxFitsDrawing(page)
	if (still) expect(await shownAt(page, still)).toEqual(at)
}

async function listOp(page: Page, key: string, item: string) {
	await rightClick(page, await nodeScreenPosition(page, key))
	await page.getByTestId('context-menu-sub.drawds-list-steps-button').click()
	await page.getByTestId(`context-menu.${item}`).click()
}

test('list insert and delete: every step inside the box, the head where it was', async ({ page }) => {
	await sketchList(page, [200, 250], 3)
	await listOp(page, 'n0', 'list-insert-after')
	await checkEveryStep(page, 'n0')
	await page.mouse.click(...(await nodeScreenPosition(page, 'n0')))
	await listOp(page, 'n0', 'list-insert-head')
	await checkEveryStep(page)
	const keys = await withEditor(page, (e) => (e.getOnlySelectedShape()!.props as { nodes: { id: string }[] }).nodes.map((n) => n.id))
	await listOp(page, keys[2], 'list-delete')
	await checkEveryStep(page, keys[0])
	// The room for the steps never went into the undo history: undo puts the node back, nothing else moves.
	const head = await shownAt(page, keys[0])
	await page.keyboard.press('ControlOrMeta+z')
	await expect.poll(() => withEditor(page, (e) => (e.getOnlySelectedShape()!.props as { nodes: unknown[] }).nodes.length)).toBe(5)
	expect(await withEditor(page, (e) => e.getOnlySelectedShape()!.meta.drawdsRoom ?? null)).toBeNull()
	expect(await shownAt(page, keys[0])).toEqual(head)
	await expectBoxFitsDrawing(page)
})

test('heap insert: the steps that add a level stay inside the box', async ({ page }) => {
	await sketchHeap(page, [500, 200], 7)
	await page.getByTestId('insert-key').click()
	await page.getByTestId('key-prompt').fill('1')
	await page.keyboard.press('Enter')
	await checkEveryStep(page)
})

test('hash rehash: the bigger table stays inside the box, the first bucket where it was', async ({ page }) => {
	await page.keyboard.press('Shift+B')
	await page.mouse.move(300, 150)
	await page.mouse.down()
	await page.mouse.move(300, 150 + 4 * 48 + 10, { steps: 20 })
	await page.mouse.up()
	await withEditor(page, (e) => {
		const s = e.getOnlySelectedShape()!
		e.updateShape({ id: s.id, type: s.type, props: { buckets: [['10', '5'], ['6'], [], [], []] } } as never)
	})
	await rightClick(page, await nodeScreenPosition(page, 'k:6'))
	await page.getByTestId('context-menu-sub.drawds-hash-steps-button').click()
	await page.getByTestId('context-menu.hash-rehash').click()
	await checkEveryStep(page, 'b0')
})
