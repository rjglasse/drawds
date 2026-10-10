import { expect, test, type Page } from '@playwright/test'
import { heapInsert, heapRemoveAt, heapViolations } from '../src/shapes/heap/heap'
import type { HeapShapeProps } from '../src/shapes/heap/heap-shape-types'
import { focusedLabel, hoverNode, insertKey, nodeScreenPosition, open, rightClick, shapesOfType, sketchHeap, withEditor } from './helpers'

const heap = async (page: Page) => (await shapesOfType<HeapShapeProps>(page, 'heap'))[0].props
const valid = (p: HeapShapeProps) => heapViolations(p.values, p.heapType).size === 0

test.beforeEach(({ page }) => open(page))

test('drag right to grow a valid min heap, drawn as a tree with its array below', async ({ page }) => {
	await sketchHeap(page, [600, 120], 10)
	const props = await heap(page)
	expect(props.values).toHaveLength(10)
	expect(props.heapType).toBe('min')
	expect(valid(props)).toBe(true)
	const keys = await withEditor(page, (e) => {
		const s = e.getOnlySelectedShape()!
		return (e.getShapeUtil(s) as unknown as { getScene(x: unknown): { nodes: { key: string }[] } }).getScene(s).nodes.map((n) => n.key)
	})
	expect(keys).toContain('9')
	expect(keys).toContain('a9')
})

test('insert sifts the value up; the heap stays valid; one undo', async ({ page }) => {
	await sketchHeap(page, [600, 120], 9)
	const before = await heap(page)
	const expected = heapInsert(before.values, '-1', 'min')
	await insertKey(page, '-1')
	await page.keyboard.press('Enter')
	expect((await heap(page)).values).toHaveLength(10)
	const after = await heap(page)
	expect(after.values).toEqual(expected.values)
	expect(after.values[0]).toBe('-1')
	await page.keyboard.press('ControlOrMeta+z')
	expect((await heap(page)).values).toEqual(before.values)
})

test('x on the root extracts the minimum', async ({ page }) => {
	await sketchHeap(page, [600, 120], 10)
	const before = await heap(page)
	const expected = heapRemoveAt(before.values, 0, 'min')
	await hoverNode(page, '0')
	await page.getByTestId('remove-node-0').click()
	await page.keyboard.press('Enter')
	expect((await heap(page)).values).toHaveLength(9)
	expect((await heap(page)).values).toEqual(expected.values)
	expect(valid(await heap(page))).toBe(true)
})

test('switching to max rebuilds the heap', async ({ page }) => {
	await sketchHeap(page, [600, 120], 8)
	await page.getByTestId('style.heap-type.max').click()
	const props = await heap(page)
	expect(props.heapType).toBe('max')
	expect(valid(props)).toBe(true)
})

test('editing a cell in the array view edits the tree node too, without re-heapifying', async ({ page }) => {
	await sketchHeap(page, [600, 120], 5)
	await page.mouse.dblclick(...(await nodeScreenPosition(page, 'a4')))
	await expect.poll(() => focusedLabel(page)).toBe('Cell a4')
	await page.keyboard.type('-5')
	await page.keyboard.press('Enter')
	const props = await heap(page)
	expect(props.values[4]).toBe('-5')
	// A broken heap is allowed: it's a "spot the error" exercise.
	expect(valid(props)).toBe(false)
})

test('pointing at an index highlights it, its parent and its children in both views', async ({ page }) => {
	await sketchHeap(page, [600, 120], 7)
	await hoverNode(page, 'a1')
	// Index 1, parent 0 and children 3 and 4, each in the tree and in the array (once it has redrawn).
	await expect.poll(() => page.evaluate(() => document.querySelectorAll('.drawds-flash').length)).toBe(8)
})

test('shuffle breaks the heap; build heap step by step restores it (Floyd), one undo', async ({ page }) => {
	await sketchHeap(page, [600, 120], 7)
	const heapMenu = async (item: string) => {
		await rightClick(page, await nodeScreenPosition(page, '0'))
		await page.getByTestId(`context-menu-sub.drawds-heap-${item === 'heap-build' ? 'steps' : 'actions'}-button`).click()
		await page.getByTestId(`context-menu.${item}`).click()
	}
	// Shuffles until it isn't a heap (a shuffle can land on another heap).
	for (let tries = 0; tries < 10 && valid(await heap(page)); tries++) {
		await heapMenu('heap-shuffle')
	}
	const shuffled = await heap(page)
	expect(valid(shuffled)).toBe(false)
	await heapMenu('heap-build')
	await expect(page.getByTestId('play-caption')).toHaveText(
		'The leaves (index 3 on) are heaps on their own. Sift down each parent, from the last (index 2) back to the root'
	)
	while (!(await page.getByTestId('play-done').count())) await page.keyboard.press('ArrowRight')
	await expect(page.getByTestId('play-caption')).toContainText('Every parent ≤ its children: a min heap')
	const built = await heap(page)
	expect(valid(built)).toBe(true)
	expect([...built.values].sort()).toEqual([...shuffled.values].sort())
	await page.keyboard.press('Enter')
	await page.keyboard.press('ControlOrMeta+z')
	expect((await heap(page)).values).toEqual(shuffled.values)
})
