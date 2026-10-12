/// <reference types="node" />
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { arrayStep, open, rightClick, sketchArray, sketchList, sketchTree } from './helpers'

test.beforeEach(({ page }) => open(page))

test("the board's code downloads as a Python script that runs and leaves the structures as drawn", async ({ page }) => {
	await sketchArray(page, [150, 150], 4)
	await sketchList(page, [150, 320], 3)
	await sketchTree(page, [750, 150], 3)
	// A value appended, a node's value typed over, a tree's: the moves the code logs.
	await page.evaluate(() => {
		const editor = window.editor!
		const of = (type: string) => editor.getCurrentPageShapes().find((s) => s.type === type)! as never as { id: never; props: Record<string, never[]> }
		const [a, l, t] = [of('array'), of('linked-list'), of('binary-tree')]
		editor.updateShape({ id: a.id, type: 'array', props: { values: [...a.props.values, '7'] } } as never)
		const nodes = l.props.nodes as unknown as { value: string }[]
		editor.updateShape({ id: l.id, type: 'linked-list', props: { nodes: [{ ...nodes[0], value: '42' }, ...nodes.slice(1)] } } as never)
		const tree = t.props.nodes as unknown as { value: string }[]
		editor.updateShape({ id: t.id, type: 'binary-tree', props: { nodes: [{ ...tree[0], value: '99' }, ...tree.slice(1)] } } as never)
	})
	// An operation played and put in: a call to its code.
	await rightClick(page, [150, 150])
	await page.getByTestId('context-menu-sub.drawds-array-steps-button').click()
	await arrayStep(page, 'array-bubble-sort')
	await expect(page.getByTestId('play-bar')).toBeVisible()
	await page.keyboard.press('Enter')
	await expect(page.getByTestId('play-bar')).toHaveCount(0)

	await page.getByTestId('main-menu.button').click()
	const downloading = page.waitForEvent('download')
	await page.getByTestId('main-menu.drawds-download-code').click()
	const download = await downloading
	expect(download.suggestedFilename()).toBe('board.py')
	const path = test.info().outputPath('board.py')
	await download.saveAs(path)
	const script = readFileSync(path, 'utf8')
	expect(script).toContain('def bubble_sort(a):')

	// What python3 prints, against what the board shows.
	const printed = execFileSync('python3', [path], { encoding: 'utf8' })
		.trim()
		.split('\n')
		.map((line) => line.slice(line.indexOf(' = ') + 3))
	const drawn = await page.evaluate(() => {
		const editor = window.editor!
		const py = (v: string) => (/^-?\d+$/.test(v) ? v : `'${v}'`)
		type TreeNode = { id: string; value: string; children: (string | null)[] }
		return editor
			.getCurrentPageShapes()
			.flatMap((s): string[] => {
				const props = s.props as { values?: string[]; nodes?: { id: string; value: string; children?: (string | null)[] }[] }
				if (s.type === 'array') return [`[${props.values!.map(py).join(', ')}]`]
				if (s.type === 'linked-list') return [`LinkedList([${props.nodes!.map((n) => py(n.value)).join(', ')}])`]
				if (s.type === 'binary-tree') {
					const nodes = new Map((props.nodes as TreeNode[]).map((n) => [n.id, n]))
					const show = (id: string | null): string => {
						if (!id) return 'None'
						const n = nodes.get(id)!
						const [l, r] = [n.children[0] ?? null, n.children[1] ?? null]
						return !l && !r ? `Node(${py(n.value)})` : `Node(${py(n.value)}, ${show(l)}, ${show(r)})`
					}
					return [`Tree(${show((props.nodes as TreeNode[])[0].id)})`]
				}
				return []
			})
	})
	expect(printed.sort()).toEqual(drawn.sort())
})

test("a code box's Copy the code: its text as drawn, the code beside an array included", async ({ page, context }) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write'])
	await sketchArray(page, [200, 200], 3)
	await page.evaluate(() => {
		const editor = window.editor!
		const a = editor.getCurrentPageShapes().find((s) => s.type === 'array')!
		editor.updateShape({ id: a.id, type: 'array', props: { values: ['1', '2', '3'] } } as never)
	})
	await rightClick(page, [200, 200])
	await page.getByTestId('context-menu-sub.drawds-array-show-button').click()
	await page.getByTestId('context-menu.array-code-beside').click()
	const box = page.locator('[data-shape-type="code"]')
	await expect(box).toBeVisible()
	const at = (await box.boundingBox())!
	await rightClick(page, [at.x + at.width / 2, at.y + at.height / 2])
	await page.getByTestId('context-menu-sub.drawds-code-actions-button').click()
	await page.getByTestId('context-menu.code-copy').click()
	const drawn = (await box.locator('[data-code-line]').allTextContents()).join('\n')
	expect(drawn).toMatch(/^List<Integer> a = new ArrayList<>/)
	await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(drawn)
})
