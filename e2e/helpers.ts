import { expect, type Page } from '@playwright/test'
import type { Editor, TLShape } from 'tldraw'

/** Cell size at the default size style "m" (src/shapes/sizes.ts). */
export const CELL = 48
/** Linked-list node spacing at size "m": node (1.5 cells) + arrow gap (0.9). */
export const LIST_STEP = CELL * 2.4

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

/** The aria-label of the focused element, e.g. "Cell 0" while editing a cell. */
export function focusedLabel(page: Page) {
	return page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? null)
}
