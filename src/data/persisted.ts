import { atom } from 'tldraw'

/**
 * A setting kept per browser in localStorage under `key` (the play bar's speed, predict mode, the caption
 * size, colour-blind cues, a pinned seed): an atom, so reading it is reactive, read once as the page loads
 * and written as it changes. `parse` turns what is stored (null: nothing) into the value, `store` the value
 * into what is stored (null: remove it). Storage can be unavailable (a private window): the setting then
 * lasts for the page.
 */
export function persistedAtom<T>(name: string, key: string, parse: (stored: string | null) => T, store: (value: T) => string | null) {
	let stored: string | null = null
	try {
		stored = typeof window === 'undefined' ? null : window.localStorage.getItem(key)
	} catch {
		// Unavailable: the default.
	}
	const value = atom<T>(name, parse(stored))
	return {
		/** The setting. Reactive. */
		get: () => value.get(),
		set(next: T) {
			value.set(next)
			try {
				const s = store(next)
				if (s === null) window.localStorage.removeItem(key)
				else window.localStorage.setItem(key, s)
			} catch {
				// Storage can be unavailable (private windows); the setting then lasts for this page.
			}
		},
	}
}

/** An on / off setting, stored as 'on' or 'off'. */
export const persistedFlag = (name: string, key: string, byDefault = false) =>
	persistedAtom(name, key, (s) => (s === null ? byDefault : s === 'on'), (on) => (on ? 'on' : 'off'))
