import { expect, test, type Page } from '@playwright/test'
import { nodeScreenPosition, open, rightClick, sketchArray, sketchList, withEditor } from './helpers'

// A structure in memory (lecture 5, Show > In memory): an array as one block of cells, a list's nodes
// wherever there is room, the pointers chased between them; other data as busy as the style panel says.

const views = (page: Page) => withEditor(page, (editor) => editor.getCurrentPageShapes().filter((s) => s.type === 'memory-view').length)
const legend = (page: Page) => page.locator('[data-memory-line]').allTextContents()
/** Where each block (the array, each node) starts in the grid: its first outline's corner. */
const blocks = (page: Page) =>
	page.locator('[data-memory-block]').evaluateAll((rects) => {
		const at: Record<string, string> = {}
		for (const r of rects) at[r.getAttribute('data-memory-block')!] ??= `${r.getAttribute('x')},${r.getAttribute('y')}`
		return at
	})

async function show(page: Page, at: [number, number], menu: 'array' | 'list', item: string) {
	await rightClick(page, at)
	await page.getByTestId(`context-menu-sub.drawds-${menu}-show-button`).click()
	await page.getByTestId(`context-menu.${item}`).click()
}

test.beforeEach(({ page }) => open(page))

test('an array in memory: one block of cells, a[i] at its start + i; crowded memory has no room for it', async ({ page }) => {
	await sketchArray(page, [200, 150], 5)
	await show(page, [200, 150], 'array', 'array-memory')
	await expect.poll(() => views(page)).toBe(1)
	const values = await withEditor(page, (editor) => (editor.getCurrentPageShapes()[0].props as { values: string[] }).values)
	expect((await legend(page))[0]).toMatch(/^a = (0x[0-9A-F]+): a\[i\] at \1 \+ i$/)
	// Its values in five cells side by side, from the address the legend names.
	const start = parseInt((await legend(page))[0].split(' ')[2], 16)
	const cells = await page.locator('[data-memory-cell]').evaluateAll((els) => els.map((e) => [Number(e.getAttribute('data-memory-cell')), e.textContent]))
	expect(cells).toEqual(values.map((v, i) => [start + i, v]))

	// Crowded memory (the style panel, the view selected): no five free cells side by side.
	await withEditor(page, (editor) => void editor.select(editor.getCurrentPageShapes().find((s) => s.type === 'memory-view')!.id))
	await page.getByTestId('style.memory-busy.crowded').click()
	await expect.poll(() => legend(page)).toEqual(['No room for a: no 5 free cells side by side,', 'and an array needs its cells together'])
	expect(await page.locator('[data-memory-cell]').count()).toBe(0)

	// The menu takes it away; undo brings it back.
	await page.keyboard.press('Escape')
	await show(page, [200, 150], 'array', 'array-memory')
	await expect.poll(() => views(page)).toBe(0)
	await page.keyboard.press('ControlOrMeta+z')
	await expect.poll(() => views(page)).toBe(1)
})

test('a list in memory: nodes wherever there is room, next addresses chased; a new head moves no node; it goes with the list', async ({ page }) => {
	await sketchList(page, [200, 200], 3)
	await show(page, await nodeScreenPosition(page, 'n1'), 'list', 'list-memory')
	await expect.poll(() => views(page)).toBe(1)
	const before = await blocks(page)
	expect(Object.keys(before).sort()).toEqual(['n0', 'n1', 'n2'])
	expect(await page.locator('[data-memory-arrow]').count()).toBe(2)
	expect((await legend(page))[0]).toMatch(/^head = 0x[0-9A-F]+$/)

	// A node put in at the head: the others stay where they are in memory.
	await withEditor(page, (editor) => {
		const list = editor.getCurrentPageShapes().find((s) => s.type === 'linked-list')!
		const { nodes } = list.props as { nodes: { id: string }[] }
		editor.updateShape({ id: list.id, type: 'linked-list', props: { nodes: [{ id: 'n9', value: '7', dx: 0, dy: 0 }, ...nodes] } } as never)
	})
	await expect.poll(async () => Object.keys(await blocks(page)).length).toBe(4)
	const after = await blocks(page)
	expect({ n0: after.n0, n1: after.n1, n2: after.n2 }).toEqual(before)
	expect(await page.locator('[data-memory-arrow]').count()).toBe(3)

	// Deleting the list takes its memory with it.
	await withEditor(page, (editor) => void editor.deleteShapes([editor.getCurrentPageShapes().find((s) => s.type === 'linked-list')!.id]))
	await expect.poll(() => views(page)).toBe(0)
})
