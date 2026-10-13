import { describe, expect, it } from 'vitest'
import { trieScene } from './layout'
import { deleteSteps, deleteWord, hasWord, insertSteps, insertWord, prefixSteps, searchSteps, sketchWords, trieOf, trieWord, wordsOf } from './trie'

const trie = trieOf(['tea', 'ten', 'to', 'inn', 'in', 'ted'])
const ids = (nodes: { id: string }[]) => nodes.map((n) => n.id).sort()

describe('a trie', () => {
	it('a node per prefix, children in letter order, a word held where it ends', () => {
		expect(ids(trie)).toEqual(['^', '^i', '^in', '^inn', '^t', '^te', '^tea', '^ted', '^ten', '^to'])
		expect(trie.find((n) => n.id === '^te')!.children).toEqual(['^tea', '^ted', '^ten'])
		expect(trie.find((n) => n.id === '^')!.children).toEqual(['^i', '^t'])
		expect(trie.find((n) => n.id === '^in')!.value).toBe('in')
		expect(trie.find((n) => n.id === '^te')!.value).toBe('')
		expect(hasWord(trie, 'te')).toBe(false)
		expect(hasWord(trie, 'ten')).toBe(true)
	})

	it('lists its words in alphabetical order (a pre-order walk)', () => {
		expect(wordsOf(trie)).toEqual(['in', 'inn', 'tea', 'ted', 'ten', 'to'])
		expect(wordsOf(insertWord(trie, 'a'))[0]).toBe('a')
	})

	it('deleting a word unmarks its end, then prunes the nodes only it needed', () => {
		expect(ids(deleteWord(trie, 'ted'))).toEqual(ids(trie).filter((id) => id !== '^ted'))
		// "in" still leads to "inn": its node stays, unmarked.
		const noIn = deleteWord(trie, 'in')
		expect(ids(noIn)).toEqual(ids(trie))
		expect(noIn.find((n) => n.id === '^in')!.value).toBe('')
		expect(ids(deleteWord(noIn, 'inn'))).toEqual(['^', '^t', '^te', '^tea', '^ted', '^ten', '^to'])
		expect(deleteWord(trie, 'te')).toEqual(trie)
	})

	it('takes words of letters a to z, lowercased', () => {
		expect(trieWord(' Cat ')).toBe('cat')
		expect(trieWord('it’s')).toBeUndefined()
		expect(trieWord('')).toBeUndefined()
	})

	it('sketches with more words only adding words', () => {
		const few = sketchWords(5, 4)
		expect(sketchWords(5, 7).slice(0, 4)).toEqual(few)
		expect(new Set(sketchWords(5, 16)).size).toBe(16)
	})

	it('is drawn with a letter on each edge, nothing typed into its nodes', () => {
		const scene = trieScene({ nodes: trie, size: 'm' })
		expect(scene.edges.find((e) => e.to === '^tea')!.label).toBe('a')
		expect(scene.nodes.every((n) => !n.editable)).toBe(true)
		expect(scene.nodes.find((n) => n.key === '^inn')!.value).toBe('inn')
	})
})

describe('step by step', () => {
	it('insert: down the letters there, adding the ones missing, then the end marked', () => {
		const { frames, nodes } = insertSteps(trie, 'tent')
		expect(frames.map((f) => f.line)).toEqual(['start', 'down', 'down', 'down', 'add', 'mark'])
		expect(frames[4].caption).toBe('t: "ten" has no child t: add one, and go down to it')
		expect(frames[4].props!.nodes).toHaveLength(trie.length + 1)
		expect(wordsOf(nodes)).toContain('tent')
		expect(insertSteps(trie, 'ten').frames.at(-1)!.caption).toBe('"ten" ends here already: it was in the trie, nothing changes')
	})

	it('contains: found, only a prefix, or a letter missing', () => {
		expect(searchSteps(trie, 'ted').found).toBe(true)
		const prefix = searchSteps(trie, 'te')
		expect(prefix.found).toBe(false)
		expect(prefix.frames.at(-1)!.line).toBe('end')
		const missing = searchSteps(trie, 'tax')
		expect(missing.found).toBe(false)
		expect(missing.frames.at(-1)).toMatchObject({ line: 'missing', caption: 'a: "t" has no child a, so no word starts "ta"' })
	})

	it('startsWith: down to the prefix, then the words under it in order', () => {
		expect(prefixSteps(trie, 'te').words).toEqual(['tea', 'ted', 'ten'])
		expect(prefixSteps(trie, '').words).toEqual(wordsOf(trie))
		expect(prefixSteps(trie, 'x').words).toEqual([])
		expect(prefixSteps(trie, 'te').frames.at(-1)!.caption).toBe('3 words starting "te", in order: tea, ted, ten')
	})

	it('delete: down, the end unmarked, then pruned on the way back up while nothing else needs a node', () => {
		const { frames, nodes } = deleteSteps(trie, 'inn')
		expect(frames.map((f) => f.line)).toEqual(['down', 'down', 'down', 'unmark', 'prune', 'keep'])
		expect(frames.at(-1)!.caption).toBe('"in" stays: a word ends there. So does everything above it')
		expect(ids(nodes)).toEqual(ids(deleteWord(trie, 'inn')))
		const gone = deleteSteps(trieOf(['to', 'tea']), 'tea')
		expect(gone.frames.map((f) => f.line)).toEqual(['down', 'down', 'down', 'unmark', 'prune', 'prune', 'keep'])
		expect(deleteSteps(trie, 'te').frames.at(-1)!.caption).toBe('"te" isn\'t in the trie: nothing to delete')
	})
})
