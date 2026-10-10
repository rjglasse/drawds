import { expect, test, type Page } from '@playwright/test'
import type { GraphShapeProps } from '../src/shapes/graph/graph-shape-types'
import { nodeScreenPosition, open, rightClick, shapesOfType, sketchGraph, withEditor } from './helpers'

// Lecture 9's leftovers: a path with the fewest edges, is there a cycle?, complete graphs, the edge
// list, degrees, and what each representation costs, step by step.

const graph = async (page: Page) => (await shapesOfType<GraphShapeProps>(page, 'graph'))[0].props
const caption = (page: Page) => page.getByTestId('play-caption')

/** Lecture 9's running example: vertices 0..6. */
async function lectureGraph(page: Page) {
	await sketchGraph(page, [300, 200], 3)
	await page.evaluate(() => {
		const editor = window.editor!
		const shape = editor.getCurrentPageShapes().find((s) => s.type === 'graph')!
		const at: Record<string, [number, number]> = { 0: [0, 1], 1: [2.3, 0], 2: [2.3, 2.3], 3: [4.6, 1], 4: [6.9, 0], 5: [4.6, 3.3], 6: [6.9, 2.3] }
		const pairs = ['0-1', '0-2', '1-3', '2-3', '2-5', '3-4', '3-5', '5-6', '4-6']
		editor.updateShape({
			id: shape.id,
			type: 'graph',
			props: {
				labels: 'numbers',
				nodes: Object.entries(at).map(([v, [x, y]]) => ({ id: `v${v}`, value: v, x, y })),
				edges: pairs.map((p, i) => ({ id: `e${i}`, from: `v${p[0]}`, to: `v${p[2]}`, weight: '1' })),
			},
		} as never)
	})
}

async function steps(page: Page, node: string, item: string) {
	await rightClick(page, await nodeScreenPosition(page, node))
	await page.getByTestId('context-menu-sub.drawds-graph-steps-button').click()
	await page.getByTestId(`context-menu.${item}`).click()
}

async function stepToEnd(page: Page) {
	while (!(await page.getByTestId('play-done').count())) await page.keyboard.press('ArrowRight')
}

test.beforeEach(({ page }) => open(page))

test('a path from 0 to 6: BFS with parent[], then walked back; the fewest edges', async ({ page }) => {
	await lectureGraph(page)
	await steps(page, 'v0', 'graph-path')
	await page.getByTestId('key-prompt').fill('6')
	await page.getByTestId('key-prompt').press('Enter')
	await expect(caption(page)).toContainText('A path from 0 to 6 with the fewest edges')
	await expect(page.getByTestId('playback-strip').filter({ hasText: 'parent[]' })).toHaveCount(1)
	await stepToEnd(page)
	await expect(caption(page)).toHaveText('The path 0–2–5–6: 3 edges, the fewest there are, as BFS reaches every vertex 2 edges away before any 3 away')
	await page.keyboard.press('Enter')
	expect((await graph(page)).edges).toHaveLength(9)
})

test('is there a cycle? DFS finds one on the lecture graph; none on a tree', async ({ page }) => {
	await lectureGraph(page)
	await steps(page, 'v0', 'graph-cycle')
	await stepToEnd(page)
	await expect(caption(page)).toHaveText('Yes: 0–1–3–2–0, a cycle of 4 edges')
	await page.keyboard.press('Enter')
	await withEditor(page, (editor) => {
		const shape = editor.getCurrentPageShapes().find((s) => s.type === 'graph')!
		const edges = (shape.props as GraphShapeProps).edges.filter((e) => ['e0', 'e1', 'e2', 'e5'].includes(e.id))
		void editor.updateShape({ id: shape.id, type: 'graph', props: { edges } } as never)
	})
	await steps(page, 'v0', 'graph-cycle')
	await stepToEnd(page)
	await expect(caption(page)).toContainText('no cycle. The graph is a forest')
})

test('complete: every pair of the sketch joined, round a circle; the edge list and degrees beside it', async ({ page }) => {
	await page.keyboard.press('Shift+G')
	await page.getByTestId('style.graph-density.complete').click()
	await sketchGraph(page, [300, 200], 5, 5)
	const g = await graph(page)
	expect(g.nodes).toHaveLength(5)
	expect(g.edges).toHaveLength(10)

	// Where node 0 is, while the graph is the one selected.
	const v0 = await nodeScreenPosition(page, 'v0')
	await rightClick(page, v0)
	await page.getByTestId('context-menu-sub.drawds-graph-show-button').click()
	await page.getByTestId('context-menu.graph-show-edges').click()
	await expect(page.getByTestId('graph-view-title')).toHaveText('Edge list: E = 10 pairs (V = 5)')
	await rightClick(page, v0)
	await page.getByTestId('context-menu-sub.drawds-graph-show-button').click()
	await page.getByTestId('context-menu.graph-degrees').click()
	expect((await graph(page)).degrees).toBe(true)
})

test("removing a vertex step by step: the matrix and lists open beside it, each view's cost counted; Esc changes nothing", async ({ page }) => {
	await lectureGraph(page)
	await steps(page, 'v3', 'graph-remove-vertex-costs')
	// Titles in any order (the DOM's isn't the order the views were made in).
	const title = (text: string) => page.getByTestId('graph-view-title').filter({ hasText: text })
	await expect(title('Adjacency matrix: V × V = 7 × 7 = 49 cells, 18 for E = 9 edges (each in two)')).toHaveCount(1)
	await expect(title('Adjacency lists: V + 2E = 7 + 18 = 25 (E = 9 edges)')).toHaveCount(1)
	await stepToEnd(page)
	await expect(page.getByTestId('play-counts')).toHaveText('matrix cells 36 · list entries 18 · edge-list rows 9')
	await expect(title('Adjacency matrix: V × V = 6 × 6 = 36 cells, 10 for E = 5 edges (each in two)')).toHaveCount(1)
	await page.keyboard.press('Enter')
	expect((await graph(page)).nodes.map((n) => n.value)).toEqual(['0', '1', '2', '4', '5', '6'])
	// One undo puts 3 back.
	await page.keyboard.press('ControlOrMeta+z')
	expect((await graph(page)).nodes).toHaveLength(7)

	// Cancelled, the views it opened go again.
	await withEditor(page, (editor) => void editor.deleteShapes(editor.getCurrentPageShapes().filter((s) => s.type === 'graph-view').map((s) => s.id)))
	await page.mouse.click(...(await nodeScreenPosition(page, 'v0')))
	await steps(page, 'v0', 'graph-add-vertex-costs')
	await expect(page.locator('[data-testid="graph-view-title"]')).toHaveCount(2)
	await page.keyboard.press('Escape')
	await expect(page.locator('[data-testid="graph-view-title"]')).toHaveCount(0)
	expect((await graph(page)).nodes).toHaveLength(7)
})
