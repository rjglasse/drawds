import { expect, test, type Page } from '@playwright/test'
import type { TrieShapeProps } from '../src/shapes/trie/trie-shape-types'
import { CELL, hoverNode, nodeScreenPosition, open, rightClick, shapesOfType, withEditor } from './helpers'

const trie = async (page: Page) => (await shapesOfType<TrieShapeProps>(page, 'trie'))[0]?.props
const words = async (page: Page) => (await trie(page)).nodes.filter((n) => n.value).map((n) => n.value).sort()

/** Sketch a trie of `n` words, the root on `at`. */
async function sketchTrie(page: Page, [x, y]: [number, number], n: number) {
	await page.keyboard.press('Shift+W')
	await page.mouse.move(x, y)
	await page.mouse.down()
	await page.mouse.move(x + (n - 1) * CELL, y, { steps: 20 })
	await page.mouse.up()
}

/** A trie of these words, put straight in (as the sketch would, its root where it was). */
const setWords = (page: Page, list: string[]) =>
	page.evaluate((list) => {
		const editor = window.editor!
		const s = editor.getOnlySelectedShape()!
		const nodes = new Map<string, { id: string; value: string; children: string[]; dx: number; dy: number }>([['^', { id: '^', value: '', children: [], dx: 0, dy: 0 }]])
		for (const w of list)
			for (let i = 1; i <= w.length; i++) {
				const id = `^${w.slice(0, i)}`
				if (!nodes.has(id)) {
					nodes.set(id, { id, value: '', children: [], dx: 0, dy: 0 })
					const parent = nodes.get(`^${w.slice(0, i - 1)}`)!
					parent.children = [...parent.children, id].sort()
				}
				if (i === w.length) nodes.get(id)!.value = w
			}
		void editor.updateShape({ id: s.id, type: 'trie', props: { nodes: [...nodes.values()] } })
	}, list)

async function finish(page: Page) {
	for (let i = 0; i < 30 && !(await page.getByTestId('play-done').isVisible()); i++) await page.keyboard.press('ArrowRight')
}

test.beforeEach(({ page }) => open(page))

test('Shift+W: drag right and a word goes in every cell, the root under the press', async ({ page }) => {
	await sketchTrie(page, [500, 150], 5)
	expect(await words(page)).toHaveLength(5)
	expect(await nodeScreenPosition(page, '^')).toEqual([500, 150])
	// Every edge spells a letter: a node's id is its prefix.
	const { nodes } = await trie(page)
	for (const n of nodes) for (const c of n.children) expect(c!.slice(0, -1)).toBe(n.id)
})

test('insert by the + above the root, step by step; delete by x on a word, pruning; one undo each', async ({ page }) => {
	await sketchTrie(page, [500, 150], 1)
	await setWords(page, ['tea', 'ten', 'to'])
	await page.getByTestId('insert-key').click()
	await page.keyboard.type('tent')
	await page.keyboard.press('Enter')
	await expect(page.getByTestId('play-bar')).toBeVisible()
	await finish(page)
	await expect(page.getByTestId('play-caption')).toHaveText('The word ends here: mark it (isWord = true): "tent" is in the trie')
	await page.keyboard.press('Enter')
	expect(await words(page)).toEqual(['tea', 'ten', 'tent', 'to'])

	await hoverNode(page, '^tea')
	await page.getByTestId('remove-node-^tea').click()
	await finish(page)
	await page.keyboard.press('Enter')
	expect(await words(page)).toEqual(['ten', 'tent', 'to'])
	expect((await trie(page)).nodes.some((n) => n.id === '^tea')).toBe(false)
	await page.keyboard.press('ControlOrMeta+z')
	expect(await words(page)).toEqual(['tea', 'ten', 'tent', 'to'])
})

test('a node\'s menu: the words starting with its prefix, in order, as a strip', async ({ page }) => {
	await sketchTrie(page, [500, 150], 1)
	await setWords(page, ['ten', 'tea', 'to', 'ted'])
	await rightClick(page, await nodeScreenPosition(page, '^te'))
	await page.getByTestId('context-menu-sub.drawds-trie-steps-button').click()
	await page.getByTestId('context-menu.trie-prefix-this').click()
	await finish(page)
	await expect(page.getByTestId('play-caption')).toHaveText('3 words starting "te", in order: tea, ted, ten')
	await expect(page.getByTestId('playback-strip')).toContainText('tea')
	// Nothing changed.
	await page.keyboard.press('Enter')
	expect(await words(page)).toEqual(['tea', 'ted', 'ten', 'to'])
	expect(await withEditor(page, (editor) => editor.getCurrentPageShapes().length)).toBe(1)
})

test('the code beside it: a Trie of its words, then each insert and delete as a call', async ({ page }) => {
	await sketchTrie(page, [500, 150], 1)
	await setWords(page, ['tea', 'ten'])
	await rightClick(page, await nodeScreenPosition(page, '^'))
	await page.getByTestId('context-menu-sub.drawds-trie-show-button').click()
	await page.getByTestId('context-menu.trie-code-beside').click()
	await withEditor(page, (editor) => {
		const box = editor.getCurrentPageShapes().find((s) => s.type === 'code')!
		void editor.updateShape({ id: box.id, type: 'code', props: { language: 'python' } })
		void editor.select(editor.getCurrentPageShapes().find((s) => s.type === 'trie')!.id)
	})
	const lines = () => page.locator('[data-shape-type="code"] [data-code-line]').allTextContents()
	// Made by the sketch, then the words put straight in: read as inserts (and the sketch's word deleted).
	await expect.poll(async () => (await lines())[0]).toMatch(/^a = Trie\(\["[a-z]+"\]\)$/)
	await expect.poll(lines).toContain('a.insert("tea")')
	await page.getByTestId('insert-key').click()
	await page.keyboard.type('to')
	await page.keyboard.press('Enter')
	await page.keyboard.press('Enter')
	await expect.poll(async () => (await lines()).at(-1)).toBe('a.insert("to")')
})
