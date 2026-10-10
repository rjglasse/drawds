import { expect, test, type Page } from '@playwright/test'
import type { HashShapeProps } from '../src/shapes/hash/hash-shape-types'
import { CELL, hoverNode, nodeScreenPosition, open, rightClick, shapesOfType } from './helpers'

const table = async (page: Page) => (await shapesOfType<HashShapeProps>(page, 'hash-table'))[0].props
const keys = async (page: Page) => (await table(page)).buckets.flat().filter((k) => !k.startsWith('\u0000')).sort()
const caption = (page: Page) => page.getByTestId('play-caption')

/** Shift+B, then drag down so the table has `m` buckets, the first under (x, y). */
async function sketchTable(page: Page, [x, y]: [number, number], m: number) {
	await page.keyboard.press('Shift+B')
	await page.mouse.move(x, y)
	await page.mouse.down()
	await page.mouse.move(x, y + (m - 1) * CELL + 10, { steps: 20 })
	await page.mouse.up()
}

/** Replace the table's contents. */
async function setBuckets(page: Page, buckets: string[][]) {
	await page.evaluate((buckets) => {
		const editor = window.editor!
		const shape = editor.getCurrentPageShapes().find((s) => s.type === 'hash-table')!
		editor.updateShape({ id: shape.id, type: 'hash-table', props: { buckets } } as never)
	}, buckets)
}

async function stepToEnd(page: Page) {
	while (!(await page.getByTestId('play-done').count())) await page.keyboard.press('ArrowRight')
}

test.beforeEach(({ page }) => open(page))

test('sketch a table of m buckets; insert a key: it lands in bucket key mod m', async ({ page }) => {
	await sketchTable(page, [200, 150], 7)
	const props = await table(page)
	expect(props.buckets).toHaveLength(7)
	expect(props.strategy).toBe('chaining')
	await setBuckets(page, [[], ['8'], [], [], [], [], []])
	await page.getByTestId('insert-key').click()
	await page.getByTestId('key-prompt').fill('22')
	await page.keyboard.press('Enter')
	await expect(caption(page)).toHaveText("Insert 22: h(22) = 22 mod 7 = 1: walk bucket 1's chain")
	await stepToEnd(page)
	await page.keyboard.press('Enter')
	expect((await table(page)).buckets[1]).toEqual(['8', '22'])
})

test('linear probing: switching keeps the keys; deleting leaves a marker a find goes past', async ({ page }) => {
	await sketchTable(page, [200, 150], 7)
	await setBuckets(page, [[], ['8', '15', '22'], [], [], [], [], []])
	await page.getByTestId('style.hash-strategy.probing').click()
	const props = await table(page)
	expect(props.strategy).toBe('probing')
	expect(props.buckets.slice(1, 4)).toEqual([['8'], ['15'], ['22']])
	await hoverNode(page, 's1')
	await page.getByTestId('remove-node-s1').click()
	await stepToEnd(page)
	await expect(caption(page)).toContainText('Mark slot 1 deleted, not empty')
	await page.keyboard.press('Enter')
	expect(await keys(page)).toEqual(['15', '22'])
	await rightClick(page, await nodeScreenPosition(page, 's3'))
	await page.getByTestId('context-menu-sub.drawds-hash-steps-button').click()
	await page.getByTestId('context-menu.hash-find').click()
	await expect(caption(page)).toContainText('a deleted marker: 22 may be further on, keep looking')
	await stepToEnd(page)
	await expect(caption(page)).toHaveText('22 found after 3 comparisons')
})

test('a key typed into the wrong slot gets the red ring', async ({ page }) => {
	await sketchTable(page, [200, 150], 5)
	await page.getByTestId('style.hash-strategy.probing').click()
	await setBuckets(page, [[], [], [], [], []])
	await page.mouse.dblclick(...(await nodeScreenPosition(page, 's3')))
	await page.keyboard.type('6')
	await page.keyboard.press('Enter')
	// 6 mod 5 = 1, and slot 1 is empty: a find would stop there.
	await expect(page.locator('[data-warning]')).toHaveAttribute('data-warning', 's3')
})

test('grow and rehash: every key moves to its place in a bigger table', async ({ page }) => {
	await sketchTable(page, [200, 150], 5)
	await setBuckets(page, [['10', '5'], ['6'], [], [], []])
	await rightClick(page, await nodeScreenPosition(page, 'k:6'))
	await page.getByTestId('context-menu-sub.drawds-hash-steps-button').click()
	await page.getByTestId('context-menu.hash-rehash').click()
	await expect(caption(page)).toContainText('A new table of 11 buckets')
	await stepToEnd(page)
	await page.keyboard.press('Enter')
	const props = await table(page)
	expect(props.buckets).toHaveLength(11)
	expect([props.buckets[10], props.buckets[5], props.buckets[6]]).toEqual([['10'], ['5'], ['6']])
})

/** Insert a key from the + by the load factor, played to the end and kept. */
async function insert(page: Page, key: string) {
	await page.getByTestId('insert-key').click()
	await page.getByTestId('key-prompt').fill(key)
	await page.keyboard.press('Enter')
	await stepToEnd(page)
}

test("lecture 7's class exercise: the first three letters, A = 1, added; KIM and a classmate's 33 collide", async ({ page }) => {
	await sketchTable(page, [200, 150], 7)
	await setBuckets(page, [[], [], [], [], [], [], []])
	await page.getByTestId('style.hash-code.letters').click()
	expect((await table(page)).code).toBe('letters')
	await insert(page, 'Kim')
	await page.keyboard.press('Enter')
	await page.getByTestId('insert-key').click()
	await page.getByTestId('key-prompt').fill('Lok')
	await page.keyboard.press('Enter')
	await expect(caption(page)).toHaveText('Insert Lok: h(Lok) = L + O + K = 12 + 15 + 11 = 38, then 38 mod 7 = 3: bucket 3, which is empty')
	await stepToEnd(page)
	await page.keyboard.press('Enter')
	expect((await table(page)).buckets[5]).toEqual(['Kim'])
})

test('the Bus Map, direct addressing: routes 1, 2, 3 at their own indexes; 256 would waste space, X70 is no index', async ({ page }) => {
	await sketchTable(page, [200, 150], 5)
	await setBuckets(page, [['1'], ['2'], ['3'], [], []])
	await page.getByTestId('style.hash-code.direct').click()
	// The key is the index: the table is rebuilt that way (no compression to choose).
	expect((await table(page)).buckets.map((b) => b.join())).toEqual(['', '1', '2', '3', ''])
	await expect(page.getByTestId('style.hash-compress.mod')).toHaveCount(0)
	await page.getByTestId('insert-key').click()
	await page.getByTestId('key-prompt').fill('256')
	await page.keyboard.press('Enter')
	await expect(caption(page)).toContainText('it would need 257 slots, most of them empty. Direct addressing wastes space')
	await page.keyboard.press('Escape')
	await page.getByTestId('insert-key').click()
	await page.getByTestId('key-prompt').fill('X70')
	await page.keyboard.press('Enter')
	await expect(caption(page)).toContainText("X70 isn't a whole number, so it can't be an index")
	await page.keyboard.press('Escape')
	expect(await keys(page)).toEqual(['1', '2', '3'])
})
