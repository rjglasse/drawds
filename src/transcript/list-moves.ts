// A linked list's moves, as its transcript keeps them (as `array-moves.ts` for arrays). Its nodes
// have ids, so a change is told exactly: which node came, went or got a new value, wherever it is.

export type ListMove =
	| { op: 'new'; name: string; values: string[] }
	/** Node i's value. */
	| { op: 'set'; i: number; v: string }
	| { op: 'insertAtHead'; v: string }
	| { op: 'append'; v: string }
	/** A node after node i - 1 (neither the head nor the end). */
	| { op: 'insert'; i: number; v: string }
	/** Node i out: by its value (`first`: no node before it holds the same), else by its place. */
	| { op: 'remove'; i: number; v: string; first: boolean }
	| { op: 'reverse' }
	/** The last node's next (`last` its index): node `to` (a cycle), or null (none). */
	| { op: 'cycle'; last: number; to: number | null }
	| { op: 'assign'; values: string[] }
	| { op: 'call'; algorithm: string; label: string; effect: ListMove[] }

/** What a list's transcript follows: its nodes (id and value, in order) and where its last node points. */
export interface ListState {
	ids: string[]
	values: string[]
	/** The index the last node's next points at, or null. */
	cycle: number | null
}

const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((v, i) => v === b[i])

/**
 * The moves that take a list from `prev` to `next`: a value set, a node in at the head, at the end or
 * after another, a node out, the whole list reversed, the last node's next re-pointed; else the new
 * values all at once.
 */
export function diffList(prev: ListState, next: ListState): ListMove[] {
	const moves = nodeMoves(prev, next)
	if (prev.cycle !== next.cycle) moves.push({ op: 'cycle', last: next.ids.length - 1, to: next.cycle })
	return moves
}

function nodeMoves(prev: ListState, next: ListState): ListMove[] {
	const { ids: a, values: av } = prev
	const { ids: b, values: bv } = next
	if (same(a, b)) return a.flatMap((_, i): ListMove[] => (av[i] === bv[i] ? [] : [{ op: 'set', i, v: bv[i] }]))
	// The same nodes, values kept with them: reversed, or nothing else a move says.
	if (a.length === b.length && same([...a].reverse(), b) && av.every((v, i) => bv[b.length - 1 - i] === v)) return [{ op: 'reverse' }]
	const added = b.filter((id) => !a.includes(id))
	const gone = a.filter((id) => !b.includes(id))
	const kept = b.filter((id) => a.includes(id))
	// Values of nodes that stay must stay, and the ones that stay keep their order.
	const order = same(kept, a.filter((id) => b.includes(id)))
	const valuesKept = kept.every((id) => av[a.indexOf(id)] === bv[b.indexOf(id)])
	if (order && valuesKept && gone.length === 0) {
		// New nodes: at the head (each in front of the last), at the end, or after a node.
		const moves: ListMove[] = []
		const head = b.findIndex((id) => a.includes(id))
		for (let i = head < 0 ? b.length - 1 : head - 1; i >= 0; i--) moves.push({ op: 'insertAtHead', v: bv[i] })
		for (let i = Math.max(head, 0); i < b.length; i++) {
			if (a.includes(b[i]) || head < 0) continue
			const last = b.slice(i).every((id) => !a.includes(id))
			moves.push(last ? { op: 'append', v: bv[i] } : { op: 'insert', i, v: bv[i] })
		}
		return moves
	}
	if (order && valuesKept && added.length === 0) {
		// Nodes out, the later first so each index is as it is when its node goes.
		const values = [...av]
		return gone
			.map((id) => a.indexOf(id))
			.sort((x, y) => y - x)
			.map((i) => {
				const move: ListMove = { op: 'remove', i, v: values[i], first: values.indexOf(values[i]) === i }
				values.splice(i, 1)
				return move
			})
	}
	return [{ op: 'assign', values: [...bv] }]
}

/** The values a log leaves the list with. */
export function replayList(moves: readonly ListMove[]): string[] {
	let l: string[] = []
	for (const move of moves) {
		switch (move.op) {
			case 'new':
			case 'assign':
				l = [...move.values]
				break
			case 'set':
				l[move.i] = move.v
				break
			case 'insertAtHead':
				l.unshift(move.v)
				break
			case 'append':
				l.push(move.v)
				break
			case 'insert':
				l.splice(move.i, 0, move.v)
				break
			case 'remove':
				l.splice(move.i, 1)
				break
			case 'reverse':
				l.reverse()
				break
			case 'call':
				l = replayList([{ op: 'assign', values: l }, ...move.effect])
				break
		}
	}
	return l
}
