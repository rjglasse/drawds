import type { MarkColor } from '../../cells/marks'
import { mulberry32 } from '../../data/random'
import type { Frame, Strip } from '../../nodelink/playback'
import { edgeCellKey } from '../../nodelink/scene'
import type { TreeNode } from '../tree/tree-shape-types'

// A trie (a prefix tree): a general tree of letters. Each node stands for a prefix, the letters along
// the edges from the root spelling it, its children in letter order; a node where a word ends holds
// that word (drawn in it), others hold nothing. Node ids are their prefixes after `^` (the root `^`),
// so a node keeps its id, marks and pointers as words come and go. Pure.

export const ROOT = '^'
export const trieId = (prefix: string) => ROOT + prefix
export const prefixOf = (id: string) => id.slice(ROOT.length)

const CURRENT: MarkColor = 'orange'
const ADDED: MarkColor = 'green'
const MISSING: MarkColor = 'red'

/** A word as a trie takes it: letters a-z (lowercased), else undefined. */
export function trieWord(input: string): string | undefined {
	const word = input.trim().toLowerCase()
	return /^[a-z]+$/.test(word) ? word : undefined
}

const rootNode = (): TreeNode => ({ id: ROOT, value: '', children: [], dx: 0, dy: 0 })

const has = (nodes: readonly TreeNode[], prefix: string) => nodes.some((n) => n.id === trieId(prefix))

/** Whether `word` ends at a node of the trie (not just a prefix of one). */
export const hasWord = (nodes: readonly TreeNode[], word: string) => nodes.some((n) => n.id === trieId(word) && n.value === word)

/** The node for `prefix` added under its parent's (which must be there), its children kept in letter order. */
function withNode(nodes: readonly TreeNode[], prefix: string): TreeNode[] {
	const parent = trieId(prefix.slice(0, -1))
	const id = trieId(prefix)
	return [
		...nodes.map((n) => (n.id === parent ? { ...n, children: [...n.children, id].sort() } : n)),
		{ id, value: '', children: [], dx: 0, dy: 0 },
	]
}

const marked = (nodes: readonly TreeNode[], prefix: string, word: boolean) =>
	nodes.map((n) => (n.id === trieId(prefix) ? { ...n, value: word ? prefix : '' } : n))

/** `word` put in: the nodes its letters need, then its end marked. */
export function insertWord(nodes: readonly TreeNode[], word: string): TreeNode[] {
	let out = nodes.length ? [...nodes] : [rootNode()]
	for (let i = 1; i <= word.length; i++) if (!has(out, word.slice(0, i))) out = withNode(out, word.slice(0, i))
	return marked(out, word, true)
}

/** The trie of these words. */
export const trieOf = (words: readonly string[]): TreeNode[] => words.reduce(insertWord, [rootNode()])

/** Every word, in order: a pre-order walk, children in letter order. */
export function wordsOf(nodes: readonly TreeNode[], from = ROOT): string[] {
	const index = new Map(nodes.map((n) => [n.id, n]))
	const out: string[] = []
	const walk = (id: string) => {
		const n = index.get(id)
		if (!n) return
		if (n.value) out.push(n.value)
		n.children.forEach((c) => c && walk(c))
	}
	walk(from)
	return out
}

/** `word` taken out: its end unmarked, then each node on its way back up that is no word's end and has no children. */
export function deleteWord(nodes: readonly TreeNode[], word: string): TreeNode[] {
	if (!hasWord(nodes, word)) return [...nodes]
	let out = marked(nodes, word, false)
	for (let i = word.length; i > 0; i--) {
		const node = out.find((n) => n.id === trieId(word.slice(0, i)))!
		if (node.value || node.children.length) break
		out = out.filter((n) => n !== node).map((n) => ({ ...n, children: n.children.filter((c) => c !== node.id) }))
	}
	return out
}

/** Words to sketch with: groups that share their beginnings, so the trie branches where they part. */
const WORDS = [
	'car', 'card', 'care', 'cart', 'cat', 'can', 'cap',
	'tea', 'ted', 'ten', 'to', 'toe', 'top', 'tone',
	'in', 'inn', 'ink', 'is', 'it',
	'she', 'sells', 'sea', 'shells', 'shore',
	'do', 'dog', 'dot', 'done',
	'bat', 'bay', 'bed', 'bee',
]

/** The most words the sketch puts in. */
export const MAX_SKETCH_WORDS = 16

/**
 * `n` words for a sketch, from a seeded start in the list and on through it, so the first ones share
 * beginnings, and one more is only ever one more (dragging further adds a word, the others stay).
 */
export function sketchWords(seed: number, n: number): string[] {
	const start = Math.floor(mulberry32(seed)() * WORDS.length)
	return Array.from({ length: Math.min(n, WORDS.length) }, (_, i) => WORDS[(start + i) % WORDS.length])
}

