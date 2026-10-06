import { expect, test, type Page } from '@playwright/test'
import type { GraphShapeProps } from '../src/shapes/graph/graph-shape-types'
import { nodeScreenPosition, open, rightClick, shapesOfType, sketchGraph } from './helpers'

const graph = async (page: Page) => (await shapesOfType<GraphShapeProps>(page, 'graph'))[0].props
const caption = (page: Page) => page.getByTestId('play-caption')

//   A --4-- B --5-- D --3-- E
//    \     /       /
//     1   2       8
//      \ /       /
//       C -------
async function knownGraph(page: Page, direction: 'directed' | 'undirected' = 'undirected') {
	await sketchGraph(page, [300, 200], 3)
	await page.evaluate((direction) => {
		const editor = window.editor!
		const shape = editor.getCurrentPageShapes().find((s) => s.type === 'graph')!
		editor.updateShape({
			id: shape.id,
			type: 'graph',
			props: {
				direction,
				weights: 'weighted',
				nodes: [
					{ id: 'a', value: 'A', x: 1, y: 1 },
					{ id: 'b', value: 'B', x: 4.5, y: 1 },
					{ id: 'c', value: 'C', x: 2.75, y: 3.5 },
					{ id: 'd', value: 'D', x: 7, y: 3 },
					{ id: 'e', value: 'E', x: 9.5, y: 1 },
				],
				edges: [
					{ id: 'ab', from: 'a', to: 'b', weight: '4' },
					{ id: 'ac', from: 'a', to: 'c', weight: '1' },
					{ id: 'cb', from: 'c', to: 'b', weight: '2' },
					{ id: 'bd', from: 'b', to: 'd', weight: '5' },
					{ id: 'cd', from: 'c', to: 'd', weight: '8' },
					{ id: 'de', from: 'd', to: 'e', weight: '3' },
				],
			},
		} as never)
	}, direction)
}

async function stepToEnd(page: Page) {
	while (!(await page.getByTestId('play-done').count())) await page.keyboard.press('ArrowRight')
}

test.beforeEach(({ page }) => open(page))

test('Dijkstra from a node: distances drop from ∞, best edges green; nothing changes', async ({ page }) => {
	await knownGraph(page)
	const before = await graph(page)
	await rightClick(page, await nodeScreenPosition(page, 'a'))
	await page.getByTestId('context-menu-sub.drawds-graph-steps-button').click()
	await page.getByTestId('context-menu.graph-dijkstra').click()
	await expect(caption(page)).toHaveText('dist(A) = 0, every other node ∞')
	await expect(page.getByTestId('playback-strip')).toContainText('A:0')
	await stepToEnd(page)
	await expect(caption(page)).toHaveText('Every node is finished: the green edges are the shortest paths from A')
	await expect(page.getByTestId('play-counts')).toHaveText('updates 6')
	// Shift+Enter keeps the shortest-path tree as marks.
	await page.keyboard.press('Shift+Enter')
	const after = await graph(page)
	expect(after.nodes).toEqual(before.nodes)
	expect(Object.entries(after.marks).filter(([, c]) => c === 'green').map(([k]) => k).sort()).toEqual(['edge:ac', 'edge:bd', 'edge:cb', 'edge:de'])
})

test('Prim from a node, and Kruskal on the whole graph: both total 11', async ({ page }) => {
	await knownGraph(page)
	await rightClick(page, await nodeScreenPosition(page, 'a'))
	await page.getByTestId('context-menu-sub.drawds-graph-steps-button').click()
	await page.getByTestId('context-menu.graph-prim').click()
	await page.keyboard.press('ArrowRight')
	await expect(caption(page)).toHaveText('2 edges leave the tree; the cheapest is A–C (1)')
	await stepToEnd(page)
	await expect(caption(page)).toHaveText('Every node is in the tree: a minimum spanning tree, total weight 11')
	await page.keyboard.press('Enter')
	await rightClick(page, await nodeScreenPosition(page, 'a'))
	await page.getByTestId('context-menu-sub.drawds-graph-steps-button').click()
	await page.getByTestId('context-menu.graph-kruskal').click()
	await stepToEnd(page)
	await expect(caption(page)).toHaveText('4 edges for 5 nodes: a minimum spanning tree, total weight 11')
	await expect(page.getByTestId('play-counts')).toHaveText('weight 11')
})

test('topological sort on a directed graph; spanning trees are offered only when undirected', async ({ page }) => {
	await knownGraph(page, 'directed')
	await rightClick(page, await nodeScreenPosition(page, 'a'))
	await page.getByTestId('context-menu-sub.drawds-graph-steps-button').click()
	await expect(page.getByTestId('context-menu.graph-topological-sort')).toBeVisible()
	await expect(page.getByTestId('context-menu.graph-prim')).toHaveCount(0)
	await expect(page.getByTestId('context-menu.graph-kruskal')).toHaveCount(0)
	await page.getByTestId('context-menu.graph-topological-sort').click()
	await expect(caption(page)).toHaveText("Count each node's incoming edges (the badges)")
	await stepToEnd(page)
	await expect(caption(page)).toHaveText('Every node is placed: A, C, B, D, E. Every edge points forward in this order')
})

