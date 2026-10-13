import { expect, test, type Page } from '@playwright/test'
import type { GraphShapeProps } from '../src/shapes/graph/graph-shape-types'
import { connectNodes, nodeScreenPosition, open, rightClick, shapesOfType, sketchGraph } from './helpers'

const graph = async (page: Page) => (await shapesOfType<GraphShapeProps>(page, 'graph'))[0]
const views = (page: Page) => shapesOfType<{ graphId: string; view: string }>(page, 'graph-view')
/** The 1s drawn in a view: one per edge end in an unweighted, undirected adjacency matrix. */
const ones = (page: Page, id: string) => page.locator(`[data-shape-id="${id}"] text`, { hasText: /^1$/ }).count()

async function showView(page: Page, view: 'matrix' | 'lists') {
	await rightClick(page, await nodeScreenPosition(page, 'v0'))
	await page.getByTestId('context-menu-sub.drawds-graph-show-button').click()
	await page.getByTestId(`context-menu.graph-show-${view}`).click()
}

test.beforeEach(({ page }) => open(page))

test('the adjacency matrix beside a graph follows it: a new edge fills two cells', async ({ page }) => {
	await sketchGraph(page, [200, 200], 5, 5)
	await showView(page, 'matrix')
	const [view] = await views(page)
	const g = await graph(page)
	expect(view.props).toMatchObject({ graphId: g.id, view: 'matrix' })
	expect(await ones(page, view.id)).toBe(2 * g.props.edges.length)
	// Select the graph again and join its two ends.
	await page.mouse.click(...(await nodeScreenPosition(page, 'v0')))
	await connectNodes(page, 'v0', 'v4')
	expect((await graph(page)).props.edges.length).toBe(g.props.edges.length + 1)
	await expect.poll(() => ones(page, view.id)).toBe(2 * (g.props.edges.length + 1))
})

test('a view switches between matrix and lists, and goes when its graph is deleted', async ({ page }) => {
	await sketchGraph(page, [200, 200], 4, 4)
	await showView(page, 'lists')
	let [view] = await views(page)
	expect(view.props.view).toBe('lists')
	await page.evaluate((id: string) => {
		window.editor!.select(id as never)
	}, String(view.id))
	await page.getByTestId('style.graph-view.matrix').click()
	;[view] = await views(page)
	expect(view.props.view).toBe('matrix')
	const g = await graph(page)
	await page.evaluate((id: string) => {
		window.editor!.deleteShapes([id as never])
	}, String(g.id))
	expect(await views(page)).toHaveLength(0)
	await page.keyboard.press('ControlOrMeta+z')
	expect(await views(page)).toHaveLength(1)
	expect(await shapesOfType(page, 'graph')).toHaveLength(1)
})

test("a view grown with its graph is found where it is drawn now (hit-testing measures it again)", async ({ page }) => {
	await sketchGraph(page, [200, 200], 3, 3)
	await showView(page, 'matrix')
	const [view] = await views(page)
	// Six more vertices: the matrix grows by six rows and columns, its record unchanged.
	await page.evaluate(() => {
		const editor = window.editor!
		const g = editor.getCurrentPageShapes().find((s) => s.type === 'graph')!
		const nodes = (g.props as { nodes: { id: string; value: string; x: number; y: number }[] }).nodes
		const more = Array.from({ length: 6 }, (_, k) => ({ id: `w${k}`, value: String.fromCharCode(68 + k), x: nodes[0].x + k, y: nodes[0].y + 4 }))
		editor.markHistoryStoppingPoint()
		editor.updateShape({ id: g.id, type: 'graph', props: { nodes: [...nodes, ...more] } } as never)
	})
	const hit = await page.evaluate((id: string) => {
		const editor = window.editor!
		const b = editor.getShapePageBounds(id as never)!
		return editor.getShapeAtPoint({ x: b.maxX - 10, y: b.maxY - 10 }, { hitInside: true })?.id
	}, String(view.id))
	expect(hit).toBe(view.id)
	// One undo takes the vertices away and the view's size with them.
	await page.keyboard.press('ControlOrMeta+z')
	const back = await page.evaluate((id: string) => {
		const editor = window.editor!
		const b = editor.getShapePageBounds(id as never)!
		return editor.getShapeAtPoint({ x: b.maxX - 10, y: b.maxY - 10 }, { hitInside: true })?.id
	}, String(view.id))
	expect(back).toBe(view.id)
})

test('Show toggles each view: shown, its item hides it; a view goes past the code beside the graph', async ({ page }) => {
	await sketchGraph(page, [200, 200], 4, 4)
	// The code beside it first: the matrix goes past it, not over it.
	await rightClick(page, await nodeScreenPosition(page, 'v0'))
	await page.getByTestId('context-menu-sub.drawds-graph-show-button').click()
	await page.getByTestId('context-menu.graph-code-beside').click()
	await showView(page, 'matrix')
	const [code] = await shapesOfType(page, 'code')
	const [matrix] = await views(page)
	const right = await page.evaluate((id: string) => window.editor!.getShapePageBounds(id as never)!.maxX, String(code.id))
	expect(matrix.x).toBeGreaterThan(right)

	await rightClick(page, await nodeScreenPosition(page, 'v0'))
	await page.getByTestId('context-menu-sub.drawds-graph-show-button').click()
	await expect(page.getByTestId('context-menu.graph-show-matrix')).toHaveText('Hide the adjacency matrix')
	await expect(page.getByTestId('context-menu.graph-show-lists')).toHaveText('Adjacency lists beside it')
	await page.getByTestId('context-menu.graph-show-matrix').click()
	expect(await views(page)).toHaveLength(0)
	// One undo brings it back.
	await page.keyboard.press('ControlOrMeta+z')
	expect(await views(page)).toHaveLength(1)
})
