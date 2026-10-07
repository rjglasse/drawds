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
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
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
// Binary tree level height at size "m" (src/shapes/tree/layout.ts).
const TREE_LEVEL = CELL * 1.6
// Distance between nodes dropped along a graph sketch at size "m" (src/shapes/graph/generate.ts).
const GRAPH_STEP = CELL * 2.3

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
	// Sketch a binary tree with `depth` levels, root centred on (x, y). `lean` from -1 (a bare stick)
	// through 0 (random) to 1 (a perfect tree) sets how full it is.
	async tree(x, y, depth, lean = 0) {
		await page.keyboard.press('Shift+T')
		await commands.drag(x, y, +x + +lean * 2 * CELL, +y + (+depth - 1) * TREE_LEVEL + 10)
		return commands.shapes()
	},
	// Sketch a heap of n values (inserted one per cell-width dragged right), root centred on (x, y).
	async heap(x, y, n) {
		await page.keyboard.press('Shift+P')
		await commands.drag(x, y, +x + (+n - 1) * CELL + 10, +y)
		return commands.shapes()
	},
	// Sketch a graph of n nodes along a serpentine path: rows of `cols` nodes (default 3), the first
	// node centred on (x, y), rows GRAPH_STEP apart. `cols` = n gives a straight line.
	async graph(x, y, n, cols = 3) {
		const path = [[+x, +y]]
		let [px, py, dir] = [+x, +y, 1]
		let left = (+n - 1) * GRAPH_STEP + 8
		while (left > 0) {
			const run = Math.min(left, (+cols - 1) * GRAPH_STEP || left)
			px += dir * run
			path.push([px, py])
			left -= run
			if (left <= 0) break
			const down = Math.min(left, GRAPH_STEP)
			py += down
			path.push([px, py])
			left -= down
			dir = -dir
		}
		await page.keyboard.press('Shift+G')
		await page.mouse.move(path[0][0], path[0][1])
		await page.mouse.down()
		// One small move per frame, as a hand would: tldraw coalesces faster moves, cutting corners.
		for (let i = 1; i < path.length; i++) {
			const [ax, ay] = path[i - 1]
			const [bx, by] = path[i]
			const steps = Math.ceil(Math.hypot(bx - ax, by - ay) / 8)
			for (let j = 1; j <= steps; j++) {
				await page.mouse.move(ax + ((bx - ax) * j) / steps, ay + ((by - ay) * j) / steps)
				await page.waitForTimeout(16)
			}
		}
		await page.mouse.up()
		return commands.shapes()
	},
	// Drag a node's connect grip (graphs) onto another node (`connect v0 v3`) or to a page point
	// (`connect v0 700 500`), which makes a new node there.
	async connect(from, ...to) {
		const at = await page.evaluate(
			({ from, to }) => {
				const e = window.editor
				const shape = e.getOnlySelectedShape()
				const handle = shape && e.getShapeHandles(shape)?.find((h) => h.id === 'connect:' + from)
				if (!handle) return null
				const toPage = (p) => e.pageToScreen(e.getShapePageTransform(shape).applyToPoint(p))
				const start = toPage(handle)
				let end
				if (to.length === 1) {
					const node = e.getShapeUtil(shape).getScene(shape).nodes.find((n) => n.key === to[0])
					if (!node) return null
					end = toPage(node)
				} else end = e.pageToScreen({ x: +to[0], y: +to[1] })
				return [start.x, start.y, end.x, end.y]
			},
			{ from, to }
		)
		if (!at) throw new Error(`no connect grip on ${from} or no target ${to.join(' ')} (select one graph first)`)
		await commands.drag(...at)
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
				...(s.type === 'heap' ? { heapType: s.props.heapType, values: s.props.values, marks: s.props.marks } : {}),
				...(s.type === 'graph'
					? (() => {
							const label = Object.fromEntries(s.props.nodes.map((n) => [n.id, n.value]))
							const arrow = s.props.direction === 'directed' ? '->' : '-'
							return {
								direction: s.props.direction,
								weights: s.props.weights,
								labels: s.props.labels,
								nodes: s.props.nodes.map((n) => `${n.id}=${n.value}`),
								edges: s.props.edges.map((e) => `${label[e.from]}${arrow}${label[e.to]}:${e.weight}`),
								marks: s.props.marks,
							}
						})()
					: {}),
				...(s.type === 'binary-tree' ? { nulls: s.props.nulls, fill: s.props.fill, nodes: s.props.nodes.map((n) => n.id + '=' + n.value + (n.dx || n.dy ? '*' : '')) } : {}),
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
	// Full page, or just the clip x y w h (with SCALE=3 in the environment, at 3x for small controls).
	async screenshot(name = 'screenshot', x, y, w, h) {
		const file = join(OUT, `${name}.png`)
		await page.screenshot({ path: file, ...(h === undefined ? {} : { clip: { x: +x, y: +y, width: +w, height: +h } }) })
		return file
	},
	// Just the drawing: a screenshot clipped to every shape on the page (plus the play bar, strips and
	// step pointers while an operation is open), `pad` px around it. Deselects first, moves the pointer
	// out of the way and hides tldraw's UI, so no selection box, hover buttons or panels show. With
	// SCALE=2 for crisp images.
	async shot(name = 'shot', pad = '16') {
		await page.evaluate(() => void window.editor.selectNone())
		await page.mouse.move(2, 2)
		await page.waitForTimeout(400)
		const box = await page.evaluate(() => {
			const e = window.editor
			const rects = [...e.getCurrentPageShapeIds()].flatMap((id) => {
				const b = e.getShapePageBounds(id)
				if (!b) return []
				const a = e.pageToViewport({ x: b.minX, y: b.minY })
				const z = e.pageToViewport({ x: b.maxX, y: b.maxY })
				return [{ x: a.x, y: a.y, r: z.x, b: z.y }]
			})
			for (const el of document.querySelectorAll('[data-testid="play-bar"], [data-testid="playback-strip"], [data-pointer]')) {
				const r = el.getBoundingClientRect()
				if (r.width && r.height) rects.push({ x: r.left, y: r.top, r: r.right, b: r.bottom })
			}
			if (!rects.length) return undefined
			return {
				x: Math.min(...rects.map((r) => r.x)),
				y: Math.min(...rects.map((r) => r.y)),
				r: Math.max(...rects.map((r) => r.r)),
				b: Math.max(...rects.map((r) => r.b)),
			}
		})
		if (!box) throw new Error('nothing to shoot (page is empty)')
		const p = +pad
		const x = Math.max(0, box.x - p)
		const y = Math.max(0, box.y - p)
		const file = join(OUT, `${name}.png`)
		// tldraw's own UI (style panel, toolbar, menus) hidden, so a wide drawing never has it in the picture.
		const hide = await page.addStyleTag({ content: '.tlui-layout { visibility: hidden !important; }' })
		await page.screenshot({ path: file, clip: { x, y, width: box.r + p - x, height: box.b + p - y } })
		await hide.evaluate((el) => el.remove())
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
	// Every step of the open operation as numbered images (as the play bar's export makes them), into
	// OUT/<name>/: 01-caption.png..., plus steps.json (file, caption, size). Options as key=value:
	// format=png|svg, scale=2, aspect=1.7778 (16:9 for slides), captions=off (leave them for the slide),
	// background=off (transparent, to sit on a slide's own background).
	async steps(name = 'steps', ...options) {
		const o = Object.fromEntries(options.map((kv) => kv.split('=')))
		const images = await page.evaluate((o) => window.drawdsSteps(o), {
			format: o.format ?? 'png',
			scale: +(o.scale ?? 2),
			aspect: o.aspect ? +o.aspect : undefined,
			captions: o.captions !== 'off',
			background: o.background !== 'off',
		})
		if (!images.length) throw new Error('no operation open')
		// A fresh folder: no steps left over from an earlier export.
		const dir = join(OUT, name)
		rmSync(dir, { recursive: true, force: true })
		mkdirSync(dir, { recursive: true })
		for (const image of images) writeFileSync(join(dir, image.name), Buffer.from(image.base64, 'base64'))
		const manifest = images.map(({ name, caption, header, width, height }) => ({ file: name, header, caption, width, height }))
		writeFileSync(join(dir, 'steps.json'), JSON.stringify(manifest, null, 2))
		return { dir, files: images.map((i) => i.name), size: [images[0].width, images[0].height] }
	},
	// Every operation in the board's lesson log, replayed as it was and exported: OUT/<name>/01-1042-insert-key/
	// 01-caption.png..., plus lesson.json (each operation's times, each step's caption and when it was shown,
	// to line up with a transcript), and a steps.json in each folder for deck.py. Options as for steps.
	async lesson(name = 'lesson', ...options) {
		const o = Object.fromEntries(options.map((kv) => kv.split('=')))
		const { manifest, files } = await page.evaluate((o) => window.drawdsLesson(o), {
			format: o.format ?? 'png',
			scale: +(o.scale ?? 2),
			aspect: o.aspect ? +o.aspect : undefined,
			captions: o.captions !== 'off',
			background: o.background !== 'off',
		})
		// A fresh folder: no operations left over from an earlier export.
		const dir = join(OUT, name)
		rmSync(dir, { recursive: true, force: true })
		for (const file of files) {
			mkdirSync(dirname(join(dir, file.path)), { recursive: true })
			writeFileSync(join(dir, file.path), Buffer.from(file.base64, 'base64'))
		}
		mkdirSync(dir, { recursive: true })
		writeFileSync(join(dir, 'lesson.json'), JSON.stringify(manifest, null, 2))
		// Each operation's folder gets the steps.json deck.py reads, as `steps` writes.
		for (const op of manifest.operations) {
			const steps = op.steps.map((step) => ({ file: step.file.split('/').pop(), header: step.header, caption: step.caption }))
			writeFileSync(join(dir, op.folder, 'steps.json'), JSON.stringify(steps, null, 2))
		}
		return { dir, operations: manifest.operations.map((op) => `${op.folder} (${op.steps.length} steps, ${op.outcome})`) }
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
	page = await (await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: Number(process.env.SCALE ?? 1) })).newPage()
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
