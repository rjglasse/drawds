import { expect, type Page } from '@playwright/test'
import type { Editor, TLShape } from 'tldraw'

/** Cell size at the default size style "m" (src/shapes/sizes.ts). */
export const CELL = 48
/** Linked-list node spacing at size "m": node (1.5 cells) + arrow gap (0.9). */
export const LIST_STEP = CELL * 2.4
/** Binary tree level height at size "m". */
export const TREE_LEVEL = CELL * 1.6
/** Distance between nodes dropped along a graph sketch at size "m". */
export const GRAPH_STEP = CELL * 2.3

type Direction = 'right' | 'left' | 'down' | 'up'

/** Open the app on an empty page. Each test gets a fresh browser context, so storage is empty. */
export async function open(page: Page) {
	await page.goto('/')
	await page.waitForFunction(() => !!window.editor)
}

/** Run a function against the tldraw editor in the page and return its (serialisable) result. */
export function withEditor<T>(page: Page, fn: (editor: Editor) => T): Promise<T> {
	return page.evaluate(`(${fn.toString()})(window.editor)`) as Promise<T>
}

export function shapesOfType<P>(page: Page, type: string): Promise<(TLShape & { props: P })[]> {
	return page.evaluate((type) => window.editor!.getCurrentPageShapes().filter((s) => s.type === type), type) as never
}

async function sketch(page: Page, shortcut: string, step: number, [x, y]: [number, number], n: number, dir: Direction) {
	const d = (n - 1) * step + 10
	const [dx, dy] = { right: [d, 0], left: [-d, 0], down: [0, d], up: [0, -d] }[dir]
	await page.keyboard.press(shortcut)
	await page.mouse.move(x, y)
	await page.mouse.down()
	await page.mouse.move(x + dx, y + dy, { steps: 20 })
	await page.mouse.up()
}

/** Sketch an array of n cells with the first cell centred on `at`. */
export function sketchArray(page: Page, at: [number, number], n: number, dir: Direction = 'right') {
	return sketch(page, 'Shift+A', CELL, at, n, dir)
}

/** Sketch a linked list of n nodes with the head node centred on `at`. */
export function sketchList(page: Page, at: [number, number], n: number, dir: Direction = 'right') {
	return sketch(page, 'Shift+N', LIST_STEP, at, n, dir)
}

/**
 * Sketch a binary tree with `depth` levels, root centred on `at`. `lean` from -1 (a bare stick)
 * through 0 (random) to 1 (a perfect tree) sets how full it is.
 */
export async function sketchTree(page: Page, [x, y]: [number, number], depth: number, lean = 0) {
	await page.keyboard.press('Shift+T')
	await page.mouse.move(x, y)
	await page.mouse.down()
	await page.mouse.move(x + lean * 2 * CELL, y + (depth - 1) * TREE_LEVEL + 10, { steps: 20 })
	await page.mouse.up()
}

/** Sketch a heap of n values (one inserted per cell-width dragged right), root centred on `at`. */
export async function sketchHeap(page: Page, [x, y]: [number, number], n: number) {
	await page.keyboard.press('Shift+P')
	await page.mouse.move(x, y)
	await page.mouse.down()
	await page.mouse.move(x + (n - 1) * CELL + 10, y, { steps: 20 })
	await page.mouse.up()
}

/**
 * Sketch a graph of n nodes along a serpentine path (rows of `cols`, GRAPH_STEP apart), the first
 * node centred on `at`. The pointer moves a few px per frame, as a hand would: tldraw coalesces
 * faster moves, which cuts corners.
 */
