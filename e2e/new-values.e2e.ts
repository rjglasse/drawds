import { expect, test, type Page } from '@playwright/test'
import { nodeScreenPosition, open, rightClick, shapesOfType, sketchGraph, sketchHashTable, sketchHeap, sketchList, sketchTree } from './helpers'

// New values on every structure that has random ones: the same structure with values drawn from a new
// seed, still what it was (a BST in order, a heap a heap), one undo step.

type Props = Record<string, unknown> & { seed: number }
const props = async (page: Page, type: string) => (await shapesOfType<Props>(page, type))[0].props

/** Right-click the structure at `at` and pick `<menuId>`'s item `id` from its own submenu. */
async function action(page: Page, at: [number, number], menuId: string, id: string) {
	await rightClick(page, at)
	await page.getByTestId(`context-menu-sub.drawds-${menuId}-actions-button`).click()
	await page.getByTestId(`context-menu.${id}`).click()
}

/** The shape of a type, made from props as given and selected. */
async function make(page: Page, type: string, given: object) {
	await page.evaluate(
		({ type, given }) => {
			const editor = window.editor!
			editor.createShape({ type, x: 300, y: 200, props: given } as never)
			editor.select(editor.getCurrentPageShapes().at(-1)!.id)
		},
		{ type, given }
	)
}

test.beforeEach(({ page }) => open(page))

test('a list, a BST and a heap get new values and stay what they are; one undo puts the old ones back', async ({ page }) => {
	await sketchList(page, [200, 150], 4)
	const list = await props(page, 'linked-list')
	await action(page, await nodeScreenPosition(page, 'n0'), 'list', 'list-reroll')
	const listed = await props(page, 'linked-list')
	expect(listed.seed).not.toBe(list.seed)
	expect((listed.nodes as { id: string }[]).map((n) => n.id)).toEqual((list.nodes as { id: string }[]).map((n) => n.id))
	expect(listed.nodes).not.toEqual(list.nodes)
	await page.keyboard.press('ControlOrMeta+z')
	expect((await props(page, 'linked-list')).nodes).toEqual(list.nodes)

	// Nothing selected, so the kind picked goes to the next tree.
	await page.evaluate(() => void window.editor!.selectNone())
	await page.keyboard.press('Shift+T')
	await page.getByTestId('style.tree-kind.bst').click()
	expect(await page.evaluate(() => window.editor!.getStyleForNextShape({ id: 'drawds:tree-kind' } as never))).toBe('bst')
	await sketchTree(page, [600, 170], 3, 1)
	await action(page, await nodeScreenPosition(page, 'n'), 'tree', 'tree-reroll')
	const keys = (await page.evaluate(() => {
		const editor = window.editor!
		const tree = editor.getCurrentPageShapes().find((s) => s.type === 'binary-tree')!.props as { nodes: { id: string; value: string; children: (string | null)[] }[] }
		const byId = new Map(tree.nodes.map((n) => [n.id, n]))
		const out: string[] = []
		const walk = (id: string | null) => {
			if (!id) return
			const n = byId.get(id)!
			walk(n.children[0])
			out.push(n.value)
			walk(n.children[1])
		}
		walk(tree.nodes[0].id)
		return out
	})).map(Number)
	expect(keys).toEqual([...keys].sort((a, b) => a - b))

	await sketchHeap(page, [300, 450], 7)
	const heap = await props(page, 'heap')
	await action(page, await nodeScreenPosition(page, '0'), 'heap', 'heap-reroll')
	const values = ((await props(page, 'heap')).values as string[]).map(Number)
	expect(values).not.toEqual((heap.values as string[]).map(Number))
	for (let i = 1; i < values.length; i++) expect(values[Math.floor((i - 1) / 2)]).toBeLessThanOrEqual(values[i])
})

test('a trie gets as many new words; a weighted graph new weights on the same edges', async ({ page }) => {
	await make(page, 'trie', {})
	await page.evaluate(() => {
		const editor = window.editor!
		const trie = editor.getCurrentPageShapes().find((s) => s.type === 'trie')!
		const util = editor.getShapeUtil(trie) as unknown as { redraw(s: unknown): { props: object } }
		editor.updateShape({ id: trie.id, type: 'trie', props: { ...util.redraw({ ...trie, props: { ...trie.props, seed: 7 } }).props, seed: 7 } } as never)
	})
	const words = async () =>
		page.evaluate(() => {
			const trie = window.editor!.getCurrentPageShapes().find((s) => s.type === 'trie')!.props as { nodes: { value: string }[] }
			return trie.nodes.map((n) => n.value).filter(Boolean)
		})
	const before = await words()
	await action(page, await nodeScreenPosition(page, '^'), 'trie', 'trie-reroll')
	const after = await words()
	expect(after).toHaveLength(before.length)
	expect(after).not.toEqual(before)

	await sketchGraph(page, [300, 500], 4)
	await page.getByTestId('style.graph-weights.weighted').click()
	const graph = await props(page, 'graph')
	await action(page, await nodeScreenPosition(page, 'v0'), 'graph', 'graph-reweigh')
	const reweighed = await props(page, 'graph')
	type Edge = { id: string; from: string; to: string; weight: string }
	const ends = (edges: Edge[]) => edges.map((e) => `${e.from}-${e.to}`)
	expect(ends(reweighed.edges as Edge[])).toEqual(ends(graph.edges as Edge[]))
	expect(reweighed.seed).not.toBe(graph.seed)
})

test("a hash table's Pointer menu offers the names its code uses", async ({ page }) => {
	await sketchHashTable(page, [200, 150], 7)
	await page.evaluate(() => {
		const editor = window.editor!
		const table = editor.getCurrentPageShapes().find((s) => s.type === 'hash-table')!
		editor.updateShape({ id: table.id, type: 'hash-table', props: { buckets: [[], ['8'], [], [], [], [], []] } } as never)
	})
	await rightClick(page, await nodeScreenPosition(page, 'k:8'))
	await page.getByTestId('context-menu-sub.drawds-pointer-button').click()
	await expect(page.getByTestId('context-menu.pointer-x')).toBeVisible()
	await expect(page.getByTestId('context-menu.pointer-i')).toBeVisible()
})
