import { expect, test, type Page } from '@playwright/test'
import type { GraphShapeProps } from '../src/shapes/graph/graph-shape-types'
import { bfs, dfs } from '../src/shapes/graph/traverse'
import { nodeScreenPosition, open, shapesOfType, sketchGraph } from './helpers'

const graph = async (page: Page) => (await shapesOfType<GraphShapeProps>(page, 'graph'))[0].props

/** Right-click a node and pick a traversal from its context menu. */
async function traverseFrom(page: Page, key: string, kind: 'bfs' | 'dfs') {
	await page.mouse.click(...(await nodeScreenPosition(page, key)), { button: 'right' })
	await page.getByTestId(`context-menu.graph-${kind}`).click()
}

test.beforeEach(({ page }) => open(page))

test('BFS from a node: narrated steps, the queue, discovery numbers; Enter leaves the graph as it was', async ({
	page,
}) => {
	await sketchGraph(page, [300, 200], 6)
	const before = await graph(page)
	await traverseFrom(page, 'v0', 'bfs')
	await expect(page.getByTestId('play-caption')).toHaveText('Start at A: discover it (1) and queue it')
	await expect(page.getByTestId('playback-strip').filter({ hasText: 'queue' })).toHaveCount(1)
	await page.keyboard.press('ArrowRight')
	await expect(page.getByTestId('play-caption')).toHaveText('Dequeue A and look at its edges')
	await page.keyboard.press('Enter')
	await expect(page.getByTestId('play-bar')).toHaveCount(0)
	expect(await graph(page)).toEqual(before)
})

test('Shift+Enter keeps the BFS tree: reached nodes blue, tree edges green', async ({ page }) => {
	await sketchGraph(page, [300, 200], 6)
	const props = await graph(page)
	const expected = bfs(props, 'v2', false)
	await traverseFrom(page, 'v2', 'bfs')
	await page.keyboard.press('Shift+Enter')
	const { marks } = await graph(page)
	expect(Object.keys(marks).filter((k) => !k.startsWith('edge:')).sort()).toEqual([...expected.order].sort())
	expect(Object.keys(marks).filter((k) => k.startsWith('edge:')).sort()).toEqual(expected.treeEdges.map((e) => `edge:${e}`).sort())
	expect(new Set(Object.values(marks))).toEqual(new Set(['blue', 'green']))
})

test('DFS on a directed graph follows out-edges; the stack shows the recursion', async ({ page }) => {
	await page.keyboard.press('Shift+G')
	await page.getByTestId('style.graph-direction.directed').click()
	await sketchGraph(page, [300, 200], 6)
	const props = await graph(page)
	const expected = dfs(props, 'v0', true)
	await traverseFrom(page, 'v0', 'dfs')
	await expect(page.getByTestId('playback-strip').filter({ hasText: 'call stack' })).toHaveCount(1)
	await expect(page.getByTestId('play-counter')).toHaveText(`1/${expected.frames.length}`)
	await page.keyboard.press('Shift+Enter')
	const { marks } = await graph(page)
	expect(Object.keys(marks).filter((k) => !k.startsWith('edge:')).sort()).toEqual([...expected.order].sort())
	// The graph stays selected and idle: Enter's release didn't start editing it.
	expect(await page.evaluate(() => window.editor!.getPath())).toBe('select.idle')
})