// Steps. A node is named by the prefix it stands for, quoted ("ca"), the root as the root.
const named = (prefix: string) => (prefix ? `"${prefix}"` : 'the root')
const edge = (prefix: string) => edgeCellKey(`${trieId(prefix.slice(0, -1))}->${trieId(prefix)}`)

/** The steps from the root along `word`'s letters, while they are there: its frames, how far it got, and the flash it leaves. */
function walk(nodes: readonly TreeNode[], word: string, call: string, stopOnMissing: boolean) {
	const frames: Frame[] = [
		{
			flash: { [ROOT]: CURRENT },
			caption: `${call}: start at the root`,
			ask: false,
			line: 'start',
			vars: { node: 'root' },
		},
	]
	let at = 0
	for (; at < word.length; at++) {
		const prefix = word.slice(0, at + 1)
		const c = word[at]
		if (!has(nodes, prefix)) {
			if (stopOnMissing) {
				frames.push({
					flash: { [trieId(word.slice(0, at))]: MISSING },
					caption: `${c}: ${named(word.slice(0, at))} has no child ${c}, so no word starts "${prefix}"`,
					ask: `${c}: does ${named(word.slice(0, at))} have a child ${c}?`,
					askFocus: [trieId(word.slice(0, at))],
					line: 'missing',
					vars: { c, node: 'null' },
				})
			}
			break
		}
		frames.push({
			flash: { [trieId(word.slice(0, at))]: null, [edge(prefix)]: CURRENT, [trieId(prefix)]: CURRENT },
			caption: `${c}: ${named(word.slice(0, at))} has a child ${c}: go down to ${named(prefix)}`,
			ask: `${c}: does ${named(word.slice(0, at))} have a child ${c}?`,
			askFocus: [trieId(word.slice(0, at))],
			line: 'down',
			vars: { c, node: `"${prefix}"` },
		})
	}
	return { frames, reached: at }
}

/** Insert `word`, step by step: down its letters, adding the nodes missing, then its end marked. */
export function insertSteps(nodes: readonly TreeNode[], word: string): { frames: Frame[]; nodes: TreeNode[] } {
	const call = `insert("${word}")`
	const { frames, reached } = walk(nodes, word, call, false)
	let now = [...nodes]
	for (let at = reached; at < word.length; at++) {
		const prefix = word.slice(0, at + 1)
		const c = word[at]
		now = withNode(now, prefix)
		frames.push({
			props: { nodes: now },
			flash: { [trieId(word.slice(0, at))]: null, [edge(prefix)]: ADDED, [trieId(prefix)]: ADDED },
			caption: `${c}: ${named(word.slice(0, at))} has no child ${c}: add one, and go down to it`,
			ask: `${c}: does ${named(word.slice(0, at))} have a child ${c}?`,
			askFocus: [trieId(word.slice(0, at))],
			line: 'add',
			vars: { c, node: `"${prefix}"` },
		})
	}
	const already = hasWord(nodes, word)
	now = marked(now, word, true)
	frames.push({
		props: { nodes: now },
		flash: { [trieId(word)]: ADDED },
		caption: already ? `"${word}" ends here already: it was in the trie, nothing changes` : `The word ends here: mark it (isWord = true): "${word}" is in the trie`,
		ask: false,
		line: 'mark',
		vars: { node: `"${word}"` },
	})
	return { frames, nodes: now }
}

/** Is `word` in the trie? Down its letters; it is if they are all there and a word ends where they stop. */
export function searchSteps(nodes: readonly TreeNode[], word: string): { frames: Frame[]; found: boolean } {
	const { frames, reached } = walk(nodes, word, `contains("${word}")`, true)
	if (reached < word.length) return { frames, found: false }
	const found = hasWord(nodes, word)
	frames.push({
		flash: { [trieId(word)]: found ? ADDED : MISSING },
		caption: found ? `Its letters all there, and a word ends at ${named(word)}: "${word}" is in the trie` : `Its letters are all there, but no word ends at ${named(word)}: only a prefix, so "${word}" isn't in the trie`,
		ask: `At ${named(word)}: is "${word}" in the trie?`,
		askFocus: [trieId(word)],
		line: 'end',
		vars: { node: `"${word}"` },
	})
	return { frames, found }
}

/**
 * The words starting with `prefix` (every word, for ''): down to its node, then every word under it,
 * collected in a pre-order walk, which finds them in alphabetical order.
 */
