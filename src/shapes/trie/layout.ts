import type { Scene } from '../../nodelink/scene'
import { generalTreeBasePosition, generalTreeScene } from '../general-tree/layout'
import type { TrieShapeProps } from './trie-shape-types'

type LayoutProps = Pick<TrieShapeProps, 'nodes' | 'size'>

/**
 * A trie drawn as the general tree it is (children in letter order), each edge labelled with its
 * letter; a node shows the word that ends at it, if any. Its values aren't typed in: words go in and
 * out by insert and delete.
 */
export function trieScene(props: LayoutProps): Scene {
	const scene = generalTreeScene(props)
	return {
		...scene,
		nodes: scene.nodes.map((n) => ({ ...n, editable: false })),
		edges: scene.edges.map((e) => ({ ...e, label: e.to.slice(-1) })),
	}
}

export const trieBasePosition = generalTreeBasePosition

/** Centre of the root with no drag offset (layout coordinates); the sketch tool keeps this under the drag origin. */
export function trieRootCentre(props: LayoutProps) {
	return (props.nodes[0] && generalTreeBasePosition(props, props.nodes[0].id)) ?? { x: 0, y: 0 }
}
