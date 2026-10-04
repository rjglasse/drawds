import { T } from 'tldraw'

/**
 * A named pointer on an element of a structure (i on an array cell, curr on a list node...): what
 * a teacher draws as a labelled arrow. `at` is the element's key: a cell index, a node id, or a
 * position just off the structure (an array's -1 or n, a list's null).
 */
export interface Pointer {
	id: string
	name: string
	at: string
}

export const pointersValidator = T.arrayOf(T.object({ id: T.string, name: T.string, at: T.string }))

function nextId(pointers: readonly Pointer[]) {
	const used = pointers.map((p) => Number(p.id.slice(1))).filter(Number.isFinite)
	return `p${used.length ? Math.max(...used) + 1 : 0}`
}

/** Point `name` at `at`: moves the pointer with that name if there is one, else adds it. */
export function placePointer(pointers: readonly Pointer[], name: string, at: string): Pointer[] {
	if (pointers.some((p) => p.name === name)) return pointers.map((p) => (p.name === name ? { ...p, at } : p))
	return [...pointers, { id: nextId(pointers), name, at }]
}

export function movePointer(pointers: readonly Pointer[], id: string, at: string): Pointer[] {
	return pointers.map((p) => (p.id === id ? { ...p, at } : p))
}

/** Rename a pointer; another pointer that had the new name goes (names are unique on a shape). */
export function renamePointer(pointers: readonly Pointer[], id: string, name: string): Pointer[] {
	return pointers.filter((p) => p.id === id || p.name !== name).map((p) => (p.id === id ? { ...p, name } : p))
}

export function removePointer(pointers: readonly Pointer[], id: string): Pointer[] {
	return pointers.filter((p) => p.id !== id)
}

/** Drop pointers whose element has gone (ids can be reused, e.g. a tree's path ids). */
export function prunePointers(pointers: readonly Pointer[], live: Iterable<string>): Pointer[] {
	const keep = new Set(live)
	return pointers.filter((p) => keep.has(p.at))
}

/**
 * Built-in markers that a structure draws like pointers (a stack's top, a queue's front and rear)
 * have ids starting with this. They aren't stored with the shape's pointers and can't be moved.
 */
export const BUILT_IN = '@'
export const isBuiltIn = (p: Pointer) => p.id.startsWith(BUILT_IN)