export function prefixSteps(nodes: readonly TreeNode[], prefix: string): { frames: Frame[]; words: string[] } {
	const call = prefix ? `startsWith("${prefix}")` : 'startsWith("")'
	const { frames, reached } = walk(nodes, prefix, call, true)
	if (reached < prefix.length) return { frames, words: [] }
	const index = new Map(nodes.map((n) => [n.id, n]))
	const words: string[] = []
	const strip = (): Strip[] => [{ title: 'words', items: [...words] }]
	// The edges down from the prefix's node to the node being looked at are lit (the calls open), a
	// word found stays green, a node left behind with none goes back to plain.
	const pathTo = (id: string) => {
		const out: string[] = []
		for (let p = prefixOf(id); p.length > prefix.length; p = p.slice(0, -1)) out.push(edge(p))
		return out
	}
	let lit: string[] = []
	let previous: string | undefined
	const visit = (id: string) => {
		const n = index.get(id)!
		const p = prefixOf(id)
		if (n.value) words.push(n.value)
		const path = pathTo(id)
		const flash: Record<string, MarkColor | null> = {
			...Object.fromEntries(lit.filter((e) => !path.includes(e)).map((e) => [e, null])),
			...Object.fromEntries(path.map((e) => [e, CURRENT])),
			...(previous && !index.get(previous)!.value ? { [previous]: null } : {}),
			[id]: n.value ? ADDED : CURRENT,
		}
		frames.push({
			flash,
			strips: strip(),
			caption: n.value
				? `collect(${named(p)}): a word ends here: "${n.value}" (${words.length})`
				: `collect(${named(p)}): no word ends here; on to its children${n.children.length ? `, ${n.children.map((c) => prefixOf(c!).slice(-1)).join(', ')}` : ''}`,
			ask: `collect(${named(p)}): does a word end here?`,
			askFocus: [id],
			line: 'word',
			vars: { word: `"${p}"` },
		})
		lit = path
		previous = id
		n.children.forEach((c) => c && visit(c))
	}
	visit(trieId(prefix))
	frames.push({
		flash: {
			...Object.fromEntries(lit.map((e) => [e, null])),
			...(previous && !index.get(previous)!.value ? { [previous]: null } : {}),
		},
		strips: strip(),
		caption: words.length
			? `${words.length} word${words.length === 1 ? '' : 's'}${prefix ? ` starting "${prefix}"` : ''}, in order: ${words.join(', ')}`
			: `No word starts "${prefix}": the prefix is there, but no word ends under it`,
		ask: false,
	})
	return { frames, words }
}

/**
 * Delete `word`, step by step (the recursion, as the code has it): down its letters, its end
 * unmarked, then on the way back up each node that is no word's end and has no children goes.
 */
export function deleteSteps(nodes: readonly TreeNode[], word: string): { frames: Frame[]; nodes: TreeNode[] } {
	const frames: Frame[] = []
	if (!hasWord(nodes, word)) {
		const { frames: down } = walk(nodes, word, `delete("${word}")`, true)
		frames.push(...down, { caption: `"${word}" isn't in the trie: nothing to delete`, ask: false })
		return { frames, nodes: [...nodes] }
	}
	for (let d = 0; d < word.length; d++) {
		const prefix = word.slice(0, d)
		frames.push({
			flash: { ...(d ? { [trieId(word.slice(0, d - 1))]: null, [edge(prefix)]: CURRENT } : {}), [trieId(prefix)]: CURRENT },
			caption: `delete at ${named(prefix)}: the next letter is ${word[d]}, go down`,
			ask: d ? 'Which call comes next?' : false,
			line: 'down',
			vars: { node: prefix ? `"${prefix}"` : 'root' },
		})
	}
	let now = marked(nodes, word, false)
	frames.push({
		props: { nodes: now },
		flash: { [trieId(word.slice(0, -1))]: null, [edge(word)]: CURRENT, [trieId(word)]: MISSING },
		caption: `At ${named(word)}, the word's end: unmark it (isWord = false)`,
		ask: false,
		line: 'unmark',
		vars: { node: `"${word}"` },
	})
	for (let i = word.length; i > 0; i--) {
		const prefix = word.slice(0, i)
		const node = now.find((n) => n.id === trieId(prefix))!
		if (node.value || node.children.length) {
			const why = node.value ? 'a word ends there' : `it still has ${node.children.length === 1 ? 'a child' : 'children'}`
			frames.push({
				flash: { [trieId(prefix)]: ADDED },
				caption: `${named(prefix)} stays: ${why}. So does everything above it`,
				ask: `Back at ${named(prefix)}: does it stay?`,
				askFocus: [trieId(prefix)],
				line: 'keep',
				vars: { node: `"${prefix}"` },
			})
			return { frames, nodes: now }
		}
		now = now.filter((n) => n !== node).map((n) => ({ ...n, children: n.children.filter((c) => c !== node.id) }))
		frames.push({
			props: { nodes: now },
			flash: { [trieId(prefix)]: null, [trieId(prefix.slice(0, -1))]: CURRENT },
			caption: `${named(prefix)}: no word ends there and it has no children: back at ${named(prefix.slice(0, -1))}, remove it`,
			ask: `Back at ${named(prefix.slice(0, -1))}: does ${named(prefix)} stay?`,
			askFocus: [trieId(prefix)],
			line: 'prune',
			vars: { node: prefix.length > 1 ? `"${prefix.slice(0, -1)}"` : 'root' },
		})
	}
	frames.push({ caption: `"${word}" is gone, and every node only it needed`, ask: false })
	return { frames, nodes: now }
}
