import { expect, test, type Page } from '@playwright/test'
import { arrayStep, CELL, connectNodes, focusedLabel, handlePosition, hoverNode, insertKey, menusClosed, nodeScreenPosition, open, rightClick, sketchArray, sketchArrayKind, sketchGraph, sketchHashTable, sketchHeap, sketchList, sketchMatrix, sketchTree, sketchUnionFind } from './helpers'

// The code beside an array: every move made on it, as code, kept in its meta so undo and redo take
// the lines with the moves.

const lines = (page: Page) => page.locator('[data-shape-type="code"] [data-code-line]').allTextContents()

async function menu(page: Page, sub: 'show' | 'actions' | 'steps', item: string) {
	await rightClick(page, [200, 200])
	await page.getByTestId(`context-menu-sub.drawds-array-${sub}-button`).click()
	if (sub === 'steps') await arrayStep(page, item)
	else await page.getByTestId(`context-menu.${item}`).click()
}

test.beforeEach(({ page }) => open(page))

test('the code beside an array: a line per move, typing one line, an operation its call; undo takes the line too', async ({ page }) => {
	await sketchArray(page, [200, 200], 4)
	await menu(page, 'show', 'array-code-beside')
	await expect.poll(() => lines(page)).toHaveLength(1)
	expect((await lines(page))[0]).toMatch(/^List<Integer> a = new ArrayList<>\(List\.of\(\d+, \d+, \d+, \d+\)\);$/)

	// Typing 4, then 42: one line.
	await page.mouse.dblclick(200, 200)
	await page.keyboard.type('42')
	await page.keyboard.press('Enter')
	await expect.poll(() => lines(page)).toHaveLength(2)
	expect((await lines(page))[1]).toBe('a.set(0, 42);')

	await menu(page, 'actions', 'array-reverse')
	await expect.poll(() => lines(page)).toHaveLength(3)
	expect((await lines(page))[2]).toBe('Collections.reverse(a);')

	// Played step by step and put in (Enter: the result, and the bar goes): the algorithm, not what a
	// diff would guess.
	await menu(page, 'steps', 'array-bubble-sort')
	await page.keyboard.press('Enter')
	await expect.poll(() => lines(page)).toHaveLength(4)
	expect((await lines(page))[3]).toBe('bubbleSort(a);')

	await page.keyboard.press('ControlOrMeta+z')
	await expect.poll(() => lines(page)).toHaveLength(3)
	await page.keyboard.press('ControlOrMeta+Shift+z')
	await expect.poll(() => lines(page)).toHaveLength(4)

	// Another language: the same moves written out again.
	await page.evaluate(() => {
		const editor = window.editor!
		void editor.select(editor.getCurrentPageShapes().find((s) => s.type === 'code')!.id)
	})
	await page.getByTestId('style.code-language.python').click()
	await expect.poll(async () => (await lines(page)).slice(1)).toEqual(['a[0] = 42', 'a.reverse()', 'bubble_sort(a)'])
})

test('the code beside a list: drawds’ own list methods, a + insert then typing one line, an operation its call', async ({ page }) => {
	await sketchList(page, [200, 200], 4)
	const node = (key: string) => nodeScreenPosition(page, key)
	await rightClick(page, await node('n0'))
	await page.getByTestId('context-menu-sub.drawds-list-show-button').click()
	await page.getByTestId('context-menu.list-code-beside').click()
	await expect.poll(() => lines(page)).toHaveLength(1)
	expect((await lines(page))[0]).toMatch(/^LinkedList a = new LinkedList\(\d+, \d+, \d+, \d+\);$/)

	await expect(page.locator('.tlui-menu')).toHaveCount(0)
	await page.mouse.dblclick(...(await node('n0')))
	await page.keyboard.type('42')
	await page.keyboard.press('Enter')
	await expect.poll(() => lines(page)).toEqual([expect.any(String), 'a.nodeAt(0).value = 42;'])

	await hoverNode(page, 'n0', 'n1')
	await page.getByTestId('insert-on-n0->').click()
	await page.keyboard.type('7')
	await page.keyboard.press('Enter')
	await expect.poll(async () => (await lines(page)).at(-1)).toBe('a.insertAfter(a.nodeAt(0), 7);')

	await rightClick(page, await node('n0'))
	await page.getByTestId('context-menu-sub.drawds-list-steps-button').click()
	await page.getByTestId('context-menu.list-reverse').click()
	await page.keyboard.press('Enter')
	await expect.poll(async () => (await lines(page)).at(-1)).toBe('a.reverse();')
	await page.keyboard.press('ControlOrMeta+z')
	await expect.poll(async () => (await lines(page)).at(-1)).toBe('a.insertAfter(a.nodeAt(0), 7);')
})

