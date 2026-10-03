import { describe, expect, it } from 'vitest'
import { stateAt } from '../../nodelink/playback'
import { nullKey } from './layout'
import { bstSearch } from './search'
import type { TreeNode } from './tree-shape-types'

const node = (id: string, value: string, children: (string | null)[] = [null, null]): TreeNode => ({
	id,
	value,
	children,
	dx: 0,
	dy: 0,
})
//        8
//      3   10
//     1 6    14
const tree = (): TreeNode[] => [
	node('n', '8', ['nL', 'nR']),
	node('nL', '3', ['nLL', 'nLR']),
	node('nR', '10', [null, 'nRR']),
	node('nLL', '1'),
	node('nLR', '6'),
	node('nRR', '14'),
]

describe('bstSearch', () => {
	it('walks down comparing, curr sliding, and finds the key', () => {
		const { frames, found } = bstSearch(tree(), '6')
		expect(found).toBe('nLR')
		expect(frames.map((f) => f.caption)).toEqual([
			'curr = root (8). Is it 6?',
			"6 < 8, so it can't be on the right: curr = curr.left (3). Is it 6?",
			"6 > 3, so it can't be on the left: curr = curr.right (6). Is it 6?",
			'Yes: found 6, after 3 comparisons',
		])
		expect(frames.map((f) => f.pointers?.[0]?.at)).toEqual(['n', 'nL', 'nLR', 'nLR'])
	})

	it('fades each subtree it rules out', () => {
		const { frames } = bstSearch(tree(), '6')
		// After going left at 8, the whole right subtree (with its empty slots) is out of play.
		expect(frames[1].dim).toEqual(['nR', nullKey('nR', 0), 'nRR', nullKey('nRR', 0), nullKey('nRR', 1)])
		expect(stateAt(frames, 2).dim).toContain('nLL')
	})

	it('falls off at an empty slot when the key is missing', () => {
		const { frames, found } = bstSearch(tree(), '9', { nulls: true })
		expect(found).toBeUndefined()
		const last = frames[frames.length - 1]
		expect(last.caption).toBe('9 < 10, but 10 has no left child: curr = null, so 9 is not in the tree')
		expect(last.pointers).toEqual([{ id: '#curr', name: 'curr', at: nullKey('nR', 0) }])
		expect(bstSearch(tree(), '9').frames.at(-1)?.pointers).toEqual([])
	})

	it('counts comparisons', () => {
		expect(bstSearch(tree(), '14').frames.at(-2)?.counts).toEqual({ comparisons: 3 })
	})
})
