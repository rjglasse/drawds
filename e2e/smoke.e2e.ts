import { expect, test, type Page } from '@playwright/test'
import { open, rightClick } from './helpers'

// Every operation in every structure's menu (Step by step, its own submenu, Show), on each structure at its
// smallest and at a typical size: prompts answered, played to the end, then undone back to the sketch. Any page
// or console error fails it, and so does one opening on predict mode's default question (it runs with predict
// mode on: each opens on its first question). (The quality review's smoke test, dds-c72.11: it found a graph
// that could be emptied, and with predict mode a pulse ring drawn with a negative corner radius.) About 360 operations, a test per structure, half a minute in parallel; SMOKE_VERBOSE=1 prints the
// count for each size.

const S = 'Shift+'
const LEVEL = 76.8
/** Each structure: its tool's key, and the drag (from, to) for its smallest and a typical sketch. */
const STRUCTURES: [type: string, key: string, small: number[], typical: number[]][] = [
	['array', `${S}A`, [300, 300, 302, 300], [300, 300, 300 + 48 * 6 + 10, 300]],
	['matrix', `${S}M`, [300, 300, 310, 310], [300, 300, 300 + 48 * 3, 300 + 48 * 3]],
	['linked-list', `${S}N`, [300, 300, 302, 300], [300, 300, 300 + 115.2 * 3 + 10, 300]],
	['binary-tree', `${S}T`, [300, 200, 300, 200], [300, 200, 340, 200 + LEVEL * 3 + 10]],
	['general-tree', `${S}K`, [300, 200, 300, 200], [300, 200, 330, 200 + LEVEL * 2 + 10]],
	['trie', `${S}W`, [300, 200, 300, 200], [300, 200, 300 + 48 * 5, 200]],
	['heap', `${S}P`, [300, 200, 300, 200], [300, 200, 300 + 48 * 6, 200]],
	['union-find', `${S}U`, [300, 300, 340, 300], [300, 300, 300 + 48 * 5, 300]],
	['hash-table', `${S}B`, [300, 200, 300, 200 + 48 * 2], [300, 200, 300, 200 + 48 * 6]],
	['graph', `${S}G`, [300, 300, 302, 300], [300, 300, 300 + 110 * 4, 300 + 110]],
]

const frame = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))

/** A drag at hand speed: one move a frame, as the sketch tools need. */
async function drag(page: Page, [x1, y1, x2, y2]: number[], steps = 16) {
	await page.mouse.move(x1, y1)
	await page.mouse.down()
	for (let i = 1; i <= steps; i++) {
		await page.mouse.move(x1 + ((x2 - x1) * i) / steps, y1 + ((y2 - y1) * i) / steps)
		await frame(page)
	}
	await page.mouse.up()
}

/** The structure selected, and a screen point on one of its elements (a node, else its first cell). */
function elementAt(page: Page, type: string): Promise<[number, number] | null> {
	return page.evaluate((type) => {
		const e = window.editor!
		const s = e.getCurrentPageShapes().find((s) => s.type === type)
		if (!s) return null
		e.select(s.id)
		const util = e.getShapeUtil(s) as unknown as {
			getScene?(s: unknown): { nodes: { kind: string; editable?: boolean; x: number; y: number }[] }
			cells?: { firstCell(s: unknown): string | undefined; cellBox(s: unknown, k: string): { x: number; y: number; w: number; h: number } }
		}
		const scene = util.getScene?.(s)
		const node = scene?.nodes.find((n) => n.editable || n.kind === 'circle') ?? scene?.nodes[0]
		const b = e.getShapePageBounds(s)!
		const key = util.cells?.firstCell(s)
		const box = key !== undefined ? util.cells!.cellBox(s, key) : undefined
		const at = node ?? (box ? { x: box.x + box.w / 2, y: box.y + box.h / 2 } : undefined)
		const p = at ? e.getShapePageTransform(s).applyToPoint(at) : { x: b.midX, y: b.midY }
		const q = e.pageToScreen(p)
		return [q.x, q.y] as [number, number]
	}, type)
}

/**
 * Answer a prompt with a value the structure has (or 3), then play the operation to its end and put it in.
 * In predict mode an operation opens on its first question: returned, to check it is one of its own.
 */
async function play(page: Page): Promise<string | undefined> {
	const prompt = page.getByTestId('key-prompt')
	if (await prompt.isVisible().catch(() => false)) {
		const value = await page.evaluate(() => {
			const e = window.editor!
			const p = (e.getOnlySelectedShape() ?? e.getCurrentPageShapes()[0])?.props as Record<string, unknown> | undefined
			const values = p?.values as string[] | undefined
			const nodes = p?.nodes as { value: string }[] | undefined
			const buckets = p?.buckets as string[][] | undefined
			const labels = p?.labels as string[] | undefined
			return String(values?.[0] || nodes?.find((n) => n.value)?.value || buckets?.flat()[0]?.split(':')[0] || labels?.[1] || '3')
		})
		const input = prompt.locator('input').first()
		await ((await input.count()) ? input : prompt).fill(value)
		await page.keyboard.press('Enter')
	}
	let opening: string | undefined
	if (await page.getByTestId('play-bar').isVisible().catch(() => false)) {
		const asking = page.locator('[data-testid="play-caption"][data-asking]')
		if (await asking.count()) opening = (await asking.textContent()) ?? undefined
		for (let i = 0; i < 800 && !(await page.getByTestId('play-done').isVisible().catch(() => false)); i++) {
			await page.keyboard.press('ArrowRight')
			if (i % 20 === 19) await frame(page)
		}
		await page.keyboard.press('Enter')
	}
	return opening
}