test('the code beside a tree: nodes by their paths; a BST insert and delete are calls with their key and node', async ({ page }) => {
	await sketchTree(page, [400, 150], 1)
	await rightClick(page, await nodeScreenPosition(page, 'n'))
	await page.getByTestId('context-menu-sub.drawds-tree-show-button').click()
	await page.getByTestId('context-menu.tree-code-beside').click()
	await expect.poll(() => lines(page)).toHaveLength(1)
	await page.evaluate(() => {
		const editor = window.editor!
		void editor.select(editor.getCurrentPageShapes().find((s) => s.type === 'binary-tree')!.id)
	})
	await hoverNode(page, 'n')
	await page.getByTestId('add-child-n-left').click()
	await page.keyboard.type('3')
	await page.keyboard.press('Enter')
	await expect.poll(async () => (await lines(page)).at(-1)).toBe('a.root.left = new Node(3);')

	// A BST: the operations are calls, their key and node told from what they did.
	await page.evaluate(() => {
		const editor = window.editor!
		const tree = editor.getCurrentPageShapes().find((s) => s.type === 'binary-tree')!
		editor.updateShape({ id: tree.id, type: 'binary-tree', props: { kind: 'bst', nodes: [{ ...(tree.props as { nodes: object[] }).nodes[0], value: '8' }, ...(tree.props as { nodes: object[] }).nodes.slice(1)] } } as never)
	})
	await insertKey(page, '12')
	await page.keyboard.press('Enter')
	await expect.poll(async () => (await lines(page)).at(-1)).toBe('a.insert(12);')
	await hoverNode(page, 'nL')
	await page.getByTestId('remove-node-nL').click()
	await page.keyboard.press('Enter')
	await expect.poll(async () => (await lines(page)).at(-1)).toBe('a.delete(a.root.left);')
	await page.keyboard.press('ControlOrMeta+z')
	await expect.poll(async () => (await lines(page)).at(-1)).toBe('a.insert(12);')
})

test('the code beside a graph: vertices by their labels; a new vertex named as it is typed, in its lines', async ({ page }) => {
	await sketchGraph(page, [300, 200], 3)
	await page.evaluate(() => {
		const editor = window.editor!
		const graph = editor.getCurrentPageShapes().find((s) => s.type === 'graph')!
		editor.updateShape({ id: graph.id, type: 'graph', props: { edges: [{ id: 'e0', from: 'v0', to: 'v1', weight: '4' }] } } as never)
	})
	await rightClick(page, await nodeScreenPosition(page, 'v0'))
	await page.getByTestId('context-menu-sub.drawds-graph-show-button').click()
	await page.getByTestId('context-menu.graph-code-beside').click()
	await expect.poll(async () => (await lines(page))[0]).toBe('Graph a = new Graph("A", "B", "C");')

	await page.evaluate(() => {
		const editor = window.editor!
		void editor.select(editor.getCurrentPageShapes().find((s) => s.type === 'graph')!.id)
	})
	await connectNodes(page, 'v2', [300, 480])
	// The new vertex opens for its label a moment after the drop.
	await page.waitForFunction(() => !!window.editor!.getEditingShapeId())
	await page.keyboard.type('Z')
	await page.keyboard.press('Enter')
	await expect.poll(async () => (await lines(page)).slice(-2)).toEqual(['a.addVertex("Z");', 'a.addEdge("C", "Z");'])
	await page.keyboard.press('ControlOrMeta+z')
	await expect.poll(async () => (await lines(page)).at(-1)).not.toBe('a.addEdge("C", "Z");')
})

