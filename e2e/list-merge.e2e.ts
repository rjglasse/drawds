import { expect, test, type Page } from '@playwright/test'
import { nodeScreenPosition, open, rightClick, sketchList, withEditor } from './helpers'

// Merging two sorted lists, step by step (dds-55z.20.9): merge(a, b) with a dummy node and a tail
// pointer re-points arrows; the other list is drawn by the steps (hidden meanwhile) and goes with the result.

const lists = (page: Page) =>
	withEditor(page, (editor) =>
		editor
			.getCurrentPageShapes()
			.filter((s) => s.type === 'linked-list')
			.map((s) => (s.props as { nodes: { value: string }[] }).nodes.map((n) => n.value).join(' '))
	)

async function twoLists(page: Page, b: string[]) {
	await sketchList(page, [200, 200], 3)
	await sketchList(page, [200, 420], b.length)
	await page.evaluate(
		([a, b]) => {
			const editor = window.editor!
			const [x, y] = editor.getCurrentPageShapes()
			for (const [s, values] of [[x, a], [y, b]] as const) {
				const nodes = (s.props as { nodes: { value: string }[] }).nodes.map((n, i) => ({ ...n, value: values[i] }))
				editor.updateShape({ id: s.id, type: 'linked-list', props: { nodes } } as never)
			}
			editor.select(x.id)
		},
		[['1', '4', '7'], b]
	)
}

async function openSteps(page: Page) {
	await rightClick(page, await nodeScreenPosition(page, 'n1'))
	await page.getByTestId('context-menu-sub.drawds-list-steps-button').click()
}

test.beforeEach(({ page }) => open(page))

test('merge with another sorted list: re-pointed step by step, the other list merged in and gone; one undo', async ({ page }) => {
	await twoLists(page, ['2', '3', '9'])
	await openSteps(page)
	await expect(page.getByTestId('context-menu.list-merge')).toHaveText('Merge with the sorted list 2 → 3 → 9')
	await page.getByTestId('context-menu.list-merge').click()
	await expect(page.getByTestId('play-caption')).toContainText('dummy = a new node, tail = dummy')
	// The other list is drawn by the steps, not by itself.
	const other = await withEditor(page, (editor) => editor.getCurrentPageShapes()[1].id)
	await expect(page.locator(`[data-shape-id="${other}"] svg`)).toHaveCount(0)
	await page.keyboard.press('ArrowRight')
	await expect(page.getByTestId('play-caption')).toContainText('a.value 1 ≤ b.value 2')
	// Enter: the result in, and the bar goes.
	await page.keyboard.press('Enter')
	await expect.poll(() => lists(page)).toEqual(['1 2 3 4 7 9'])
	await page.keyboard.press('ControlOrMeta+z')
	await expect.poll(() => lists(page)).toEqual(['1 4 7', '2 3 9'])
})

test('Esc on the way changes nothing: both lists as they were, the other drawn again', async ({ page }) => {
	await twoLists(page, ['2', '3', '9'])
	await openSteps(page)
	await page.getByTestId('context-menu.list-merge').click()
	await page.keyboard.press('ArrowRight')
	await page.keyboard.press('ArrowRight')
	await page.keyboard.press('Escape')
	await expect(page.getByTestId('play-caption')).toHaveCount(0)
	expect(await lists(page)).toEqual(['1 4 7', '2 3 9'])
	const other = await withEditor(page, (editor) => editor.getCurrentPageShapes()[1].id)
	await expect(page.locator(`[data-shape-id="${other}"] svg`).first()).toBeVisible()
})

test('no merge with a list that is not sorted', async ({ page }) => {
	await twoLists(page, ['9', '3', '2'])
	await openSteps(page)
	await expect(page.getByTestId('context-menu.list-find-value')).toBeVisible()
	await expect(page.getByTestId('context-menu.list-merge')).toHaveCount(0)
})

test('merge sort on a list: cut at the middle, each half sorted, merged back; one undo', async ({ page }) => {
	await sketchList(page, [200, 200], 6)
	await page.evaluate(() => {
		const editor = window.editor!
		const [s] = editor.getCurrentPageShapes()
		const nodes = (s.props as { nodes: { value: string }[] }).nodes.map((n, i) => ({ ...n, value: ['7', '3', '9', '1', '6', '4'][i] }))
		editor.updateShape({ id: s.id, type: 'linked-list', props: { nodes } } as never)
		editor.select(s.id)
	})
	await openSteps(page)
	await page.getByTestId('context-menu.list-merge-sort').click()
	await expect(page.getByTestId('play-caption')).toContainText('merge_sort(7 3 9 1 6 4): slow and fast walk')
	await page.keyboard.press('ArrowRight')
	await expect(page.getByTestId('play-caption')).toContainText('cut in two, 7 3 9 and 1 6 4')
	await page.keyboard.press('Enter')
	await expect.poll(() => lists(page)).toEqual(['1 3 4 6 7 9'])
	await page.keyboard.press('ControlOrMeta+z')
	await expect.poll(() => lists(page)).toEqual(['7 3 9 1 6 4'])
})
