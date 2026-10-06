import { expect, test, type Page } from '@playwright/test'
import type { UnionFindShapeProps } from '../src/shapes/union-find/union-find-shape-types'
import { CELL, hoverNode, nodeScreenPosition, open, rightClick, shapesOfType, withEditor } from './helpers'

const uf = async (page: Page) => (await shapesOfType<UnionFindShapeProps>(page, 'union-find'))[0].props
const caption = (page: Page) => page.getByTestId('play-caption')

/** Shift+U, then drag right: an element per cell-width, element 0 under the press. */
async function sketchUnionFind(page: Page, [x, y]: [number, number], n: number) {
	await page.keyboard.press('Shift+U')
	await page.mouse.move(x, y)
	await page.mouse.down()
	await page.mouse.move(x + (n - 1) * CELL + 10, y, { steps: 20 })
	await page.mouse.up()
}

/** 0 <- 1 <- 2 <- 3 <- 4 (a chain), and 6 under 5. */
async function chainAndPair(page: Page) {
	await withEditor(page, (e) => {
		const s = e.getOnlySelectedShape()!
		e.updateShape({ id: s.id, type: s.type, props: { parent: [0, 0, 1, 2, 3, 5, 5], sizes: [5, 1, 1, 1, 1, 2, 1], ranks: [4, 0, 0, 0, 0, 1, 0] } } as never)
	})
}

/** Right-click element `i`: Step by step > the operation (union: the other element typed in). */
async function ufOp(page: Page, i: number, item: 'uf-find' | 'uf-union', other?: string) {
	await rightClick(page, await nodeScreenPosition(page, String(i)))
	await page.getByTestId('context-menu-sub.drawds-uf-steps-button').click()
	await page.getByTestId(`context-menu.${item}`).click()
	if (other !== undefined) {
		await page.getByTestId('key-prompt').fill(other)
		await page.keyboard.press('Enter')
	}
}

async function stepToEnd(page: Page) {
	while (!(await page.getByTestId('play-done').count())) await page.keyboard.press('ArrowRight')
}

test.beforeEach(({ page }) => open(page))

test('sketch: every element in a set of its own, element 0 under the press', async ({ page }) => {
	await sketchUnionFind(page, [200, 200], 6)
	const props = await uf(page)
	expect(props.parent).toEqual([0, 1, 2, 3, 4, 5])
	expect(props.labels).toEqual(['0', '1', '2', '3', '4', '5'])
	expect((await nodeScreenPosition(page, '0')).map(Math.round)).toEqual([200, 200])
})

test('find walks up to the root, then compresses the path; one undo', async ({ page }) => {
	await sketchUnionFind(page, [200, 150], 7)
	await chainAndPair(page)
	await ufOp(page, 4, 'uf-find')
	await expect(caption(page)).toHaveText('find(4): start at 4 and follow the parent pointers up')
	await page.keyboard.press('ArrowRight')
	await expect(caption(page)).toHaveText('parent[4] = 3: 4 is not a root, so go up to 3')
	await stepToEnd(page)
	await expect(page.getByTestId('play-counts')).toHaveText('parent steps 4')
	await page.keyboard.press('Enter')
	expect((await uf(page)).parent).toEqual([0, 0, 0, 0, 0, 5, 5])
	await page.keyboard.press('ControlOrMeta+z')
	expect((await uf(page)).parent).toEqual([0, 0, 1, 2, 3, 5, 5])
	// Compression off: find only walks.
	await page.getByTestId('style.uf-compress.off').click()
	await ufOp(page, 4, 'uf-find')
	await stepToEnd(page)
	await expect(caption(page)).toHaveText('parent[0] = 0: 0 is its own parent, so it is the root')
	await page.keyboard.press('Enter')
	expect((await uf(page)).parent).toEqual([0, 0, 1, 2, 3, 5, 5])
})

