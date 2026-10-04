import { StyleProp, T } from 'tldraw'

/**
 * Whether a structure with an invariant (a BST's ordering, a heap's property) flags the elements
 * that break it, with a dashed red ring, as values are edited. Off for "what is wrong with this
 * tree?" exercises, then on to check.
 */
export const InvariantStyle = StyleProp.defineEnum('drawds:invariant', {
	defaultValue: 'check' as const,
	values: ['check', 'off'] as const,
})
export type InvariantMode = T.TypeOf<typeof InvariantStyle>
