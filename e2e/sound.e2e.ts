import { expect, test, type Page } from '@playwright/test'
import { arrayStep, open, rightClick, sketchArray } from './helpers'

// The easter egg: running bogosort turns drawds' sounds on for the tab (a note per value a step
// touches, notes for moves by hand), in a scale and key the speaker's menu picks, until it turns them off.

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
				// Ended as soon as stopped, so the player's count of sounding notes goes down as a browser's does.
				stop() {
					setTimeout(() => (this as unknown as { onended?: () => void }).onended?.(), 0)
				},
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
	await expect(page.getByTestId('sound-menu.button')).toHaveCount(0)

	await rightClick(page, [200, 200])
	await page.getByTestId('context-menu-sub.drawds-array-steps-button').click()
	await arrayStep(page, 'array-bogosort')
	await expect(page.getByTestId('sound-menu.button')).toHaveText('C major pentatonic')
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

	// The speaker's menu: a scale (quietly: it may change while a sort plays), a key, and off.
	await page.getByTestId('sound-menu.button').click()
	await page.waitForTimeout(400)
	const picked = await notes(page)
	await page.getByRole('menuitemcheckbox', { name: /^Blues/ }).click()
	await expect(page.getByTestId('sound-menu.button')).toHaveText('C blues')
	await expect(page.getByText('Minor pentatonic with the ♭5 added: the blue note')).toBeVisible()
	expect(await notes(page)).toBe(picked)
	// The final boss is last.
	await expect(page.getByRole('menuitemcheckbox').last()).toHaveText(/^Twelve-tone row: E F G D♭ G♭ E♭ A♭ D B C A B♭/)
	await page.getByTestId('menu-sub.sound-key-button').click()
	// Into the submenu and down it, as a hand moves (straight to D would cross the menu's last item and close it).
	// (The checked one's name starts "Checked".)
	const centre = async (name: string) => {
		const item = page.getByRole('menuitemcheckbox', { name: new RegExp(`^(Checked )?${name}$`) })
		await expect(item).toBeVisible()
		const box = (await item.boundingBox())!
		return [box.x + 12, box.y + box.height / 2] as const
	}
	await page.mouse.move(...(await centre('C')), { steps: 4 })
	const d = await centre('D')
	await page.mouse.move(...d, { steps: 4 })
	await page.mouse.click(...d)
	await expect(page.getByTestId('sound-menu.button')).toHaveText('D blues')
	// Off: steps are quiet again.
	await page.getByTestId('menu.sound-off').click()
	await expect(page.getByTestId('sound-menu.button')).toHaveCount(0)
	const off = await notes(page)
	await rightClick(page, [200, 200])
	await page.getByTestId('context-menu-sub.drawds-array-steps-button').click()
	await arrayStep(page, 'array-insertion-sort')
	await page.keyboard.press('ArrowRight')
	await page.keyboard.press('ArrowRight')
	expect(await notes(page)).toBe(off)
})

test('bozosort, two swapped at random until sorted, turns the sounds on too', async ({ page }) => {
	await page.addInitScript(fakeAudio)
	await open(page)
	await sketchArray(page, [200, 200], 5)
	await rightClick(page, [200, 200])
	await page.getByTestId('context-menu-sub.drawds-array-steps-button').click()
	await arrayStep(page, 'array-bozosort')
	await expect(page.getByTestId('sound-menu.button')).toBeVisible()
	await expect(page.getByTestId('play-caption')).toContainText('Bozosort: swap two at random until sorted')
	await page.keyboard.press('ArrowRight')
	await page.keyboard.press('ArrowRight')
	await expect.poll(() => notes(page)).toBeGreaterThan(0)
})
