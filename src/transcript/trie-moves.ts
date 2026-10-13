// A trie's moves, as its transcript keeps them (as `tree-moves.ts` for trees). What the log follows
// is its words, in order: where its nodes are drawn, and which ones it needs, follow from them.
// Words go in and out by its own insert and delete, played step by step (calls, their word told).

export type TrieMove =
	| { op: 'new'; name: string; words: string[] }
	| { op: 'insert'; word: string }
	| { op: 'delete'; word: string }
	/** An operation played step by step and put in: its algorithm's call, the word it was called with. */
	| { op: 'call'; algorithm: string; label: string; effect: TrieMove[]; args?: { word?: string } }

/** Whether two tries hold the same words. */
export const sameWords = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((w, i) => w === b[i])

/** The words put in, then the words taken out. */
export function diffTrie(prev: readonly string[], next: readonly string[]): TrieMove[] {
	const [before, after] = [new Set(prev), new Set(next)]
	return [
		...next.filter((w) => !before.has(w)).map((word): TrieMove => ({ op: 'insert', word })),
		...prev.filter((w) => !after.has(w)).map((word): TrieMove => ({ op: 'delete', word })),
	]
}

/** The word an operation was called with, when one word went in or out. */
export function trieArgs(prev: readonly string[], next: readonly string[]): { word?: string } {
	const moves = diffTrie(prev, next)
	return moves.length === 1 ? { word: (moves[0] as { word: string }).word } : {}
}
