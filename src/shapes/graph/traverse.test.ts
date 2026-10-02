import { describe, expect, it } from 'vitest'
import { stateAt } from '../../nodelink/playback'
import type { GraphModel } from './model'
import { bfs, dfs, neighbours } from './traverse'

/** A graph from "A-B" style pairs; node ids are the labels in lower case. */
function graph(labels: string, pairs: string[]): GraphModel {
	return {
		nodes: labels.split('').map((l, i) => ({ id: l.toLowerCase(), value: l, x: i, y: 0 })),
		edges: pairs.map((p, i) => {
			const [from, to] = p.split('-').map((s) => s.toLowerCase())
			return { id: `e${i}`, from, to, weight: '1' }
		}),
	}
}

// A: B, C; B: A, D; C: A, D; D: B, C, E; E: D. F is on its own.
const g = graph('ABCDEF', ['A-C', 'A-B', 'B-D', 'C-D', 'D-E'])
const edgeId = (pair: string) => `e${['A-C', 'A-B', 'B-D', 'C-D', 'D-E'].indexOf(pair)}`

describe('neighbours', () => {
	it('lists neighbours in label order, numbers numerically, out-edges only when directed', () => {
		expect(neighbours(g, false).get('a')!.map((n) => n.node)).toEqual(['b', 'c'])
		expect(neighbours(g, true).get('b')!.map((n) => n.node)).toEqual(['d'])
		const numbered = graph('', [])
		numbered.nodes = ['0', '9', '10'].map((v) => ({ id: `v${v}`, value: v, x: 0, y: 0 }))
		numbered.edges = [
			{ id: 'e0', from: 'v0', to: 'v10', weight: '1' },
			{ id: 'e1', from: 'v0', to: 'v9', weight: '1' },
		]
		expect(neighbours(numbered, false).get('v0')!.map((n) => n.node)).toEqual(['v9', 'v10'])
	})
})

describe('bfs', () => {
	const result = bfs(g, 'a', false)

	it('discovers level by level, in label order, with the BFS tree', () => {
		expect(result.order).toEqual(['a', 'b', 'c', 'd', 'e'])
		expect(result.treeEdges).toEqual([edgeId('A-B'), edgeId('A-C'), edgeId('B-D'), edgeId('D-E')])
	})

	it('ends with reached nodes blue, tree edges green, numbered by discovery, queue empty', () => {
		const end = stateAt(result.frames, result.frames.length - 1)
		expect(end.flash).toEqual({
			a: 'blue',
			b: 'blue',
			c: 'blue',
			d: 'blue',
			e: 'blue',
			...Object.fromEntries(result.treeEdges.map((e) => [`edge:${e}`, 'green'])),
		})
		expect(end.badges).toEqual({ a: '1', b: '2', c: '3', d: '4', e: '5' })
		expect(end.strips?.[0].items).toEqual([])
		expect(result.frames.at(-1)!.caption).toContain("5 of 6 nodes reached")
	})

	it('shows the queue and narrates each step', () => {
		expect(result.frames[0].caption).toBe('Start at A: discover it (1) and queue it')
		const discoverB = result.frames.findIndex((f) => f.caption === 'A–B: B is new: discover it (2) and queue it')
		expect(stateAt(result.frames, discoverB).strips?.[0].items).toEqual(['B'])
		expect(result.frames.some((f) => f.caption === 'C–D: D was already discovered')).toBe(true)
	})

	it('flashes an edge it only looks at, then clears it', () => {
		const look = result.frames.findIndex((f) => f.caption === 'C–D: D was already discovered')
		expect(stateAt(result.frames, look).flash[`edge:${edgeId('C-D')}`]).toBe('orange')
		expect(stateAt(result.frames, look + 1).flash[`edge:${edgeId('C-D')}`]).toBeUndefined()
	})

	it('follows out-edges only when directed', () => {
		expect(bfs(g, 'b', true).order).toEqual(['b', 'd', 'e'])
	})
})

describe('dfs', () => {
	const result = dfs(g, 'a', false)

	it('goes deep first, in label order, backing up when stuck', () => {
		expect(result.order).toEqual(['a', 'b', 'd', 'c', 'e'])
		expect(result.treeEdges).toEqual([edgeId('A-B'), edgeId('B-D'), edgeId('C-D'), edgeId('D-E')])
	})

	it('shows the call stack and ends with everything reached blue', () => {
		const visitC = result.frames.findIndex((f) => f.caption?.startsWith('D–C: C is new'))
		expect(stateAt(result.frames, visitC).strips?.[0].items).toEqual(['A', 'B', 'D', 'C'])
		const end = stateAt(result.frames, result.frames.length - 1)
		expect(Object.entries(end.flash).filter(([k]) => !k.startsWith('edge:'))).toEqual(
			['a', 'b', 'd', 'c', 'e'].map((k) => [k, 'blue'])
		)
		expect(end.strips?.[0].items).toEqual([])
		expect(result.frames.at(-1)!.caption).toBe('A is done: finished, 5 of 6 nodes reached; the rest can\'t be reached from the start')
	})
})
