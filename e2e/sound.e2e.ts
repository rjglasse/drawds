import { expect, test, type Page } from '@playwright/test'
import { arrayStep, open, rightClick, sketchArray } from './helpers'

// The easter egg: running bogosort turns drawds' sounds on for the tab (a note per value a step
// touches, notes for moves by hand), until the speaker button turns them off.

/** The browser's audio, faked: counts the notes started. */
const fakeAudio = () => {
	const node = () => ({ connect() {}, gain: { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, threshold: { value: 0 }, ratio: { value: 0 } })
	class FakeContext {
		currentTime = 0
		destination = {}
		resume() {
			return Promise.resolve()
		}
		createGain() {
			return node()
		}
		createDynamicsCompressor() {
			return node()
		}
		createOscillator() {
			return {
				...node(),
				type: 'sine',
				frequency: { value: 0 },
				start() {
					;(window as unknown as { notes: number }).notes++
				},
				stop() {},
				onended: null,
			}
		}
	}
	;(window as unknown as { notes: number }).notes = 0
	;(window as unknown as { AudioContext: unknown }).AudioContext = FakeContext
}

/** Notes started (each blip starts two tones). */
const notes = (page: Page) => page.evaluate(() => (window as unknown as { notes: number }).notes)

test('bogosort turns the sounds on: its steps and moves by hand play notes, until the speaker turns them off', async ({ page }) => {
	await page.addInitScript(fakeAudio)
	await open(page)
	await sketchArray(page, [200, 200], 6)
	expect(await notes(page)).toBe(0)
	await expect(page.getByTestId('sound-off')).toHaveCount(0)

	await rightClick(page, [200, 200])
	await page.getByTestId('context-menu-sub.drawds-array-steps-button').click()
	await arrayStep(page, 'array-bogosort')
	await expect(page.getByTestId('sound-off')).toBeVisible()
	await page.keyboard.press('ArrowRight')
	await page.keyboard.press('ArrowRight')
	await expect.poll(() => notes(page)).toBeGreaterThan(0)

	// Stopped, then a move by hand: a value typed plays its note.
	await page.keyboard.press('Escape')
	const before = await notes(page)
	await page.mouse.dblclick(200, 200)
	await page.keyboard.type('7')
	await page.keyboard.press('Enter')
	await expect.poll(() => notes(page)).toBeGreaterThan(before)

	// The speaker turns them off: steps are quiet again.
	await page.getByTestId('sound-off').click()
	await expect(page.getByTestId('sound-off')).toHaveCount(0)
	const off = await notes(page)
	await rightClick(page, [200, 200])
	await page.getByTestId('context-menu-sub.drawds-array-steps-button').click()
	await arrayStep(page, 'array-insertion-sort')
	await page.keyboard.press('ArrowRight')
	await page.keyboard.press('ArrowRight')
	expect(await notes(page)).toBe(off)
})