test('union by size links the smaller tree under the bigger root; one set already: nothing changes', async ({ page }) => {
	await sketchUnionFind(page, [200, 150], 7)
	await chainAndPair(page)
	await page.getByTestId('style.uf-compress.off').click()
	await ufOp(page, 6, 'uf-union', '4')
	await stepToEnd(page)
	await expect(caption(page)).toHaveText("size 2 vs 5: parent[5] = 0, so 5's tree goes under 0; size[0] = 7")
	await page.keyboard.press('Enter')
	let props = await uf(page)
	expect(props.parent).toEqual([0, 0, 1, 2, 3, 0, 5])
	expect(props.sizes[0]).toBe(7)
	await ufOp(page, 6, 'uf-union', '2')
	await stepToEnd(page)
	await expect(caption(page)).toContainText('in one set already, so nothing to link')
	await page.keyboard.press('Enter')
	props = await uf(page)
	expect(props.parent).toEqual([0, 0, 1, 2, 3, 0, 5])
})

test('union by rank: a tie, and the new root ranks up', async ({ page }) => {
	await sketchUnionFind(page, [200, 150], 4)
	await page.getByTestId('style.uf-union.rank').click()
	await ufOp(page, 0, 'uf-union', '1')
	await stepToEnd(page)
	await expect(caption(page)).toHaveText("rank 0 vs 0 (a tie): parent[0] = 1, so 0's tree goes under 1; rank[1] grows to 1")
	await page.keyboard.press('Enter')
	expect(await uf(page)).toMatchObject({ parent: [1, 1, 2, 3], ranks: [0, 1, 0, 0] })
})

test('set a parent by hand (a loop is refused), name an element, add one', async ({ page }) => {
	await sketchUnionFind(page, [200, 150], 3)
	const cell = async (i: number) => {
		const at = await nodeScreenPosition(page, `p${i}`)
		await page.mouse.dblclick(...at)
	}
	await cell(2)
	await page.keyboard.press('ControlOrMeta+a')
	await page.keyboard.type('0')
	await page.keyboard.press('Enter')
	expect(await uf(page)).toMatchObject({ parent: [0, 1, 0], sizes: [2, 1, 1] })
	// 0 -> 2 would loop (2's parent is 0).
	await cell(0)
	await page.keyboard.press('ControlOrMeta+a')
	await page.keyboard.type('2')
	await page.keyboard.press('Enter')
	expect((await uf(page)).parent).toEqual([0, 1, 0])
	await page.mouse.dblclick(...(await nodeScreenPosition(page, '1')))
	await page.keyboard.press('ControlOrMeta+a')
	await page.keyboard.type('B')
	await page.keyboard.press('Enter')
	expect((await uf(page)).labels).toEqual(['0', 'B', '2'])
	await page.getByTestId('insert-key').click()
	await page.getByTestId('key-prompt').fill('D')
	await page.keyboard.press('Enter')
	expect(await uf(page)).toMatchObject({ labels: ['0', 'B', '2', 'D'], parent: [0, 1, 0, 3] })
	// Union by name: sizes 1 and 1, so D's root goes under B's.
	await ufOp(page, 3, 'uf-union', 'B')
	await stepToEnd(page)
	await page.keyboard.press('Enter')
	expect((await uf(page)).parent).toEqual([0, 1, 0, 1])
})

test('pointing at an element lights its way up', async ({ page }) => {
	await sketchUnionFind(page, [200, 150], 7)
	await chainAndPair(page)
	await hoverNode(page, '3')
	const lit = await withEditor(page, (e) => {
		const s = e.getOnlySelectedShape()!
		return (e.getShapeUtil(s) as unknown as { hoverHighlights(s: unknown, k: string): Record<string, string> }).hoverHighlights(s, '3')
	})
	expect(lit).toMatchObject({ 3: 'blue', 2: 'orange', 1: 'orange', 0: 'green', 'edge:e3': 'orange' })
})