export async function sketchGraph(page: Page, [x, y]: [number, number], n: number, cols = 3) {
	const path: [number, number][] = [[x, y]]
	let [px, py, dir] = [x, y, 1]
	let left = (n - 1) * GRAPH_STEP + 8
	while (left > 0) {
		const run = Math.min(left, (cols - 1) * GRAPH_STEP || left)
		px += dir * run
		path.push([px, py])
		left -= run
		if (left <= 0) break
		const down = Math.min(left, GRAPH_STEP)
		py += down
		path.push([px, py])
		left -= down
		dir = -dir
	}
	await page.keyboard.press('Shift+G')
	await page.mouse.move(x, y)
	await page.mouse.down()
	for (let i = 1; i < path.length; i++) {
		const [[ax, ay], [bx, by]] = [path[i - 1], path[i]]
		const steps = Math.ceil(Math.hypot(bx - ax, by - ay) / 8)
		for (let j = 1; j <= steps; j++) {
			await page.mouse.move(ax + ((bx - ax) * j) / steps, ay + ((by - ay) * j) / steps)
			await page.waitForTimeout(16)
		}
	}
	await page.mouse.up()
}

/** Drag a graph node's connect grip onto another node, or to a screen point. */
export async function connectNodes(page: Page, from: string, to: string | [number, number]) {
	const start = await handlePosition(page, `connect:${from}`)
	const end = typeof to === 'string' ? await nodeScreenPosition(page, to) : to
	await page.mouse.move(...start)
	await page.mouse.down()
	await page.mouse.move(...end, { steps: 15 })
	await page.mouse.up()
}

/** Type into the selected shape's "insert a key" prompt and submit (Shift+Enter keeps highlights). */
export async function insertKey(page: Page, key: string, keep = false) {
	await page.getByTestId('insert-key').click()
	await page.getByTestId('key-prompt').fill(key)
	await page.keyboard.press(keep ? 'Shift+Enter' : 'Enter')
}

/** Screen position of a node's drag handle on the only selected shape. */
export async function handlePosition(page: Page, key: string): Promise<[number, number]> {
	const at = await page.evaluate((key) => {
		const e = window.editor!
		const shape = e.getOnlySelectedShape()
		const handle = shape && e.getShapeHandles(shape)?.find((h) => h.id === key)
		if (!shape || !handle) return null
		const p = e.pageToScreen(e.getShapePageTransform(shape).applyToPoint(handle))
		return [p.x, p.y] as [number, number]
	}, key)
	expect(at, `handle ${key} on the selected shape`).not.toBeNull()
	return at!
}

/**
 * Screen position of a node of the only selected node-link shape, or of the point half-way between
 * several nodes (between two linked nodes, that is on the edge joining them).
 */
export async function nodeScreenPosition(page: Page, ...keys: string[]): Promise<[number, number]> {
	const at = await page.evaluate(
		(keys) => {
			const e = window.editor!
			const shape = e.getOnlySelectedShape()
			const util = shape && (e.getShapeUtil(shape) as unknown as { getScene?(s: unknown): { nodes: { key: string; x: number; y: number }[] } })
			const scene = shape && util?.getScene?.(shape)
			const nodes = scene && keys.map((k) => scene.nodes.find((n) => n.key === k))
			if (!shape || !nodes || nodes.some((n) => !n)) return null
			const mid = {
				x: nodes.reduce((s, n) => s + n!.x, 0) / nodes.length,
				y: nodes.reduce((s, n) => s + n!.y, 0) / nodes.length,
			}
			const p = e.pageToScreen(e.getShapePageTransform(shape).applyToPoint(mid))
			return [p.x, p.y] as [number, number]
		},
		keys
	)
	expect(at, `node(s) ${keys.join(', ')} on the selected shape`).not.toBeNull()
	return at!
}

/** Move the pointer to a node (or between nodes); with a mouse, node and edge controls only appear near it. */
export async function hoverNode(page: Page, ...keys: string[]) {
	await page.mouse.move(...(await nodeScreenPosition(page, ...keys)))
}

/** The aria-label of the focused element, e.g. "Cell 0" while editing a cell. */
export function focusedLabel(page: Page) {
	return page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? null)
}
