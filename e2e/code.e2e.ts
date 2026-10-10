import { expect, test, type Page } from '@playwright/test'
import type { CodeShapeProps } from '../src/shapes/code/code-shape-types'
import { focusedLabel, menusClosed, open, rightClick, shapesOfType, withEditor } from './helpers'

const code = async (page: Page) => (await shapesOfType<CodeShapeProps>(page, 'code'))[0]?.props
/** The highlighted pieces of a kind, as drawn. */
const drawn = (page: Page, kind: string) => page.locator(`[data-testid="code-box"] tspan[data-kind="${kind}"]`).allTextContents()

/** Shift+C, then a click: a code box opens for typing with its first line at the click. */
async function newCodeBox(page: Page, at: [number, number], language?: 'c' | 'java' | 'python') {
	await page.keyboard.press('Shift+C')
	if (language) await page.getByTestId(`style.code-language.${language}`).click()
	await page.mouse.click(...at)
	await expect.poll(() => focusedLabel(page)).toBe('Code')
}

/** Type lines, pressing Enter between them (the editor indents; a leading '}' steps out). */
async function typeLines(page: Page, lines: string[]) {
	for (const [i, line] of lines.entries()) {
		if (i > 0) await page.keyboard.press('Enter')
		await page.keyboard.type(line)
	}
}

test.beforeEach(({ page }) => open(page))

test('a Java method typed in: Enter keeps the indentation, } steps out, highlighted as typed; Esc keeps it, one undo takes it all back', async ({ page }) => {
	await newCodeBox(page, [200, 150])
	await typeLines(page, ['public static int sum(int[] a) {', 'int total = 0; // running sum', 'for (int x : a) {', 'total += x;', '}', 'return total;', '}'])
	// Highlighted while still being typed.
	await expect.poll(() => drawn(page, 'keyword')).toEqual(['public', 'static', 'for', 'return'])
	expect(await drawn(page, 'type')).toEqual(['int', 'int', 'int', 'int'])
	expect(await drawn(page, 'comment')).toEqual(['// running sum'])
	expect(await drawn(page, 'number')).toEqual(['0'])
	await page.keyboard.press('Escape')
	expect((await code(page)).code).toBe(
		'public static int sum(int[] a) {\n    int total = 0; // running sum\n    for (int x : a) {\n        total += x;\n    }\n    return total;\n}'
	)
	expect(await withEditor(page, (e) => e.getPath())).toBe('select.idle')
	await page.keyboard.press('ControlOrMeta+z')
	expect(await shapesOfType(page, 'code')).toHaveLength(0)
})

