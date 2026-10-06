import { expect, test, type Page } from '@playwright/test'
import type { ArrayShapeProps } from '../src/shapes/array/array-shape-types'
import { CELL, open, rightClick, shapesOfType, transitionsDone } from './helpers'

const props = async (page: Page) => (await shapesOfType<ArrayShapeProps>(page, 'array'))[0].props

/** Pick a kind with the array tool, then sketch `n` cells from (x, y), dragging the given way. */
async function sketchKind(page: Page, kind: 'stack' | 'queue', [x, y]: [number, number], n: number, dir: 'up' | 'right' | 'down') {
	await page.keyboard.press('Shift+A')
	await page.getByTestId(`style.array-kind.${kind}`).click()
	const d = (n - 1) * CELL + 10
	const [dx, dy] = { up: [0, -d], right: [d, 0], down: [0, d] }[dir]
	await page.mouse.move(x, y)
	await page.mouse.down()
	await page.mouse.move(x + dx, y + dy, { steps: 20 })
	await page.mouse.up()
}

const pointerBox = (page: Page, name: string) => page.locator(`[data-pointer="${name}"]`).boundingBox()

test.beforeEach(({ page }) => open(page))

test('a stack stands upright, index 0 where the drag began, with top at its last value', async ({ page }) => {
	await sketchKind(page, 'stack', [300, 450], 4, 'up')
	const p = await props(page)
	expect(p.kind).toBe('stack')
	expect(p.values).toHaveLength(4)
	// The top marker is drawn by the cell at the top, highest up.
	const top = await pointerBox(page, 'top')
	expect(top!.y).toBeLessThan(450 - 2 * CELL)
	// Double-click index 0, at the bottom, where the drag started: it edits a[0].
	await page.mouse.dblclick(300, 450)
	await expect(page.locator('input[aria-label="Cell 0"]')).toBeFocused()
})

test('a stack sketched downwards still grows up from the press point', async ({ page }) => {
	await sketchKind(page, 'stack', [300, 300], 3, 'down')
	const [cell0, cell2] = await page.evaluate(() => {
		const editor = window.editor!
		const s = editor.getOnlySelectedShape()!
		const util = editor.getShapeUtil(s) as unknown as { cells: { cellBox(s: unknown, k: string): { x: number; y: number } } }
		return ['0', '2'].map((k) => editor.getShapePageTransform(s).applyToPoint(util.cells.cellBox(s, k)).y)
	})
	expect(cell2).toBeLessThan(cell0)
})

test('a fixed queue is a circular buffer: front and rear markers, spare slots blank; one undo back', async ({ page }) => {
	await sketchKind(page, 'queue', [300, 300], 5, 'right')
	await page.getByTestId('style.array-sizing.fixed').click()
	await page.evaluate(() => {
		const editor = window.editor!
		const s = editor.getOnlySelectedShape()!
		editor.updateShape({ id: s.id, type: 'array', props: { values: ['50', '', '20', '30', '40'], used: 4, front: 2 } } as never)
	})
	// front at index 2; rear wraps round to index 1, the next free slot (markers slide there).
	await transitionsDone(page)
	const [front, rear] = [await pointerBox(page, 'front'), await pointerBox(page, 'rear')]
	expect(front!.x).toBeGreaterThan(rear!.x)
	expect(Math.round((front!.x - rear!.x) / CELL)).toBe(1)
	await expect(page.getByTestId('array-capacity')).toHaveText('size 4 · capacity 5')
	// Back to a plain growing array: unwrapped, front first.
	await page.getByTestId('style.array-kind.array').click()
	await page.getByTestId('style.array-sizing.grows').click()
	expect((await props(page)).values).toEqual(['20', '30', '40', '50'])
})

const caption = (page: Page) => page.getByTestId('play-caption')

async function stepToEnd(page: Page) {
	while (!(await page.getByTestId('play-done').count())) await page.keyboard.press('ArrowRight')
}

async function menu(page: Page, at: [number, number], submenu: string, item: string) {
	await rightClick(page, at)
	await page.getByTestId(`context-menu-sub.drawds-${submenu}-button`).click()
	await page.getByTestId(`context-menu.${item}`).click()
}

