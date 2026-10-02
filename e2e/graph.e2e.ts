import { expect, test, type Page } from '@playwright/test'
import type { GraphShapeProps } from '../src/shapes/graph/graph-shape-types'
import {
	connectNodes,
	focusedLabel,
	handlePosition,
	hoverNode,
	nodeScreenPosition,
	open,
	shapesOfType,
	sketchGraph,
	withEditor,
} from './helpers'

const graphs = (page: Page) => shapesOfType<GraphShapeProps>(page, 'graph')
const graph = async (page: Page) => (await graphs(page))[0].props
const undo = (page: Page) => page.keyboard.press('ControlOrMeta+z')
/** A node's screen position, to the nearest pixel. */
const nodeAt = async (page: Page, key: string) => (await nodeScreenPosition(page, key)).map(Math.round)

const between = (props: GraphShapeProps, a: string, b: string) =>
	props.edges.filter((e) => (e.from === a && e.to === b) || (e.from === b && e.to === a))

/** The two nodes furthest apart that have no edge between them. */
function farApart(props: GraphShapeProps): [string, string] {
	let best: [string, string] | undefined
	let bestDistance = 0
	for (const a of props.nodes) {
		for (const b of props.nodes) {
			const d = Math.hypot(a.x - b.x, a.y - b.y)
			if (a.id < b.id && !between(props, a.id, b.id).length && d > bestDistance) {
				best = [a.id, b.id]
				bestDistance = d
			}
		}
	}
	return best!
}

function isConnected({ nodes, edges }: GraphShapeProps) {
	const seen = new Set([nodes[0].id])
	for (let grew = true; grew; ) {
		grew = false
		for (const e of edges) {
			if (seen.has(e.from) !== seen.has(e.to)) {
				seen.add(e.from)
				seen.add(e.to)
				grew = true
			}
		}
	}
	return seen.size === nodes.length
}

/** Wait for the cell editor to open on `key` (it opens just after a drag ends). */
const editing = (page: Page, key: string) => expect.poll(() => focusedLabel(page)).toBe(`Cell ${key}`)

test.beforeEach(({ page }) => open(page))