test('the code beside a heap: a MinHeap over its array, its operations as calls; min to max rebuilds it', async ({ page }) => {
	await sketchHeap(page, [400, 120], 5)
	await rightClick(page, await nodeScreenPosition(page, '0'))
	await page.getByTestId('context-menu-sub.drawds-heap-show-button').click()
	await page.getByTestId('context-menu.heap-code-beside').click()
	await expect.poll(async () => (await lines(page))[0]).toMatch(/^Heap a = new MinHeap\(\d+(, \d+){4}\);$/)

	// Typed into the array: one line, no sifting.
	await menusClosed(page)
	await page.mouse.dblclick(...(await nodeScreenPosition(page, 'a4')))
	await expect.poll(() => focusedLabel(page)).toBe('Cell a4')
	await page.keyboard.type('-5')
	await page.keyboard.press('Enter')
	await expect.poll(() => lines(page)).toEqual([expect.any(String), 'a.heap[4] = -5;'])

	await insertKey(page, '-9')
	await page.keyboard.press('Enter')
	await expect.poll(async () => (await lines(page)).at(-1)).toBe('a.insert(-9);')
	await hoverNode(page, '0')
	await page.getByTestId('remove-node-0').click()
	await page.keyboard.press('Enter')
	await expect.poll(async () => (await lines(page)).at(-1)).toBe('a.extractMin();')

	// Min to max: the same values in a MaxHeap, then Floyd's build makes it one.
	await page.getByTestId('style.heap-type.max').click()
	await expect.poll(async () => (await lines(page)).slice(-2)).toEqual([expect.stringMatching(/^a = new MaxHeap\(.+\);$/), 'a.buildHeap();'])
	await page.keyboard.press('ControlOrMeta+z')
	await expect.poll(async () => (await lines(page)).at(-1)).toBe('a.extractMin();')

	await page.evaluate(() => {
		const editor = window.editor!
		void editor.select(editor.getCurrentPageShapes().find((s) => s.type === 'code')!.id)
	})
	await page.getByTestId('style.code-language.python').click()
	await expect.poll(async () => (await lines(page)).slice(1)).toEqual(['a.heap[4] = -5', 'a.insert(-9)', 'a.extract_min()'])
})

test('the code beside a hash table: its keys put in; a key typed over, insert, remove and rehash as calls; another strategy one new table', async ({ page }) => {
	await sketchHashTable(page, [200, 150], 7)
	await page.evaluate(() => {
		const editor = window.editor!
		const shape = editor.getCurrentPageShapes().find((s) => s.type === 'hash-table')!
		editor.updateShape({ id: shape.id, type: 'hash-table', props: { buckets: [[], ['8', '15'], [], ['3'], [], [], []] } } as never)
	})
	await rightClick(page, await nodeScreenPosition(page, 'k:8'))
	await page.getByTestId('context-menu-sub.drawds-hash-show-button').click()
	await page.getByTestId('context-menu.hash-code-beside').click()
	await expect.poll(() => lines(page)).toEqual([expect.stringMatching(/^HashTable a = new ChainingHashTable\(7(, \d+)*\);$/), 'a = new ChainingHashTable(7, 8, 15, 3);'])

	// Typed over a key in a chain: the node at its place, one line.
	await menusClosed(page)
	await page.mouse.dblclick(...(await nodeScreenPosition(page, 'k:15')))
	await page.keyboard.type('29')
	await page.keyboard.press('Enter')
	await expect.poll(async () => (await lines(page)).at(-1)).toBe('a.table[1].next.key = 29;')

	const played = async () => {
		while (!(await page.getByTestId('play-done').count())) await page.keyboard.press('ArrowRight')
		await page.keyboard.press('Enter')
	}
	await insertKey(page, '22')
	await played()
	await expect.poll(async () => (await lines(page)).at(-1)).toBe('a.insert(22);')
	await hoverNode(page, 'k:8')
	await page.getByTestId('remove-node-k:8').click()
	await played()
	await expect.poll(async () => (await lines(page)).at(-1)).toBe('a.remove(8);')
	await rightClick(page, await nodeScreenPosition(page, 'k:3'))
	await page.getByTestId('context-menu-sub.drawds-hash-steps-button').click()
	await page.getByTestId('context-menu.hash-rehash').click()
	await played()
	await expect.poll(async () => (await lines(page)).at(-1)).toBe('a.rehash();')

	// Linear probing: the keys put in again, one new table (never a probing table holding chains).
	const before = (await lines(page)).length
	await page.getByTestId('style.hash-strategy.probing').click()
	await expect.poll(async () => (await lines(page)).at(-1)).toMatch(/^a = new ProbingHashTable\(17, (\d+, ){2}\d+\);$/)
	expect(await lines(page)).toHaveLength(before + 1)
	await page.keyboard.press('ControlOrMeta+z')
	await expect.poll(async () => (await lines(page)).at(-1)).toBe('a.rehash();')

	await page.evaluate(() => {
		const editor = window.editor!
		void editor.select(editor.getCurrentPageShapes().find((s) => s.type === 'code')!.id)
	})
	await page.getByTestId('style.code-language.python').click()
	await expect.poll(async () => (await lines(page)).slice(1)).toEqual(['a = ChainingHashTable(7, [8, 15, 3])', 'a.table[1].next.key = 29', 'a.insert(22)', 'a.remove(8)', 'a.rehash()'])
})

