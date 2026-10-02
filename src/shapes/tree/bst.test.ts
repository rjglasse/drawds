import { describe, expect, it } from 'vitest'
import { assignInOrder, bstDelete, bstInsert, bstViolations, inOrder } from './bst'
import { generateTree } from './generate'
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
//      4 7  13
const tree = (): TreeNode[] => [
	node('n', '8', ['nL', 'nR']),
	node('nL', '3', ['nLL', 'nLR']),
	node('nR', '10', [null, 'nRR']),
	node('nLL', '1'),
	node('nLR', '6', ['nLRL', 'nLRR']),
	node('nRR', '14', ['nRRL', null]),
	node('nLRL', '4'),
	node('nLRR', '7'),
	node('nRRL', '13'),
]
const values = (nodes: TreeNode[]) => inOrder(nodes).map((n) => n.value)

describe('BST', () => {
	it('any shape becomes a valid BST with sorted values in in-order', () => {
		for (let seed = 0; seed < 10; seed++) {
			const shape = generateTree(seed, 5, 0.6, 'random')
			const bst = assignInOrder(shape, shape.map((n) => n.value))
			expect(bstViolations(bst).size).toBe(0)
		}
	})

	it('catches a node on the wrong side of an ancestor, not just its parent', () => {
		const bad = tree().map((n) => (n.id === 'nLRR' ? { ...n, value: '9' } : n))
		expect([...bstViolations(bad)]).toEqual(['nLRR'])
		expect(bstViolations(tree()).size).toBe(0)
	})

	it('inserts along the comparison path', () => {
		const r = bstInsert(tree(), '5')
		expect(r.path).toEqual(['n', 'nL', 'nLR', 'nLRL'])
		expect(values(r.nodes)).toEqual(['1', '3', '4', '5', '6', '7', '8', '10', '13', '14'])
		expect(r.nodes.find((n) => n.id === 'nLRL')!.children[1]).toBe(r.id)
	})

	it('reports an existing key instead of inserting it', () => {
		const r = bstInsert(tree(), '6')
		expect(r.found).toBe('nLR')
		expect(r.nodes).toHaveLength(9)
	})

	it('deletes a leaf', () => {
		const r = bstDelete(tree(), 'nLRL')
		expect(r.kind).toBe('leaf')
		expect(values(r.nodes)).toEqual(['1', '3', '6', '7', '8', '10', '13', '14'])
	})

	it('deletes a node with one child by splicing the child up', () => {
		const r = bstDelete(tree(), 'nR')
		expect(r.kind).toBe('one-child')
		expect(r.nodes[0].children).toEqual(['nL', 'nRR'])
		expect(bstViolations(r.nodes).size).toBe(0)
	})

	it('deletes a node with two children via its in-order successor', () => {
		const r = bstDelete(tree(), 'nL')
		expect(r.kind).toBe('two-children')
		expect(r.successor).toBe('nLRL')
		expect(r.path).toEqual(['nLR', 'nLRL'])
		expect(r.nodes.find((n) => n.id === 'nL')!.value).toBe('4')
		expect(values(r.nodes)).toEqual(['1', '4', '6', '7', '8', '10', '13', '14'])
	})

	it('deleting a root with one child makes the child the root', () => {
		const r = bstDelete([node('n', '5', [null, 'nR']), node('nR', '9')], 'n')
		expect(r.nodes.map((n) => n.id)).toEqual(['nR'])
	})
})
