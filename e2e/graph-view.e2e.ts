import { expect, test, type Page } from '@playwright/test'
import type { GraphShapeProps } from '../src/shapes/graph/graph-shape-types'
import { connectNodes, nodeScreenPosition, open, shapesOfType, sketchGraph } from './helpers'

const graph = async (page: Page) => (await shapesOfType<GraphShapeProps>(page, 'graph'))[0]
const views = (page: Page) => shapesOfType<{ graphId: string; view: string }>(page, 'graph-view')
/** The 1s drawn in a view: one per edge end in an unweighted, undirected adjacency matrix. */
const ones = (page: Page, id: string) => page.locator(`[data-shape-id="${id}"] text`, { hasText: /^1$/ }).count()

async function showView(page: Page, view: 'matrix' | 'lists') {
	await page.mouse.click(...(await nodeScreenPosition(page, 'v0')), { button: 'right' })
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