test('the code beside a matrix: an int[][] (Python a list of rows); grips, inserts and transpose as code', async ({ page }) => {
	// Cell (r, c) is at (200 + c·CELL, 200 + r·CELL).
	const cell = (r: number, c: number): [number, number] => [200 + c * CELL, 200 + r * CELL]
	await sketchMatrix(page, cell(0, 0), 2, 3)
	await rightClick(page, cell(0, 0))
	await page.getByTestId('context-menu-sub.drawds-matrix-show-button').click()
	await page.getByTestId('context-menu.matrix-code-beside').click()
	await expect.poll(async () => (await lines(page))[0]).toMatch(/^int\[\]\[\] a = \{\{\d+, \d+, \d+\}, \{\d+, \d+, \d+\}\};$/)

	await menusClosed(page)
	await page.mouse.dblclick(...cell(1, 1))
	await expect.poll(() => focusedLabel(page)).toBe('Cell 1,1')
	await page.keyboard.press('ControlOrMeta+a')
	await page.keyboard.type('42')
	await page.keyboard.press('Enter')
	await expect.poll(async () => (await lines(page)).at(-1)).toBe('a[1][1] = 42;')

	// The column grip dragged two cells right: two columns, a line each.
	const [x, y] = await handlePosition(page, 'grow-cols')
	await page.mouse.move(x, y)
	await page.mouse.down()
	await page.mouse.move(x + CELL * 2, y, { steps: 10 })
	await page.mouse.up()
	const added = /^a = insertCol\(a, a\[0\]\.length, new int\[\]\{\d+, \d+\}\);$/
	await expect.poll(async () => (await lines(page)).slice(2)).toEqual([expect.stringMatching(added), expect.stringMatching(added)])

	await rightClick(page, cell(1, 1))
	await page.getByTestId('context-menu-sub.drawds-matrix-actions-button').click()
	await page.getByTestId('context-menu.matrix-row-above').click()
	await expect.poll(async () => (await lines(page)).at(-1)).toMatch(/^a = insertRow\(a, 1, new int\[\]\{\d+(, \d+){4}\}\);$/)
	await rightClick(page, cell(0, 0))
	await page.getByTestId('context-menu-sub.drawds-matrix-actions-button').click()
	await page.getByTestId('context-menu.matrix-transpose').click()
	await expect.poll(async () => (await lines(page)).at(-1)).toBe('a = transpose(a);')
	await page.keyboard.press('ControlOrMeta+z')
	await expect.poll(async () => (await lines(page)).at(-1)).toMatch(/^a = insertRow/)

	await page.evaluate(() => {
		const editor = window.editor!
		void editor.select(editor.getCurrentPageShapes().find((s) => s.type === 'code')!.id)
	})
	await page.getByTestId('style.code-language.python').click()
	await expect.poll(async () => (await lines(page)).slice(1, 3)).toEqual(['a[1][1] = 42', expect.stringMatching(/^for row, v in zip\(a, \[\d+, \d+\]\): row\.append\(v\)$/)])
})

test('the code beside union-find: union and find called by index (names in a comment), how they work as fields', async ({ page }) => {
	await sketchUnionFind(page, [200, 150], 5)
	const element = (i: number) => nodeScreenPosition(page, String(i))
	await rightClick(page, await element(0))
	await page.getByTestId('context-menu-sub.drawds-uf-show-button').click()
	await page.getByTestId('context-menu.uf-code-beside').click()
	await expect.poll(() => lines(page)).toEqual(['UnionFind a = new UnionFind(5);'])

	const union = async (i: number, other: string) => {
		await rightClick(page, await element(i))
		await page.getByTestId('context-menu-sub.drawds-uf-steps-button').click()
		await page.getByTestId('context-menu.uf-union').click()
		await page.getByTestId('key-prompt').fill(other)
		await page.keyboard.press('Enter')
		while (!(await page.getByTestId('play-done').count())) await page.keyboard.press('ArrowRight')
		await page.keyboard.press('Enter')
	}
	await union(1, '3')
	await expect.poll(async () => (await lines(page)).at(-1)).toBe('a.union(1, 3);')

	// Named elements: the code still works by index, the names in a comment. A name logs nothing.
	await menusClosed(page)
	await page.mouse.dblclick(...(await element(0)))
	await expect.poll(() => focusedLabel(page)).toBe('Cell 0')
	await page.keyboard.press('ControlOrMeta+a')
	await page.keyboard.type('A')
	await page.keyboard.press('Enter')
	await union(0, '2')
	await expect.poll(async () => (await lines(page)).slice(1)).toEqual(['a.union(1, 3);', 'a.union(0, 2);    // union(A, 2)'])

	await page.getByTestId('style.uf-union.rank').click()
	await expect.poll(async () => (await lines(page)).at(-1)).toBe('a.by = By.RANK;')
	await insertKey(page, 'E')
	await expect.poll(async () => (await lines(page)).at(-1)).toBe('a.makeSet();')
	await page.keyboard.press('ControlOrMeta+z')
	await expect.poll(async () => (await lines(page)).at(-1)).toBe('a.by = By.RANK;')

	await page.evaluate(() => {
		const editor = window.editor!
		void editor.select(editor.getCurrentPageShapes().find((s) => s.type === 'code')!.id)
	})
	await page.getByTestId('style.code-language.python').click()
	await expect.poll(() => lines(page)).toEqual(['a = UnionFind(5)', 'a.union(1, 3)', 'a.union(0, 2)    # union(A, 2)', "a.by = 'rank'"])
})