test('stack: push a typed value, pop it again (last in, first out); overflow when full', async ({ page }) => {
	await sketchKind(page, 'stack', [300, 450], 2, 'up')
	await page.getByTestId('style.array-sizing.fixed').click()
	await menu(page, [300, 450], 'array-steps', 'array-push-value')
	await page.getByTestId('key-prompt').fill('42')
	await page.keyboard.press('Enter')
	// No spare slots: the push overflows and nothing changes.
	await expect(caption(page)).toContainText('the stack is full. Stack overflow')
	await page.keyboard.press('Enter')
	expect(await props(page)).toMatchObject({ used: 2 })
	// Make room, push, then pop.
	await menu(page, [300, 450], 'array-steps', 'array-grow')
	await page.keyboard.press('Enter')
	await menu(page, [300, 450], 'array-steps', 'array-push-value')
	await page.getByTestId('key-prompt').fill('42')
	await page.keyboard.press('Enter')
	await stepToEnd(page)
	await page.keyboard.press('Enter')
	expect(await props(page)).toMatchObject({ used: 3 })
	expect((await props(page)).values[2]).toBe('42')
	await menu(page, [300, 450], 'array-steps', 'array-pop')
	await stepToEnd(page)
	await expect(caption(page)).toHaveText('top = top - 1 = 1: a[2] is free again. Popped 42, the last value pushed')
	await expect(page.getByTestId('playback-strip')).toContainText('42')
	await page.keyboard.press('Enter')
	expect(await props(page)).toMatchObject({ used: 2 })
})

test('circular queue: enqueue wraps rear round to 0; dequeue moves front on, nothing else moves', async ({ page }) => {
	await sketchKind(page, 'queue', [300, 300], 4, 'right')
	await page.getByTestId('style.array-sizing.fixed').click()
	await page.evaluate(() => {
		const editor = window.editor!
		const s = editor.getOnlySelectedShape()!
		editor.updateShape({ id: s.id, type: 'array', props: { values: ['', 'a', 'b', ''], used: 2, front: 1 } } as never)
	})
	await menu(page, [300, 300], 'array-steps', 'array-enqueue-value')
	await page.getByTestId('key-prompt').fill('c')
	await page.keyboard.press('Enter')
	await stepToEnd(page)
	await expect(caption(page)).toHaveText('rear = (rear + 1) % 4 = 0: past the end, it wraps round to 0; size = 3')
	await page.keyboard.press('Enter')
	expect(await props(page)).toMatchObject({ values: ['', 'a', 'b', 'c'], used: 3, front: 1 })
	await menu(page, [300, 300], 'array-steps', 'array-dequeue')
	await stepToEnd(page)
	await expect(page.getByTestId('playback-strip')).toContainText('a')
	await page.keyboard.press('Enter')
	expect(await props(page)).toMatchObject({ values: ['', '', 'b', 'c'], used: 2, front: 2 })
})

test('a growing queue (a list) shifts every value to dequeue one', async ({ page }) => {
	await sketchKind(page, 'queue', [300, 300], 4, 'right')
	const before = (await props(page)).values
	await menu(page, [300, 300], 'array-steps', 'array-dequeue')
	await stepToEnd(page)
	await expect(page.getByTestId('play-counts')).toHaveText('moves 3')
	await page.keyboard.press('Enter')
	expect((await props(page)).values).toEqual(before.slice(1))
})

test('on-canvas buttons: push and pop a stack, enqueue and dequeue a queue', async ({ page }) => {
	await sketchKind(page, 'stack', [300, 450], 3, 'up')
	const before = (await props(page)).values
	await page.getByTestId('stack-push').click()
	await expect(caption(page)).toContainText('top = top + 1 = 3, a new cell on top')
	await page.keyboard.press('Enter')
	expect((await props(page)).values).toHaveLength(4)
	await page.getByTestId('stack-pop').click()
	await page.keyboard.press('Enter')
	expect((await props(page)).values).toEqual(before)
	await page.keyboard.press('Escape')
	await sketchKind(page, 'queue', [500, 200], 3, 'right')
	const queue = (await shapesOfType<ArrayShapeProps>(page, 'array')).find((s) => s.props.kind === 'queue')!.props.values
	await page.getByTestId('queue-dequeue').click()
	await page.keyboard.press('Enter')
	await page.getByTestId('queue-enqueue').click()
	await page.keyboard.press('Enter')
	const after = (await shapesOfType<ArrayShapeProps>(page, 'array')).find((s) => s.props.kind === 'queue')!.props.values
	expect(after.slice(0, 2)).toEqual(queue.slice(1))
	expect(after).toHaveLength(3)
})
