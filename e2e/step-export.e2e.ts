import { expect, test, type Page } from '@playwright/test'
import { insertKey, nodeScreenPosition, open, rightClick, sketchGraph, sketchTree, withEditor } from './helpers'

const counter = (page: Page) => page.getByTestId('play-counter')

/** A BST 50 / 30 70 / 20 40 60 80, then insert 45: three steps, and 45 hangs under 40. */
async function insert45(page: Page) {
	await page.keyboard.press('Shift+T')
	await page.getByTestId('style.tree-kind.bst').click()
	await sketchTree(page, [500, 150], 3, 1)
	await withEditor(page, (e) => {
		const s = e.getOnlySelectedShape()!
		const n = (id: string, value: string, l: string | null, r: string | null) => ({ id, value, children: [l, r], dx: 0, dy: 0 })
		e.updateShape({
			id: s.id,
			type: s.type,
			props: { nodes: [n('n', '50', 'nL', 'nR'), n('nL', '30', 'nLL', 'nLR'), n('nR', '70', 'nRL', 'nRR'), n('nLL', '20', null, null), n('nLR', '40', null, null), n('nRL', '60', null, null), n('nRR', '80', null, null)] },
		} as never)
	})
	await insertKey(page, '45')
	await expect(counter(page)).toHaveText('1/3')
}

/** Nodes (circles) the selected tree draws at the step on screen. */
const shownNodes = (page: Page) =>
	withEditor(page, (e) => {
		const s = e.getOnlySelectedShape()!
		const util = e.getShapeUtil(s) as unknown as { displayScene(s: unknown): { nodes: { kind: string; value: string }[] } }
		return util
			.displayScene(s)
			.nodes.filter((n) => n.kind === 'circle')
			.map((n) => n.value)
	})

test.beforeEach(({ page }) => open(page))

test('every step as an image, named by its caption, all one size; the last shows the result', async ({ page }) => {
	await insert45(page)
	const images = await page.evaluate(() => window.drawdsSteps!({ format: 'svg' }))
	expect(images.map((i) => i.name)).toEqual(['01-45-50-go-left.svg', '02-45-30-go-right.svg', '03-45-40-which-has-no-right-child-45-goes-there.svg'])
	expect(new Set(images.map((i) => `${i.width}x${i.height}`)).size).toBe(1)
	const svgs = images.map((i) => atob(i.base64))
	// Each draws its step's caption and number; the result is in for the last.
	expect(svgs[0]).toContain('45 &lt; 50: go left')
	expect(svgs[0]).toContain('Step 1 of 3')
	expect(svgs[0]).not.toContain('>45<')
	expect(svgs[2]).toContain('>45<')
	// Exporting put the result in, and came back to the step it was on.
	await expect(page.getByTestId('play-done')).toBeVisible()
	await expect(counter(page)).toHaveText('1/3')
	// Captions can be left out (for the slide's own text).
	const bare = await page.evaluate(() => window.drawdsSteps!({ format: 'svg', captions: false }))
	expect(atob(bare[0].base64)).not.toContain('go left')
})

test('once the result is in, stepping back shows the structure as it was at that step', async ({ page }) => {
	await insert45(page)
	expect(await shownNodes(page)).toHaveLength(7)
	await page.keyboard.press('ArrowRight')
	await page.keyboard.press('ArrowRight')
	await page.keyboard.press('ArrowRight')
	await expect(page.getByTestId('play-done')).toBeVisible()
	expect(await shownNodes(page)).toContain('45')
	await page.keyboard.press('ArrowLeft')
	await page.keyboard.press('ArrowLeft')
	await expect(counter(page)).toHaveText('1/3')
	expect(await shownNodes(page)).not.toContain('45')
})

test("the play bar's export saves the steps into a folder", async ({ page }) => {
	await page.evaluate(() => {
		const saved: string[] = []
		;(window as unknown as { saved: string[] }).saved = saved
		;(window as unknown as { showDirectoryPicker: unknown }).showDirectoryPicker = async () => ({
			getFileHandle: async (name: string) => ({
				createWritable: async () => ({ write: async () => void saved.push(name), close: async () => {} }),
			}),
		})
	})
	await insert45(page)
	await page.getByTestId('play-export').click()
	await expect.poll(() => page.evaluate(() => (window as unknown as { saved: string[] }).saved)).toHaveLength(3)
	expect(await page.evaluate(() => (window as unknown as { saved: string[] }).saved[0])).toBe('01-45-50-go-left.png')
})

test("a graph's steps take its views along: Kruskal's union-find in every image", async ({ page }) => {
	await sketchGraph(page, [300, 200], 4, 4)
	await rightClick(page, await nodeScreenPosition(page, 'v0'))
	await page.getByTestId('context-menu-sub.drawds-graph-steps-button').click()
	await page.getByTestId('context-menu.graph-kruskal').click()
	const images = await page.evaluate(() => window.drawdsSteps!({ format: 'svg' }))
	expect(images.length).toBeGreaterThan(2)
	// The view's row titles are in every step.
	for (const image of images) expect(atob(image.base64)).toContain('>parent<')
})
