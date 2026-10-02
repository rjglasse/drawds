#!/usr/bin/env node
// Drive the drawds app (tldraw canvas) in headless Chrome.
//
// Reads one command per line from stdin (blank lines and `#` comments ignored), runs them in
// order, and stops with exit code 1 at the first failure. Starts the Vite dev server itself if
// APP_URL isn't answering, and stops it again on exit. See SKILL.md for the command list.
//
//   node .claude/skills/run-drawds/driver.mjs <<'EOF'
//   nav
//   array 300 200 5 right
//   screenshot sketched
//   EOF

import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const UNIT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const PORT = Number(process.env.PORT ?? 5179)
const APP_URL = process.env.APP_URL ?? `http://localhost:${PORT}`
const OUT = resolve(process.env.OUT ?? join(tmpdir(), 'run-drawds'))
// Cell size in px at the default size style "m" (src/shapes/sizes.ts CELL_SIZES).
const CELL = 48
// Linked-list node centre spacing at size "m": node (1.5 cells) + arrow gap (0.9) (src/shapes/list/layout.ts).
const LIST_STEP = CELL * 2.4

mkdirSync(OUT, { recursive: true })

async function isUp() {
	try {
		return (await fetch(APP_URL)).ok
	} catch {
		return false
	}
}

let server
async function ensureServer() {
	if (await isUp()) return console.log(`dev server: using ${APP_URL}`)
	server = spawn(join(UNIT, 'node_modules/.bin/vite'), ['--port', String(PORT), '--strictPort'], {
		cwd: UNIT,
		stdio: ['ignore', 'ignore', 'inherit'],
	})
	for (let i = 0; i < 60; i++) {
		if (await isUp()) return console.log(`dev server: started on ${APP_URL}`)
		await new Promise((r) => setTimeout(r, 500))
	}
	throw new Error(`dev server did not answer on ${APP_URL} within 30s`)
}

async function launchBrowser() {
	// Prefer an explicit binary, then installed Google Chrome, then Playwright's own Chromium
	// (`npx playwright-core install chromium`).
	if (process.env.CHROME_PATH) return chromium.launch({ executablePath: process.env.CHROME_PATH })
	try {
		return await chromium.launch({ channel: 'chrome' })
	} catch {
		return chromium.launch()
	}
}

async function sketch(shortcut, step, x, y, n, dir) {
	const d = (+n - 1) * step + 10
	const [dx, dy] = { right: [d, 0], left: [-d, 0], down: [0, d], up: [0, -d] }[dir]
	await page.keyboard.press(shortcut)
	await commands.drag(x, y, +x + dx, +y + dy)
}

const problems = []
let browser, page

