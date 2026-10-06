import { expect, test, type Page } from '@playwright/test'
import type { ListShapeProps } from '../src/shapes/list/list-shape-types'
import { nodeScreenPosition, open, rightClick, shapesOfType, sketchList, withEditor } from './helpers'

const list = async (page: Page) => (await shapesOfType<ListShapeProps>(page, 'linked-list'))[0].props
const toggle = (page: Page, id: string) => page.getByTestId(`style.list-variant.${id}`).click()
const sceneKeys = (page: Page) =>
	withEditor(page, (editor) => {
		const s = editor.getOnlySelectedShape()!
		const u = editor.getShapeUtil(s) as unknown as { getScene(x: unknown): { nodes: { key: string }[] } }
		return u.getScene(s).nodes.map((n) => n.key)
	})

test.beforeEach(({ page }) => open(page))

test('each variant toggles on the selected list, combinable, values kept', async ({ page }) => {
	await sketchList(page, [200, 200], 3)
	const before = (await list(page)).nodes.map((n) => n.value)
	for (const id of ['doubly', 'tail', 'circular', 'sentinel']) await toggle(page, id)
	const p = await list(page)
	expect(p).toMatchObject({ links: 'doubly', tail: 'tail', ends: 'circular', sentinel: 'sentinel' })
	expect(p.nodes.map((n) => n.value)).toEqual(before)
	const keys = await sceneKeys(page)
	expect(keys).toContain('#sentinel')
	expect(keys).toContain('#tail')
	expect(keys).not.toContain('#null')
	await toggle(page, 'circular')
	expect(await sceneKeys(page)).toContain('#null')
	// One undo per toggle.
	await page.keyboard.press('ControlOrMeta+z')
	expect((await list(page)).ends).toBe('circular')
})

test('switching variants keeps the head node where it was on the page', async ({ page }) => {
	await sketchList(page, [300, 250], 3)
	const head = await nodeScreenPosition(page, 'n0')
	for (const id of ['sentinel', 'doubly', 'circular']) {
		await toggle(page, id)
		const now = await nodeScreenPosition(page, 'n0')
		expect(Math.abs(now[0] - head[0])).toBeLessThan(1)
		expect(Math.abs(now[1] - head[1])).toBeLessThan(1)
	}
})

test('values still edit on a doubly linked list (the value sits between the two pointers)', async ({ page }) => {
	await sketchList(page, [300, 250], 2)
	await toggle(page, 'doubly')
	await page.mouse.dblclick(...(await nodeScreenPosition(page, 'n0')))
	await expect(page.locator('input[aria-label="Cell n0"]')).toBeFocused()
	await page.keyboard.type('42')
	await page.keyboard.press('Enter')
	expect((await list(page)).nodes[0].value).toBe('42')
})

test('new lists take the variants picked with the list tool', async ({ page }) => {
	await page.keyboard.press('Shift+N')
	await toggle(page, 'circular')
	await sketchList(page, [300, 250], 2)
	expect((await list(page)).ends).toBe('circular')
})

test('make a cycle into a node from its menu, then remove it; one undo each', async ({ page }) => {
	await sketchList(page, [150, 200], 5)
	const menu = async (key: string, item: string) => {
		await rightClick(page, await nodeScreenPosition(page, key))
		await page.getByTestId('context-menu-sub.drawds-list-actions-button').click()
		await page.getByTestId(`context-menu.${item}`).click()
	}
	await menu('n2', 'list-make-cycle')
	expect((await list(page)).cycleTo).toBe('n2')
	expect(await sceneKeys(page)).not.toContain('#null')
	const loop = await withEditor(page, (editor) => {
		const s = editor.getOnlySelectedShape()!
		const u = editor.getShapeUtil(s) as unknown as { getScene(x: unknown): { edges: { key: string; to: string; via?: unknown[] }[] } }
		return u.getScene(s).edges.find((e) => e.key === 'n4->')
	})
	expect(loop).toMatchObject({ to: 'n2', via: expect.any(Array) })
	await menu('n0', 'list-remove-cycle')
	expect((await list(page)).cycleTo).toBe('')
	expect(await sceneKeys(page)).toContain('#null')
	await page.keyboard.press('ControlOrMeta+z')
	expect((await list(page)).cycleTo).toBe('n2')
	await page.keyboard.press('ControlOrMeta+z')
	expect((await list(page)).cycleTo).toBe('')
})
