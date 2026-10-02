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