const commands = {
	async nav(url = APP_URL) {
		await page.goto(url)
		await page.waitForSelector('.tl-canvas')
		await page.waitForFunction(() => !!window.editor, null, { timeout: 10_000 })
		return 'canvas ready'
	},
	async reset() {
		await page.evaluate(() => {
			const e = window.editor
			e.deleteShapes([...e.getCurrentPageShapeIds()])
			e.setCurrentTool('select')
		})
		return 'page cleared'
	},
	async key(combo) {
		await page.keyboard.press(combo)
	},
	async type(...words) {
		await page.keyboard.type(words.join(' '))
	},
	async move(x, y) {
		await page.mouse.move(+x, +y)
	},
	async down() {
		await page.mouse.down()
	},
	async up() {
		await page.mouse.up()
	},
	async click(x, y) {
		await page.mouse.click(+x, +y)
	},
	async dblclick(x, y) {
		await page.mouse.dblclick(+x, +y)
	},
	async rclick(x, y) {
		await page.mouse.click(+x, +y, { button: 'right' })
	},
	// Click the first element matching a CSS selector, e.g. [data-testid="style.fill-mode"].
	async clicksel(...selector) {
		await page.locator(selector.join(' ')).first().click()
	},
	// Move the pointer to a node of the only selected node-link shape, or half-way between two
	// (which is on the arrow joining them). Node controls (x, +) only appear near the pointer.
	async hover(...keys) {
		const at = await page.evaluate((keys) => {
			const e = window.editor
			const shape = e.getOnlySelectedShape()
			const scene = shape && e.getShapeUtil(shape).getScene?.(shape)
			const nodes = scene && keys.map((k) => scene.nodes.find((n) => n.key === k))
			if (!nodes || nodes.some((n) => !n)) return null
			const mid = { x: nodes.reduce((s, n) => s + n.x, 0) / nodes.length, y: nodes.reduce((s, n) => s + n.y, 0) / nodes.length }
			const p = e.pageToScreen(e.getShapePageTransform(shape).applyToPoint(mid))
			return [p.x, p.y]
		}, keys)
		if (!at) throw new Error(`no node(s) ${keys.join(', ')} on the selected shape (select one node-link shape first)`)
		await page.mouse.move(at[0], at[1])
	},
	// Drag a node of the selected node-link shape by (dx, dy), using its handle.
	async dragnode(key, dx, dy) {
		const at = await page.evaluate((key) => {
			const e = window.editor
			const shape = e.getOnlySelectedShape()
			const handle = shape && e.getShapeHandles(shape)?.find((h) => h.id === key)
			if (!handle) return null
			const p = e.pageToScreen(e.getShapePageTransform(shape).applyToPoint(handle))
			return [p.x, p.y]
		}, key)
		if (!at) throw new Error(`no handle "${key}" on the selected shape (select one node-link shape first)`)
		await commands.drag(at[0], at[1], at[0] + +dx, at[1] + +dy)
		return commands.shapes()
	},
	async drag(x1, y1, x2, y2, steps = 20) {
		await page.mouse.move(+x1, +y1)
		await page.mouse.down()
		await page.mouse.move(+x2, +y2, { steps: +steps })
		await page.mouse.up()
	},
	// Sketch an array of n cells with the array tool; the first cell is centred on (x, y).
	async array(x, y, n, dir = 'right') {
		await sketch('Shift+A', CELL, x, y, n, dir)
		return commands.shapes()
	},
	// Sketch a linked list of n nodes with the list tool; the head node is centred on (x, y).
	async list(x, y, n, dir = 'right') {
		await sketch('Shift+N', LIST_STEP, x, y, n, dir)
		return commands.shapes()
	},
	async shapes() {
		return page.evaluate(() =>
			window.editor.getCurrentPageShapes().map((s) => ({
				id: s.id,
				type: s.type,
				x: Math.round(s.x),
				y: Math.round(s.y),
				...(s.type === 'array' ? { direction: s.props.direction, fill: s.props.fill, values: s.props.values } : {}),
				...(s.type === 'linked-list'
					? { direction: s.props.direction, fill: s.props.fill, nodes: s.props.nodes.map((n) => n.value + (n.dx || n.dy ? '*' : '')) }
					: {}),
			}))
		)
	},
	async state() {
		return page.evaluate(() => {
			const e = window.editor
			const a = document.activeElement
			return {
				path: e.getPath(),
				editingShape: e.getEditingShapeId(),
				selected: e.getSelectedShapeIds(),
				focused: a?.getAttribute('aria-label') ?? a?.className ?? a?.tagName,
			}
		})
	},
	async eval(...js) {
		const fn = new Function('editor', `return (async () => (${js.join(' ')}))()`)
		return page.evaluate(`(${fn.toString()})(window.editor)`)
	},
	async screenshot(name = 'screenshot') {
		const file = join(OUT, `${name}.png`)
		await page.screenshot({ path: file })
		return file
	},
	async export(name = 'export') {
		const svg = await page.evaluate(async () => {
			const e = window.editor
			return (await e.getSvgString([...e.getCurrentPageShapeIds()], { background: true }))?.svg
		})
		if (!svg) throw new Error('nothing to export (page is empty)')
		const svgFile = join(OUT, `${name}.svg`)
		writeFileSync(svgFile, svg)
		const viewer = await browser.newPage()
		await viewer.setContent(`<body style="margin:0;background:white">${svg}</body>`)
		const pngFile = join(OUT, `${name}.png`)
		await viewer.locator('svg').first().screenshot({ path: pngFile })
		await viewer.close()
		return { svg: svgFile, png: pngFile, bytes: svg.length }
	},
	async wait(ms) {
		await page.waitForTimeout(+ms)
	},
	async errors() {
		return problems
	},
}

async function main() {
	const script = await new Promise((r) => {
		let s = ''
		process.stdin.on('data', (c) => (s += c)).on('end', () => r(s))
	})
	await ensureServer()
	browser = await launchBrowser()
	page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage()
	page.on('console', (m) => m.type() === 'error' && problems.push(m.text()))
	page.on('pageerror', (e) => problems.push(String(e)))
	page.on('response', (r) => r.status() >= 400 && problems.push(`HTTP ${r.status()} ${r.url()}`))

	for (const raw of script.split('\n')) {
		const line = raw.trim()
		if (!line || line.startsWith('#')) continue
		const [name, ...args] = line.split(/\s+/)
		const cmd = commands[name]
		if (!cmd) throw new Error(`unknown command: ${name} (known: ${Object.keys(commands).join(', ')})`)
		const result = await cmd(...args)
		console.log(`> ${line}${result === undefined ? '' : '\n' + JSON.stringify(result)}`)
	}
}

let code = 0
try {
	await main()
} catch (e) {
	console.error(`FAILED: ${e.message}`)
	code = 1
} finally {
	await browser?.close()
	server?.kill()
}
process.exit(code)