/** The union-find view's parent row (by node name, in label order), as it is drawn now. */
const parentRow = (page: Page) =>
	page.evaluate(() => {
		const e = window.editor!
		const view = e.getCurrentPageShapes().find((s) => s.type === 'graph-view' && (s.props as { view: string }).view === 'union-find')
		if (!view) return null
		const util = e.getShapeUtil(view) as unknown as { content(s: unknown): { scene: { nodes: { key: string; value: string; x: number }[] } } }
		return util
			.content(view)
			.scene.nodes.filter((n) => /^p\d+$/.test(n.key))
			.sort((a, b) => a.x - b.x)
			.map((n) => n.value)
			.join('')
	})

const unionFindViews = (page: Page) => page.evaluate(() => window.editor!.getCurrentPageShapes().filter((s) => s.type === 'graph-view').length)

async function kruskalMenu(page: Page) {
	await rightClick(page, await nodeScreenPosition(page, 'a'))
	await page.getByTestId('context-menu-sub.drawds-graph-steps-button').click()
	await page.getByTestId('context-menu.graph-kruskal').click()
}

test("Kruskal opens its union-find beside the graph: finds and unions step with the edges; Esc takes it away", async ({ page }) => {
	await knownGraph(page)
	await kruskalMenu(page)
	expect(await unionFindViews(page)).toBe(1)
	// Every node on its own to start with.
	expect(await parentRow(page)).toBe('ABCDE')
	await page.keyboard.press('ArrowRight')
	await expect(caption(page)).toHaveText("A–C (1): find(A) = A, find(C) = C, two trees, so take it: union puts A's tree under C")
	expect(await parentRow(page)).toBe('CBCDE')
	await page.keyboard.press('ArrowRight')
	await page.keyboard.press('ArrowRight')
	await page.keyboard.press('ArrowRight')
	await expect(caption(page)).toHaveText('A–B (4): find(A) = C, find(B) = C, one tree already, so it would close a cycle: skip it')
	expect(await parentRow(page)).toBe('CCCEE')
	// The bar sits under the view, not over it.
	const [viewBottom, barTop] = await page.evaluate(() => {
		const e = window.editor!
		const view = e.getCurrentPageShapes().find((s) => s.type === 'graph-view')!
		const b = e.getShapePageBounds(view)!
		return [e.pageToViewport({ x: b.minX, y: b.maxY }).y, document.querySelector('[data-testid="play-bar"]')!.getBoundingClientRect().top]
	})
	expect(barTop).toBeGreaterThan(viewBottom)
	// Cancelled before the result: the view it opened goes again.
	await page.keyboard.press('Escape')
	await expect(page.getByTestId('play-bar')).toHaveCount(0)
	expect(await unionFindViews(page)).toBe(0)
	// Run to the end: the view stays, showing where Kruskal ends; a second run uses it.
	await kruskalMenu(page)
	await stepToEnd(page)
	await page.keyboard.press('Enter')
	expect(await unionFindViews(page)).toBe(1)
	expect(await parentRow(page)).toBe('CCCEC')
	await kruskalMenu(page)
	expect(await unionFindViews(page)).toBe(1)
	await page.keyboard.press('Escape')
	expect(await unionFindViews(page)).toBe(1)
})

test("Show > Union-find puts Kruskal's sets beside an undirected graph; not offered for a directed one", async ({ page }) => {
	await knownGraph(page)
	await rightClick(page, await nodeScreenPosition(page, 'a'))
	await page.getByTestId('context-menu-sub.drawds-graph-show-button').click()
	await page.getByTestId('context-menu.graph-show-union-find').click()
	expect(await parentRow(page)).toBe('CCCEC')
	await page.evaluate(() => void window.editor!.deleteShapes([...window.editor!.getCurrentPageShapeIds()]))
	await knownGraph(page, 'directed')
	await rightClick(page, await nodeScreenPosition(page, 'a'))
	await page.getByTestId('context-menu-sub.drawds-graph-show-button').click()
	await expect(page.getByTestId('context-menu.graph-show-matrix')).toBeVisible()
	await expect(page.getByTestId('context-menu.graph-show-union-find')).toHaveCount(0)
})

test('count connected components: each piece numbered and coloured as a search finds it', async ({ page }) => {
	await knownGraph(page)
	// Two more pieces: X–Z, and Y on its own.
	await page.evaluate(() => {
		const e = window.editor!
		const s = e.getCurrentPageShapes().find((x) => x.type === 'graph')!
		const p = s.props as { nodes: object[]; edges: object[] }
		e.updateShape({
			id: s.id,
			type: 'graph',
			props: {
				nodes: [...p.nodes, { id: 'x', value: 'X', x: 1, y: 6 }, { id: 'y', value: 'Y', x: 4, y: 6 }, { id: 'z', value: 'Z', x: 7, y: 6 }],
				edges: [...p.edges, { id: 'xz', from: 'x', to: 'z', weight: '2' }],
			},
		} as never)
	})
	await rightClick(page, await nodeScreenPosition(page, 'a'))
	await page.getByTestId('context-menu-sub.drawds-graph-steps-button').click()
	await page.getByTestId('context-menu.graph-components').click()
	await expect(caption(page)).toContainText('Count the pieces')
	await stepToEnd(page)
	await expect(caption(page)).toHaveText('Every node is in a piece: 3 components')
	await expect(page.getByTestId('play-counts')).toHaveText('components 3')
	await page.keyboard.press('Enter')
})