test('the code beside a stack or queue: lecture 6’s ArrayStack and ArrayQueue, a linked stack a LinkedStack', async ({ page }) => {
	const done = async () => {
		while (!(await page.getByTestId('play-done').count())) await page.keyboard.press('ArrowRight')
		await page.keyboard.press('Enter')
	}
	const step = async (at: [number, number], item: string, value?: string) => {
		await rightClick(page, at)
		await page.getByTestId('context-menu-sub.drawds-array-steps-button').click()
		await page.getByTestId(`context-menu.${item}`).click()
		if (value !== undefined) {
			await page.getByTestId('key-prompt').fill(value)
			await page.keyboard.press('Enter')
		}
		await done()
	}
	// Sketched growing (a list), given a fixed capacity: an ArrayStack from there, named s.
	await sketchArrayKind(page, 'stack', [300, 450], 2, 'up')
	await page.getByTestId('style.array-sizing.fixed').click()
	await rightClick(page, [300, 450])
	await page.getByTestId('context-menu-sub.drawds-array-show-button').click()
	await page.getByTestId('context-menu.array-code-beside').click()
	await expect.poll(async () => (await lines(page)).at(-1)).toMatch(/^s = new ArrayStack\(2, \d+, \d+\);$/)
	await step([300, 450], 'array-grow')
	await expect.poll(async () => (await lines(page)).at(-1)).toMatch(/^s = new ArrayStack\(4, \d+, \d+\);$/)
	await step([300, 450], 'array-push-value', '42')
	await expect.poll(async () => (await lines(page)).at(-1)).toBe('s.push(42);')
	await step([300, 450], 'array-pop')
	await expect.poll(async () => (await lines(page)).at(-1)).toBe('s.pop();')
	await page.keyboard.press('ControlOrMeta+z')
	await expect.poll(async () => (await lines(page)).at(-1)).toBe('s.push(42);')

	// A circular buffer, named q (the Length picker still on fixed: one from the start): a dequeue, then
	// an enqueue wrapping round.
	await page.evaluate(() => void window.editor!.deleteShapes([...window.editor!.getCurrentPageShapeIds()]))
	await sketchArrayKind(page, 'queue', [200, 300], 3, 'right')
	await rightClick(page, [200, 300])
	await page.getByTestId('context-menu-sub.drawds-array-show-button').click()
	await page.getByTestId('context-menu.array-code-beside').click()
	await expect.poll(() => lines(page)).toEqual([expect.stringMatching(/^ArrayQueue q = new ArrayQueue\(3, \d+, \d+, \d+\);$/)])
	await step([200, 300], 'array-dequeue')
	await expect.poll(async () => (await lines(page)).at(-1)).toBe('q.dequeue();')
	await step([200, 300], 'array-enqueue-value', '7')
	await expect.poll(async () => (await lines(page)).at(-1)).toBe('q.enqueue(7);')

	// A list made a linked stack: a LinkedStack from there, push and pop by its buttons.
	await page.evaluate(() => void window.editor!.deleteShapes([...window.editor!.getCurrentPageShapeIds()]))
	await sketchList(page, [200, 200], 2)
	await page.getByTestId('style.list-kind.stack').click()
	await rightClick(page, await nodeScreenPosition(page, 'n0'))
	await page.getByTestId('context-menu-sub.drawds-list-show-button').click()
	await page.getByTestId('context-menu.list-code-beside').click()
	await expect.poll(async () => (await lines(page)).at(-1)).toMatch(/^a = new LinkedStack\(\d+, \d+\);    \/\/ top first$/)
	await menusClosed(page)
	await page.getByTestId('stack-pop').click()
	await done()
	await expect.poll(async () => (await lines(page)).at(-1)).toBe('a.pop();')
	await page.getByTestId('stack-push').click()
	await done()
	await expect.poll(async () => (await lines(page)).at(-1)).toMatch(/^a\.push\(\d+\);$/)
})
