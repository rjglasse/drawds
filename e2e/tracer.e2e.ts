import { expect, test, type Page } from '@playwright/test'
import type { TracerShapeProps } from '../src/shapes/recursion/tracer-shape-types'
import { open, rightClick, shapesOfType, withEditor } from './helpers'

const caption = (page: Page) => page.getByTestId('play-caption')
const tracer = async (page: Page) => (await shapesOfType<TracerShapeProps>(page, 'recursion-tracer'))[0]
const trees = (page: Page) => shapesOfType(page, 'recursion-tree')
/** The frames on the stack now, bottom up, as "call: work". */
const stack = (page: Page) =>
	page.locator('[data-frame]').evaluateAll((gs) => gs.map((g) => [...g.querySelectorAll('text')].map((t) => t.textContent).join(': ')))

/** Main's frame: its middle at the press point (200, 400), so its call sits right of it. */
const MAIN: [number, number] = [200, 400]

async function place(page: Page) {
	await page.keyboard.press('Shift+R')
	await page.mouse.click(...MAIN)
	await expect(page.getByTestId('tracer')).toBeVisible()
}

async function run(page: Page) {
	await rightClick(page, [MAIN[0] + 30, MAIN[1]])
	await page.getByTestId('context-menu-sub.drawds-tracer-steps-button').click()
	await page.getByTestId('context-menu.tracer-run').click()
	await expect(page.getByTestId('play-bar')).toBeVisible()
}

async function stepToEnd(page: Page) {
	while (!(await page.getByTestId('play-done').count())) await page.keyboard.press('ArrowRight')
}

test.beforeEach(({ page }) => open(page))

test('type a call into main, then trace it: frames go on the stack and come off it, the code lights its case', async ({ page }) => {
	await place(page)
	expect((await tracer(page)).props).toMatchObject({ fn: 'gcd', call: 'gcd(60, 24)' })
	// Main's call is its one cell: typing another function's call picks it.
	const box = await withEditor(page, (e) => {
		const s = e.getCurrentPageShapes().find((s) => s.type === 'recursion-tracer')!
		const b = e.getShapePageBounds(s)!
		return { right: b.maxX }
	})
	await page.mouse.dblclick(box.right - 40, MAIN[1])
	await page.keyboard.press('ControlOrMeta+a')
	await page.keyboard.type('fact(3)')
	await page.keyboard.press('Enter')
	expect((await tracer(page)).props).toMatchObject({ fn: 'fact', call: 'fact(3)' })
	await expect(page.getByTestId('tracer-code')).toContainText('return n * fact(n - 1);')
	await run(page)
	await expect(caption(page)).toHaveText('fact(3): 3 > 1, so return 3 * fact(2): call fact(2) first')
	expect(await stack(page)).toEqual(['main: fact(3)', 'fact(3): 3 * fact(2)'])
	await expect(page.locator('[data-line="recursive"][data-lit]')).toHaveCount(1)
	await page.keyboard.press('ArrowRight')
	await page.keyboard.press('ArrowRight')
	await expect(caption(page)).toHaveText('fact(1): 1 ≤ 1, the base case: return 1')
	await expect(page.locator('[data-line="base"][data-lit]')).toHaveCount(1)
	await page.keyboard.press('ArrowRight')
	// fact(1) has gone; its 1 comes down into fact(2).
	expect(await stack(page)).toEqual(['main: fact(3)', 'fact(3): 3 * fact(2)', 'fact(2): 2 * 1 = 2'])
	await expect(page.locator('[data-flowing="1"]')).toHaveCount(1)
	await stepToEnd(page)
	await expect(caption(page)).toHaveText('main: fact(3) = 6. 3 calls, at most 3 on the stack at once')
	// A chain of calls is what the stack shows: no tree beside it.
	expect(await trees(page)).toHaveLength(0)
	await page.keyboard.press('Enter')
	await expect(page.getByTestId('play-bar')).toHaveCount(0)
	expect(await stack(page)).toEqual(['main: fact(3)'])
})

test('fib branches: its recursion tree opens beside the tracer, repeats marked; Esc takes the tree away', async ({ page }) => {
	await place(page)
	await page.getByTestId('style.recursion-fn.fib').click()
	expect((await tracer(page)).props).toMatchObject({ fn: 'fib', call: 'fib(5)' })
	await run(page)
	expect(await trees(page)).toHaveLength(1)
	await page.keyboard.press('Escape')
	await expect(page.getByTestId('play-bar')).toHaveCount(0)
	await expect.poll(async () => (await trees(page)).length).toBe(0)
	await run(page)
	await stepToEnd(page)
	await page.keyboard.press('Enter')
	await expect(page.getByTestId('recursion-tree')).toContainText('fib(5): 15 calls, 5 deep, 9 repeated')
})