test('sketch: nodes drop along the drag, labelled A, B, C..., connected; one undo removes it', async ({ page }) => {
	await sketchGraph(page, [300, 200], 9)
	const props = await graph(page)
	expect(props.nodes.map((n) => n.value)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'])
	expect(isConnected(props)).toBe(true)
	expect(props.edges.length).toBeGreaterThanOrEqual(8)
	// The first node is centred where the drag started.
	expect(await nodeAt(page, 'v0')).toEqual([300, 200])
	await undo(page)
	expect(await graphs(page)).toHaveLength(0)
})

test('Esc while sketching cancels the graph', async ({ page }) => {
	await page.keyboard.press('Shift+G')
	await page.mouse.move(300, 200)
	await page.mouse.down()
	await page.mouse.move(600, 200, { steps: 20 })
	await page.keyboard.press('Escape')
	await page.mouse.up()
	expect(await graphs(page)).toHaveLength(0)
})

test('connect two nodes with the connect grip; again is a no-op; one undo', async ({ page }) => {
	await sketchGraph(page, [300, 200], 6)
	const before = await graph(page)
	const [a, b] = farApart(before)
	await connectNodes(page, a, b)
	const after = await graph(page)
	expect(after.edges).toHaveLength(before.edges.length + 1)
	expect(between(after, a, b)).toHaveLength(1)
	await connectNodes(page, b, a)
	expect((await graph(page)).edges).toHaveLength(before.edges.length + 1)
	await undo(page)
	expect((await graph(page)).edges).toEqual(before.edges)
})

test('connect to empty space: a new connected node, opened for its label', async ({ page }) => {
	await sketchGraph(page, [300, 200], 6)
	const before = await graph(page)
	await connectNodes(page, 'v2', [700, 200])
	const after = await graph(page)
	expect(after.nodes).toHaveLength(7)
	expect(after.nodes[6]).toMatchObject({ id: 'v6', value: 'G' })
	expect(between(after, 'v2', 'v6')).toHaveLength(1)
	expect(await nodeAt(page, 'v6')).toEqual([700, 200])
	await editing(page, 'v6')
	await page.keyboard.type('S')
	await page.keyboard.press('Enter')
	expect((await graph(page)).nodes[6].value).toBe('S')
	// Undo the label, then the new node and edge.
	await undo(page)
	await undo(page)
	expect(await graph(page)).toMatchObject({ nodes: before.nodes, edges: before.edges })
})

test('the + grip places a lone node where it is dropped', async ({ page }) => {
	await sketchGraph(page, [300, 200], 6)
	const before = await graph(page)
	const [x, y] = await handlePosition(page, 'grow')
	await page.mouse.move(x, y)
	await page.mouse.down()
	await page.mouse.move(x + 80, y + 60, { steps: 10 })
	await page.mouse.up()
	const after = await graph(page)
	expect(after.nodes).toHaveLength(7)
	expect(after.edges).toEqual(before.edges)
	expect(await nodeAt(page, 'v6')).toEqual([Math.round(x + 80), Math.round(y + 60)])
	await editing(page, 'v6')
})

test('x on an edge removes it; x on a node removes it with its edges and marks', async ({ page }) => {
	await sketchGraph(page, [300, 200], 6)
	const before = await graph(page)
	const edge = before.edges[0]
	await hoverNode(page, edge.from, edge.to)
	await page.getByTestId(`remove-edge-${edge.id}`).click()
	expect((await graph(page)).edges.map((e) => e.id)).toEqual(before.edges.slice(1).map((e) => e.id))
	await undo(page)

	// Mark node v1 and one of its edges, then remove v1.
	const incident = before.edges.filter((e) => e.from === 'v1' || e.to === 'v1')
	await hoverNode(page, incident[0].from, incident[0].to)
	await page.keyboard.press('3')
	await hoverNode(page, 'v1')
	await page.keyboard.press('1')
	expect((await graph(page)).marks).toEqual({ v1: 'red', [`edge:${incident[0].id}`]: 'green' })
	await page.getByTestId('remove-node-v1').click()
	const after = await graph(page)
	expect(after.nodes.map((n) => n.id)).not.toContain('v1')
	expect(after.edges).toHaveLength(before.edges.length - incident.length)
	expect(after.marks).toEqual({})
})

test('edges take marks: point at one and press 3', async ({ page }) => {
	await sketchGraph(page, [300, 200], 6)
	const { edges } = await graph(page)
	await hoverNode(page, edges[1].from, edges[1].to)
	await page.keyboard.press('3')
	expect((await graph(page)).marks).toEqual({ [`edge:${edges[1].id}`]: 'green' })
	await page.keyboard.press('0')
	expect((await graph(page)).marks).toEqual({})
})

test('directed: twins curve apart; switching to undirected merges them in one undo step', async ({ page }) => {
	await page.keyboard.press('Shift+G')
	await page.getByTestId('style.graph-direction.directed').click()
	await sketchGraph(page, [300, 200], 6)
	const before = await graph(page)
	expect(before.direction).toBe('directed')
	const first = before.edges[0]
	await connectNodes(page, first.to, first.from)
	expect(between(await graph(page), first.from, first.to)).toHaveLength(2)
	await page.getByTestId('style.graph-direction.undirected').click()
	const merged = await graph(page)
	expect(merged.direction).toBe('undirected')
	expect(between(merged, first.from, first.to)).toEqual([first])
	await undo(page)
	expect(between(await graph(page), first.from, first.to)).toHaveLength(2)
})

test('weighted: weights show on edges and can be typed in place', async ({ page }) => {
	await sketchGraph(page, [300, 200], 6)
	await page.getByTestId('style.graph-weights.weighted').click()
	const { edges, weights } = await graph(page)
	expect(weights).toBe('weighted')
	const edge = edges[0]
	await page.mouse.dblclick(...(await nodeScreenPosition(page, edge.from, edge.to)))
	await editing(page, `edge:${edge.id}`)
	await page.keyboard.type('12')
	await page.keyboard.press('Enter')
	expect((await graph(page)).edges[0].weight).toBe('12')
	// Connecting in a weighted graph opens the new edge's weight.
	const [a, b] = farApart(await graph(page))
	await connectNodes(page, a, b)
	const added = (await graph(page)).edges.at(-1)!
	await editing(page, `edge:${added.id}`)
})

test('labels: numbers relabel the selected graph 0, 1, 2...', async ({ page }) => {
	await sketchGraph(page, [300, 200], 4)
	await page.getByTestId('style.graph-labels.numbers').click()
	expect((await graph(page)).nodes.map((n) => n.value)).toEqual(['0', '1', '2', '3'])
	await connectNodes(page, 'v0', [300, 500])
	expect((await graph(page)).nodes[4].value).toBe('4')
	expect(await withEditor(page, (e) => e.getPath())).not.toBe('select.dragging_handle')
})
