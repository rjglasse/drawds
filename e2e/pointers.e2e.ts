import { expect, test, type Page } from '@playwright/test'
import type { Pointer } from '../src/pointers/pointers'
import { CELL, LIST_STEP, hoverNode, open, sketchArray, sketchGraph, sketchList, withEditor } from './helpers'

/** Pointers on the first shape of a type, as `name@element`. */
const pointers = (page: Page, type: string) =>
	page.evaluate(
		(type) =>
			(window.editor!.getCurrentPageShapes().find((s) => s.type === type)!.props as { pointers: Pointer[] }).pointers.map(
				(p) => `${p.name}@${p.at}`
			),
		type
	)

/** Right-click a point and pick Pointer > name (or 'custom'). */
async function pointerMenu(page: Page, at: [number, number], name: string) {
	// A context menu that is still closing swallows the next right-click.
	await expect(page.getByTestId('context-menu')).toHaveCount(0)
	await page.waitForTimeout(400)
	await page.mouse.click(...at, { button: 'right' })
	await page.getByTestId('context-menu-sub.drawds-pointer-button').click()
	await page.getByTestId(`context-menu.pointer-${name}`).click()
}

const cellAt = (i: number): [number, number] => [300 + i * CELL, 200]

test.beforeEach(({ page }) => open(page))

test('add i from the menu, pick it up and step it to one past the end; one undo per step', async ({ page }) => {
	await sketchArray(page, [300, 200], 4)
	await pointerMenu(page, cellAt(1), 'i')
	expect(await pointers(page, 'array')).toEqual(['i@1'])
	await page.getByTestId('pointer-i').click()
	for (let k = 0; k < 5; k++) await page.keyboard.press('ArrowRight')
	// It stops one past the end: i == n.
	expect(await pointers(page, 'array')).toEqual(['i@4'])
	await page.keyboard.press('ArrowLeft')
	expect(await pointers(page, 'array')).toEqual(['i@3'])
	// The arrows moved the pointer, not the array.
	expect(await withEditor(page, (e) => Math.round(e.getCurrentPageShapes()[0].x))).toBe(300 - CELL / 2)
	await page.keyboard.press('Escape')
	expect(await withEditor(page, (e) => e.getSelectedShapeIds().length)).toBe(1)
	await page.keyboard.press('ControlOrMeta+z')
	expect(await pointers(page, 'array')).toEqual(['i@4'])
})

test('a name already on the shape moves there; drag a pointer onto another cell', async ({ page }) => {
	await sketchArray(page, [300, 200], 6)
	await pointerMenu(page, cellAt(0), 'lo')
	await pointerMenu(page, cellAt(5), 'hi')
	await pointerMenu(page, cellAt(2), 'lo')
	expect(await pointers(page, 'array')).toEqual(['lo@2', 'hi@5'])
	const handle = await page.getByTestId('pointer-hi').boundingBox()
	await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2)
	await page.mouse.down()
	await page.mouse.move(...cellAt(3), { steps: 10 })
	await page.mouse.up()
	expect(await pointers(page, 'array')).toEqual(['lo@2', 'hi@3'])
})

test('custom names, renaming and removing', async ({ page }) => {
	await sketchArray(page, [300, 200], 4)
	await pointerMenu(page, cellAt(0), 'custom')
	await page.getByTestId('key-prompt').fill('left')
	await page.keyboard.press('Enter')
	expect(await pointers(page, 'array')).toEqual(['left@0'])
	await page.getByTestId('pointer-left').dblclick()
	await page.getByTestId('key-prompt').fill('l')
	await page.keyboard.press('Enter')
	expect(await pointers(page, 'array')).toEqual(['l@0'])
	await page.getByTestId('pointer-l').click()
	await page.keyboard.press('Delete')
	expect(await pointers(page, 'array')).toEqual([])
})

test('curr walks a list to null; removing a node takes its pointer with it', async ({ page }) => {
	await sketchList(page, [200, 150], 3)
	await pointerMenu(page, [188, 150], 'curr')
	await pointerMenu(page, [188 + LIST_STEP, 150], 'prev')
	expect(await pointers(page, 'linked-list')).toEqual(['curr@n0', 'prev@n1'])
	await page.getByTestId('pointer-curr').click()
	for (let k = 0; k < 4; k++) await page.keyboard.press('ArrowRight')
	expect(await pointers(page, 'linked-list')).toEqual(['curr@#null', 'prev@n1'])
	await page.keyboard.press('Escape')
	await hoverNode(page, 'n1')
	await page.getByTestId('remove-node-n1').click()
	expect(await pointers(page, 'linked-list')).toEqual(['curr@#null'])
})

test('graph pointers step to neighbours and are exported', async ({ page }) => {
	await sketchGraph(page, [300, 200], 6)
	await pointerMenu(page, [300, 200], 'u')
	expect(await pointers(page, 'graph')).toEqual(['u@v0'])
	await page.getByTestId('pointer-u').click()
	await page.keyboard.press('ArrowRight')
	// v1 sits right of v0, and every sketch joins them.
	expect(await pointers(page, 'graph')).toEqual(['u@v1'])
	const svg = await withEditor(page, async (e) => (await e.getSvgString([...e.getCurrentPageShapeIds()]))?.svg ?? '')
	expect(svg).toContain('data-pointer="u"')
})