test('sayHello has no base case: the stack fills up and overflows, printing all the way', async ({ page }) => {
	await place(page)
	await page.getByTestId('style.recursion-fn.hello').click()
	await run(page)
	await stepToEnd(page)
	await expect(caption(page)).toContainText('but the stack is full: StackOverflowError')
	await expect(page.locator('[data-frame="sayHello()"]')).toHaveCount(8)
	await expect(page.getByTestId('tracer-stack')).toHaveAttribute('data-overflow', 'true')
	const output = page.getByTestId('playback-strip').filter({ hasText: 'output' })
	await expect(output).toContainText('Hello!')
	// A typed call it can't trace says why, and can't be run.
	await page.keyboard.press('Enter')
	await withEditor(page, (e) => {
		const s = e.getCurrentPageShapes().find((s) => s.type === 'recursion-tracer')!
		e.updateShape({ id: s.id, type: s.type, props: { call: 'fib(12)' } } as never)
	})
	await expect(page.getByTestId('tracer')).toContainText('fib: up to fib(7) here (41 calls)')
	await rightClick(page, [MAIN[0] + 30, MAIN[1]])
	await expect(page.getByTestId('context-menu-sub.drawds-tracer-steps-button')).toHaveCount(0)
})

test("Euclid as a loop beside the recursion: one frame, m and n changed in place, the rounds counted", async ({ page }) => {
	await place(page)
	await page.getByTestId('style.recursion-fn.gcd-loop').click()
	expect((await tracer(page)).props).toMatchObject({ fn: 'gcd-loop', call: 'gcd(60, 24)' })
	await expect(page.getByTestId('tracer-code')).toContainText('while (n != 0) {')
	await run(page)
	await expect(caption(page)).toHaveText('gcd(60, 24): one frame, m = 60 and n = 24 in it. n = 24 ≠ 0: round the loop')
	await page.keyboard.press('ArrowRight')
	await page.keyboard.press('ArrowRight')
	await expect(caption(page)).toHaveText('m = n, n = r: now m = 24, n = 12, in the same frame')
	await expect(page.locator('[data-line="shift"][data-lit]')).toHaveCount(1)
	// Still the one frame over main.
	expect(await stack(page)).toEqual(['main: gcd(60, 24)', 'gcd(60, 24): m = 24, n = 12'])
	await stepToEnd(page)
	await expect(caption(page)).toHaveText(
		'main: gcd(60, 24) = 12. One call and one frame, round the loop 2 times, m and n changed in place: the recursive gcd pushes a frame per call (3 here)'
	)
	await expect(page.getByTestId('play-bar')).toContainText('times round 2')
})

test('sayHello(i) passes i on: each frame says how deep it is, and the overflow says where', async ({ page }) => {
	await place(page)
	await page.getByTestId('style.recursion-fn.hello-count').click()
	expect((await tracer(page)).props).toMatchObject({ fn: 'hello-count', call: 'sayHello(1)' })
	await run(page)
	await stepToEnd(page)
	await expect(caption(page)).toContainText('sayHello(8) calls sayHello(9), but the stack is full: StackOverflowError at i = 9')
	await expect(page.locator('[data-frame^="sayHello("]')).toHaveCount(8)
	const output = page.getByTestId('playback-strip').filter({ hasText: 'output' })
	await expect(output).toContainText('Hello 1')
	await expect(output).toContainText('Hello 8')
})

test('a tracer clicked near the top of the window moves down so its call stack shows, in the same undo step', async ({ page }) => {
	await page.keyboard.press('Shift+R')
	await page.mouse.click(300, 100)
	await expect(page.getByTestId('tracer')).toBeVisible()
	const { bounds, view } = await withEditor(page, (e) => {
		const s = e.getCurrentPageShapes().find((s) => s.type === 'recursion-tracer')!
		const b = e.getShapePageBounds(s)!
		const v = e.getViewportPageBounds()
		return { bounds: { top: b.minY, bottom: b.maxY }, view: { top: v.minY, bottom: v.maxY } }
	})
	expect(bounds.top).toBeGreaterThanOrEqual(view.top)
	expect(bounds.bottom).toBeLessThanOrEqual(view.bottom)
	// One undo takes it away, moved or not.
	await page.keyboard.press('ControlOrMeta+z')
	await expect.poll(async () => (await shapesOfType(page, 'recursion-tracer')).length).toBe(0)
})

test('its menu has no Mark submenu: nothing in a tracer is marked', async ({ page }) => {
	await place(page)
	await rightClick(page, [MAIN[0] + 30, MAIN[1]])
	await expect(page.getByTestId('context-menu-sub.drawds-tracer-steps-button')).toBeVisible()
	await expect(page.getByTestId('context-menu-sub.drawds-mark-button')).toHaveCount(0)
})
