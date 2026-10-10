import { expect, test, type Page } from '@playwright/test'
import type { ArrayShapeProps } from '../src/shapes/array/array-shape-types'
import type { ListShapeProps } from '../src/shapes/list/list-shape-types'
import { open, shapesOfType, sketchArray, sketchList, withEditor } from './helpers'

const seedInput = (page: Page) => page.getByTestId('seed-input')
const pin = (page: Page) => page.getByTestId('seed-pin')

test.beforeEach(({ page }) => open(page))

test('type a seed with the tool out: every array drawn gets it, the same values; unpin for random again', async ({ page }) => {
	await page.keyboard.press('Shift+A')
	await expect(seedInput(page)).toHaveValue('')
	await seedInput(page).fill('42')
	await page.keyboard.press('Enter')
	await expect(pin(page)).toHaveAttribute('data-pinned', 'true')
	// Typing digits in the field neither marked anything nor switched tools.
	expect(await withEditor(page, (e) => e.getCurrentToolId())).toBe('array')

	await sketchArray(page, [300, 200], 6)
	await sketchArray(page, [300, 400], 6)
	const [a, b] = await shapesOfType<ArrayShapeProps>(page, 'array')
	expect([a.props.seed, b.props.seed]).toEqual([42, 42])
	expect(b.props.values).toEqual(a.props.values)

	// Selected, the field shows its seed, pinned; the lock unpins.
	await expect(seedInput(page)).toHaveValue('42')
	await expect(seedInput(page)).toHaveAttribute('readonly', '')
	await pin(page).click()
	expect(await page.evaluate(() => localStorage.getItem('drawds:seed'))).toBeNull()
	await sketchArray(page, [300, 600], 6)
	const fresh = (await shapesOfType<ArrayShapeProps>(page, 'array'))[2]
	expect(fresh.props.seed).not.toBe(42)
	expect(fresh.props.seed).toBeLessThanOrEqual(9999)
})

test("pin a list's seed and draw it again; the pin outlasts a reload", async ({ page }) => {
	await sketchList(page, [200, 200], 4)
	const [first] = await shapesOfType<ListShapeProps>(page, 'linked-list')
	await expect(seedInput(page)).toHaveValue(String(first.props.seed))
	await pin(page).click()
	await expect(pin(page)).toHaveAttribute('data-pinned', 'true')
	await sketchList(page, [200, 400], 4)
	const [, again] = await shapesOfType<ListShapeProps>(page, 'linked-list')
	expect(again.props.seed).toBe(first.props.seed)
	expect(again.props.nodes.map((n) => n.value)).toEqual(first.props.nodes.map((n) => n.value))

	await page.reload()
	await page.waitForFunction(() => !!window.editor)
	await page.keyboard.press('Shift+A')
	await expect(seedInput(page)).toHaveValue(String(first.props.seed))
	// A structure with another seed selected: the pin shows underneath, with its x.
	await sketchArray(page, [300, 600], 3)
	await withEditor(page, (e) => void e.updateShape({ id: e.getOnlySelectedShapeId()!, type: 'array', props: { seed: 12345 } }))
	await expect(page.getByTestId('seed-pinned-note')).toContainText(`Pinned: ${first.props.seed}`)
	await page.getByTestId('seed-unpin').click()
	await expect(page.getByTestId('seed-pinned-note')).toHaveCount(0)
	expect(await page.evaluate(() => localStorage.getItem('drawds:seed'))).toBeNull()
})