/** Test ids of the structure's submenus (not Mark or Pointer), its Step by step's categories opened in turn. */
async function menus(page: Page, type: string): Promise<{ sub: string; group: string | null }[]> {
	await rightClick(page, (await elementAt(page, type))!)
	const subs = await page.evaluate(() =>
		[...document.querySelectorAll('[data-testid^="context-menu-sub.drawds-"]')]
			.map((el) => el.getAttribute('data-testid')!)
			.filter((t) => !/-mark-|-pointer-/.test(t))
	)
	await page.keyboard.press('Escape')
	const out: { sub: string; group: string | null }[] = []
	for (const sub of subs) {
		await rightClick(page, (await elementAt(page, type))!)
		await page.getByTestId(sub).click()
		const groups = await page.evaluate(
			(sub) =>
				[...document.querySelectorAll('[data-testid^="context-menu-sub.drawds-"][data-testid*="-steps-"]')]
					.map((el) => el.getAttribute('data-testid')!)
					.filter((t) => t !== sub),
			sub
		)
		await page.keyboard.press('Escape')
		out.push(...(groups.length ? groups.map((group) => ({ sub, group })) : [{ sub, group: null }]))
	}
	return out
}

/** The items of a submenu (or one of its categories). */
async function itemsOf(page: Page, type: string, { sub, group }: { sub: string; group: string | null }) {
	await rightClick(page, (await elementAt(page, type))!)
	await page.getByTestId(sub).click()
	if (group) await page.getByTestId(group).click()
	const items = await page.evaluate(() => {
		const menu = [...document.querySelectorAll('[data-radix-popper-content-wrapper]')].at(-1)
		return menu ? [...menu.querySelectorAll('[data-testid^="context-menu."]')].map((el) => el.getAttribute('data-testid')!) : []
	})
	await page.keyboard.press('Escape')
	return items
}

for (const [type, key, small, typical] of STRUCTURES) {
	test(`every menu operation on a ${type}, smallest and typical: no errors`, async ({ page }) => {
		test.setTimeout(600_000)
		const errors: string[] = []
		let doing = ''
		page.on('pageerror', (e) => errors.push(`${doing}: ${e.message.split('\n')[0]}`))
		page.on('console', (m) => void (m.type() === 'error' && errors.push(`${doing}: console ${m.text().split('\n')[0].slice(0, 160)}`)))
		// Predict mode on: each operation opens on its first question, which must be its own.
		await page.addInitScript(() => window.localStorage.setItem('drawds:predict', 'on'))
		await open(page)
		await page.evaluate(() => window.localStorage.removeItem('drawds:seed'))
		const vague: string[] = []
		const ran: Record<string, number> = {}
		for (const [size, d] of [['smallest', small], ['typical', typical]] as const) {
			await page.evaluate(() => {
				const e = window.editor!
				e.deleteShapes([...e.getCurrentPageShapeIds()])
				e.setCamera({ x: 0, y: 0, z: 1 })
			})
			doing = `${type} ${size} sketch`
			await page.keyboard.press('Escape')
			await page.keyboard.press(key)
			await drag(page, d)
			expect(await elementAt(page, type), doing).not.toBeNull()
			ran[size] = 0
			for (const where of await menus(page, type)) {
				for (const item of await itemsOf(page, type, where)) {
					doing = `${type} ${size} ${item}`
					// Back to the sketch afterwards: whatever the operation put in, and the views it opened.
					const mark = await page.evaluate(() => window.editor!.markHistoryStoppingPoint('smoke'))
					await rightClick(page, (await elementAt(page, type))!)
					const sub = page.getByTestId(where.sub)
					if (await sub.isVisible().catch(() => false)) {
						await sub.click()
						if (where.group) await page.getByTestId(where.group).click()
						const it = page.getByTestId(item)
						if (await it.isVisible().catch(() => false)) {
							await it.click()
							if ((await play(page)) === 'What happens next?') vague.push(`${size} ${item}`)
							ran[size]++
						}
					}
					await page.keyboard.press('Escape')
					await page.keyboard.press('Escape')
					await page.evaluate((mark) => void window.editor!.bailToMark(mark), mark)
				}
			}
		}
		test.info().annotations.push({ type: 'operations', description: `${ran.smallest} on the smallest, ${ran.typical} on a typical` })
		if (process.env.SMOKE_VERBOSE) console.log(type, ran, 'opening on "What happens next?":', [...new Set(vague)])
		expect(errors).toEqual([])
		// Predict mode never opens an operation on the default "What happens next?": each asks its own.
		expect([...new Set(vague)], 'operations opening on "What happens next?"').toEqual([])
		// Something ran at each size (a structure's whole menu can't silently vanish).
		expect(ran.smallest, 'operations on the smallest sketch').toBeGreaterThan(0)
		expect(ran.typical, 'operations on a typical sketch').toBeGreaterThan(0)
	})
}