test('Tab indents and Shift+Tab outdents; the style panel picks Python and C', async ({ page }) => {
	await newCodeBox(page, [200, 150], 'python')
	await typeLines(page, ['@cache', 'def fib(n):', 'if n < 2:', 'return n'])
	await page.keyboard.press('Enter')
	await page.keyboard.press('Shift+Tab')
	await page.keyboard.type('return fib(n - 1) + fib(n - 2)  # slow')
	await page.keyboard.press('Escape')
	const props = await code(page)
	expect(props.language).toBe('python')
	expect(props.code).toBe('@cache\ndef fib(n):\n    if n < 2:\n        return n\n    return fib(n - 1) + fib(n - 2)  # slow')
	expect(await drawn(page, 'meta')).toEqual(['@cache'])
	expect(await drawn(page, 'comment')).toEqual(['# slow'])

	// The same box as C: a # is no comment there.
	await page.getByTestId('style.code-language.c').click()
	expect((await code(page)).language).toBe('c')
	expect(await drawn(page, 'comment')).toEqual([])

	// A new line under the last keeps its indent; Tab adds four spaces.
	await page.mouse.dblclick(220, 150)
	await expect.poll(() => focusedLabel(page)).toBe('Code')
	await page.getByTestId('code-editor').evaluate((t: HTMLTextAreaElement) => t.setSelectionRange(t.value.length, t.value.length))
	await page.keyboard.press('Enter')
	await page.keyboard.press('Tab')
	await page.keyboard.type('x')
	await page.keyboard.press('Escape')
	expect((await code(page)).code).toMatch(/# slow\n        x$/)
})

test('a double-click puts the caret where it was; empty boxes go; lines can be marked and numbered', async ({ page }) => {
	await newCodeBox(page, [200, 150])
	await typeLines(page, ['int a;', 'int bcd;'])
	await page.keyboard.press('Escape')
	// Second line, before "bcd": its middle is a line height below the first line's.
	const at = await withEditor(page, (e) => {
		const s = e.getOnlySelectedShape()!
		const box = e.getShapePageBounds(s)!
		return { x: box.x, y: box.y, h: box.h }
	})
	const lineH = (at.h - 2 * 9) / 2
	await page.mouse.dblclick(200 + 4 * 17.3 * 0.6, 150 + lineH)
	await expect.poll(() => focusedLabel(page)).toBe('Code')
	expect(await page.getByTestId('code-editor').evaluate((t: HTMLTextAreaElement) => t.selectionStart)).toBe(11)
	await page.keyboard.press('Escape')

	// Point at the second line and press 3: it lights green.
	await page.mouse.move(230, 150 + lineH)
	await page.keyboard.press('3')
	expect((await code(page)).marks).toEqual({ L1: 'green' })
	await expect(page.locator('[data-mark-line="1"]')).toHaveCount(1)
	await rightClick(page, [230, 150])
	await page.getByTestId('context-menu-sub.drawds-code-show-button').click()
	await page.getByTestId('context-menu.code-line-numbers').click()
	expect((await code(page)).lineNumbers).toBe(true)

	// A box left empty doesn't stay.
	await menusClosed(page)
	await newCodeBox(page, [200, 500])
	await page.keyboard.press('Escape')
	expect(await shapesOfType(page, 'code')).toHaveLength(1)
})

test('a text box with an algorithm in it becomes a code box: indentation kept, the language guessed; one undo', async ({ page }) => {
	// Made directly: tldraw's text editor can scramble keys typed as fast as a test types them.
	const lines = ['def find_max(a):', '    m = a[0]', '    for x in a:', '        if x > m:', '            m = x', '    return m']
	await page.evaluate((lines) => {
		const e = window.editor!
		const richText = { type: 'doc', content: lines.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })) }
		e.createShape({ type: 'text', x: 200, y: 150, props: { richText } } as never)
		e.select(e.getCurrentPageShapes()[0].id)
	}, lines)
	await rightClick(page, [220, 160])
	await page.getByTestId('context-menu.make-code-box').click()
	expect(await shapesOfType(page, 'text')).toHaveLength(0)
	const props = await code(page)
	expect(props.language).toBe('python')
	expect(props.code).toBe('def find_max(a):\n    m = a[0]\n    for x in a:\n        if x > m:\n            m = x\n    return m')
	expect(await drawn(page, 'keyword')).toEqual(['def', 'for', 'in', 'if', 'return'])
	await page.keyboard.press('ControlOrMeta+z')
	expect(await shapesOfType(page, 'code')).toHaveLength(0)
	expect(await shapesOfType(page, 'text')).toHaveLength(1)
})

test('a pc pointer beside a line: the code stays put as it comes, the arrow keys step it; a clean copy lines up under it', async ({ page }) => {
	await newCodeBox(page, [300, 150])
	await typeLines(page, ['int max(int[] a) {', 'int m = a[0];', 'for (int x : a) {', 'if (x > m) m = x;', '}', 'return m;', '}'])
	await page.keyboard.press('Escape')
	/** Screen x of the first line's text in each code box. */
	const textX = () => page.locator('[data-testid="code-box"] text:first-of-type').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().x)))
	const [before] = await textX()
	await rightClick(page, [330, 176])
	await page.getByTestId('context-menu-sub.drawds-pointer-button').click()
	await page.getByTestId('context-menu.pointer-pc').click()
	expect((await code(page)).pointers.map((p) => p.at)).toEqual(['L1'])
	expect(await textX()).toEqual([before])
	await page.getByTestId('pointer-pc').click()
	await page.keyboard.press('ArrowDown')
	await page.keyboard.press('ArrowDown')
	await page.keyboard.press('Escape')
	expect((await code(page)).pointers.map((p) => p.at)).toEqual(['L3'])

	await rightClick(page, [330, 150])
	await page.getByTestId('context-menu-sub.drawds-code-actions-button').click()
	await page.getByTestId('context-menu.clean-copy').click()
	expect(await textX()).toEqual([before, before])
})
