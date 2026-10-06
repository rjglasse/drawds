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
