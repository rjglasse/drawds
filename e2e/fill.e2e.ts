import { expect, test, type Page } from '@playwright/test'
import type { ArrayShapeProps } from '../src/shapes/array/array-shape-types'
import type { ListShapeProps } from '../src/shapes/list/list-shape-types'
import { open, shapesOfType, sketchArray, sketchList, withEditor } from './helpers'

const pickFill = async (page: Page, mode: string) => {
	await page.getByTestId('style.fill-mode').click()
	await page.getByTestId(`style.fill-mode.${mode}`).click()
}
const nums = (values: string[]) => values.map(Number)
const sorted = (values: number[]) => [...values].sort((a, b) => a - b)

test.beforeEach(({ page }) => open(page))

test('changing the fill mode regenerates the selected shape from its seed', async ({ page }) => {
	await sketchList(page, [200, 150], 5)
	const list = async () => (await shapesOfType<ListShapeProps>(page, 'linked-list'))[0].props
	const random = nums((await list()).nodes.map((n) => n.value))

	await pickFill(page, 'ascending')
	expect((await list()).fill).toBe('ascending')
	// Same numbers, now sorted.
	expect(nums((await list()).nodes.map((n) => n.value))).toEqual(sorted(random))

	await page.keyboard.press('ControlOrMeta+z')
	expect(nums((await list()).nodes.map((n) => n.value))).toEqual(random)
})

test('new shapes use the last picked fill mode', async ({ page }) => {
	await page.keyboard.press('Shift+A')
	await pickFill(page, 'descending')
	await sketchArray(page, [700, 300], 6, 'left')
	const [array] = await shapesOfType<ArrayShapeProps>(page, 'array')
	expect(array.props.fill).toBe('descending')
	expect(nums(array.props.values)).toEqual(sorted(nums(array.props.values)).reverse())

	await pickFill(page, 'letters')
	const [lettered] = await shapesOfType<ArrayShapeProps>(page, 'array')
	expect(lettered.props.values.every((v) => /^[A-Z]$/.test(v))).toBe(true)
	expect(await withEditor(page, (e) => e.getSelectedShapeIds().length)).toBe(1)
})
