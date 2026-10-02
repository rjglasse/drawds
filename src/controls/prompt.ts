import { atom, type Atom, type Editor, type TLShapeId } from 'tldraw'

/** Which shape's key prompt (e.g. "insert a key") is open, if any. */
const prompts = new WeakMap<Editor, Atom<TLShapeId | null>>()

function promptAtom(editor: Editor) {
	let a = prompts.get(editor)
	if (!a) {
		a = atom('key prompt', null)
		prompts.set(editor, a)
	}
	return a
}

export const isPromptOpen = (editor: Editor, shapeId: TLShapeId) => promptAtom(editor).get() === shapeId
export const openPrompt = (editor: Editor, shapeId: TLShapeId) => promptAtom(editor).set(shapeId)
export const closePrompt = (editor: Editor) => promptAtom(editor).set(null)

/** A value prompt for an operation started from a node's menu (e.g. "Find a value..."). */
export interface OperationPrompt {
	shapeId: TLShapeId
	/** The node it was asked about: the prompt sits above it. */
	at: string
	label: string
	run(value: string): void
}

const operationPrompts = new WeakMap<Editor, Atom<OperationPrompt | null>>()

/** The open operation prompt, if any. Reactive. */
export function operationPrompt(editor: Editor): Atom<OperationPrompt | null> {
	let a = operationPrompts.get(editor)
	if (!a) {
		a = atom('operation prompt', null)
		operationPrompts.set(editor, a)
	}
	return a
}
