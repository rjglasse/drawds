import { expect, test, type Page } from '@playwright/test'
import { nodeScreenPosition, open, rightClick, sketchArray, sketchGraph, sketchHeap, sketchList, sketchTree } from './helpers'

// Every structure's context menu has the same shape: Step by step (animated operations), then a
// submenu named after the structure (instant changes), then Show, then Mark and Pointer, each only
// when it has something in it. Test ids follow the sections: context-menu-sub.drawds-<id>-<section>.

/** Our submenus in the context menu opened at the point: labels in order, and their test ids. */
async function submenusAt(page: Page, at: [number, number]) {
	await rightClick(page, at)
	const subs = page.locator('[data-testid^="context-menu-sub.drawds-"][data-testid$="-button"]')
	await expect(subs.first()).toBeVisible()
	const found = await subs.evaluateAll((els) => els.map((e) => [(e.textContent ?? '').trim(), e.getAttribute('data-testid')!]))
	await page.keyboard.press('Escape')
	await expect(subs).toHaveCount(0)
	return found
}

/** Test ids of a structure's sections; Mark and Pointer are the same submenus everywhere. */
const ids = (prefix: string, ...sections: string[]) =>
	sections.map((s) => `context-menu-sub.drawds-${s === 'mark' || s === 'pointer' ? s : `${prefix}-${s}`}-button`)

const setProps = (page: Page, props: Record<string, unknown>) =>
	page.evaluate((props) => {
		const e = window.editor!
		const s = e.getCurrentPageShapes()[0]
		e.updateShape({ id: s.id, type: s.type, props } as never)
		e.select(s.id)
	}, props)

test.beforeEach(({ page }) => open(page))

test('arrays, stacks and matrices: Step by step, their name, Show, Mark, Pointer', async ({ page }) => {
	await sketchArray(page, [300, 300], 5)
	expect(await submenusAt(page, [348, 300])).toEqual(
		['Step by step', 'Array', 'Show', 'Mark', 'Pointer'].map((label, i) => [label, ids('array', 'steps', 'actions', 'show', 'mark', 'pointer')[i]])
	)
	await setProps(page, { kind: 'stack' })
	expect((await submenusAt(page, [300, 300])).map(([label]) => label)).toEqual(['Step by step', 'Stack', 'Show', 'Mark', 'Pointer'])
	await page.evaluate(() => void window.editor!.deleteShapes([...window.editor!.getCurrentPageShapeIds()]))
	await page.keyboard.press('Shift+M')
	await page.mouse.move(300, 300)
	await page.mouse.down()
	await page.mouse.move(300 + 2 * 48 + 10, 300 + 2 * 48 + 10, { steps: 20 })
	await page.mouse.up()
	expect(await submenusAt(page, [300, 300])).toEqual(['Step by step', 'Matrix', 'Mark'].map((label, i) => [label, ids('matrix', 'steps', 'actions', 'mark')[i]]))
})

test('lists, trees and heaps follow the same layout', async ({ page }) => {
	await sketchList(page, [300, 300], 3)
	expect(await submenusAt(page, await nodeScreenPosition(page, 'n1'))).toEqual(
		['Step by step', 'Linked list', 'Show', 'Mark', 'Pointer'].map((label, i) => [label, ids('list', 'steps', 'actions', 'show', 'mark', 'pointer')[i]])
	)
	await page.evaluate(() => void window.editor!.deleteShapes([...window.editor!.getCurrentPageShapeIds()]))
	await sketchTree(page, [600, 200], 2, 1)
	expect((await submenusAt(page, await nodeScreenPosition(page, 'n'))).map(([label]) => label)).toEqual(['Step by step', 'Binary tree', 'Mark', 'Pointer'])
	await page.getByTestId('style.tree-kind.bst').click()
	// A BST changes only through its own (step by step) insert and delete: its own submenu just has Clean copy.
	expect((await submenusAt(page, await nodeScreenPosition(page, 'n'))).map(([label]) => label)).toEqual(['Step by step', 'Binary search tree', 'Mark', 'Pointer'])
	await page.evaluate(() => void window.editor!.deleteShapes([...window.editor!.getCurrentPageShapeIds()]))
	await sketchHeap(page, [600, 200], 5)
	expect(await submenusAt(page, await nodeScreenPosition(page, '1'))).toEqual(
		['Step by step', 'Heap', 'Mark', 'Pointer'].map((label, i) => [label, ids('heap', 'steps', 'actions', 'mark', 'pointer')[i]])
	)
})

test('hash tables and graphs follow the same layout', async ({ page }) => {
	await page.keyboard.press('Shift+B')
	await page.mouse.move(300, 200)
	await page.mouse.down()
	await page.mouse.move(300, 200 + 4 * 48 + 10, { steps: 20 })
	await page.mouse.up()
	await setProps(page, { buckets: [['10', '5'], ['6'], [], [], []] })
	expect((await submenusAt(page, await nodeScreenPosition(page, 'k:6'))).map(([label]) => label)).toEqual(['Step by step', 'Hash table', 'Mark', 'Pointer'])
	await page.evaluate(() => void window.editor!.deleteShapes([...window.editor!.getCurrentPageShapeIds()]))
	await sketchGraph(page, [300, 250], 5)
	expect(await submenusAt(page, await nodeScreenPosition(page, 'v0'))).toEqual(
		['Step by step', 'Graph', 'Show', 'Mark', 'Pointer'].map((label, i) => [label, ids('graph', 'steps', 'actions', 'show', 'mark', 'pointer')[i]])
	)
})

test('the style panel says what can be done with the selected structure', async ({ page }) => {
	await sketchArray(page, [300, 300], 5)
	await page.getByTestId('structure-hint').click()
	const hint = page.getByTestId('structure-hint-content')
	await expect(hint).toContainText('Array')
	await expect(hint).toContainText('Drag the dot under a cell onto another cell to swap them')
	await expect(hint).toContainText('press 1–4 to mark it')
	await expect(hint).toContainText('Clean copy')
	await expect(hint).toContainText('Seed (above)')
	await page.keyboard.press('Escape')
	await page.keyboard.press('Escape')
	await page.evaluate(() => void window.editor!.deleteShapes([...window.editor!.getCurrentPageShapeIds()]))
	await sketchGraph(page, [300, 250], 4)
	await page.getByTestId('structure-hint').click()
	await expect(hint).toContainText('Graph')
	await expect(hint).toContainText("Drag from the dot on a node's right edge")
	// Nothing selected: no hint.
	await page.keyboard.press('Escape')
	await page.evaluate(() => void window.editor!.selectNone())
	await expect(page.getByTestId('structure-hint')).toHaveCount(0)
})

test('union-find follows the same layout', async ({ page }) => {
	await page.keyboard.press('Shift+U')
	await page.mouse.move(300, 200)
	await page.mouse.down()
	await page.mouse.move(300 + 3 * 48 + 10, 200, { steps: 20 })
	await page.mouse.up()
	expect(await submenusAt(page, await nodeScreenPosition(page, '1'))).toEqual(
		['Step by step', 'Union-find', 'Mark', 'Pointer'].map((label, i) => [label, ids('uf', 'steps', 'actions', 'mark', 'pointer')[i]])
	)
})
