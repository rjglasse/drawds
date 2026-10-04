import { Tldraw, type Editor } from 'tldraw'
import 'tldraw/tldraw.css'
import './drawds.css'
import { ArrayShapeTool } from './shapes/array/ArrayShapeTool'
import { ArrayShapeUtil } from './shapes/array/ArrayShapeUtil'
import { GraphShapeTool } from './shapes/graph/GraphShapeTool'
import { GraphShapeUtil } from './shapes/graph/GraphShapeUtil'
import { HeapShapeTool } from './shapes/heap/HeapShapeTool'
import { HeapShapeUtil } from './shapes/heap/HeapShapeUtil'
import { ListShapeTool } from './shapes/list/ListShapeTool'
import { ListShapeUtil } from './shapes/list/ListShapeUtil'
import { MatrixShapeTool } from './shapes/matrix/MatrixShapeTool'
import { MatrixShapeUtil } from './shapes/matrix/MatrixShapeUtil'
import { TreeShapeTool } from './shapes/tree/TreeShapeTool'
import { TreeShapeUtil } from './shapes/tree/TreeShapeUtil'
import { components, uiOverrides } from './ui/overrides'

// Defined at module level so they aren't recreated on every render.
const shapeUtils = [ArrayShapeUtil, MatrixShapeUtil, ListShapeUtil, TreeShapeUtil, HeapShapeUtil, GraphShapeUtil]
const tools = [ArrayShapeTool, MatrixShapeTool, ListShapeTool, TreeShapeTool, HeapShapeTool, GraphShapeTool]
// Digits mark the element under the pointer (1-4, 0 clears), so tldraw's "press n for the nth
// toolbar tool" shortcuts are off; every tool still has its letter shortcut.
const options = { enableToolbarKeyboardShortcuts: false }

declare global {
	interface Window {
		editor?: Editor
	}
}

// Expose the editor in dev for console poking and browser-driven tests.
function onMount(editor: Editor) {
	if (import.meta.env.DEV) window.editor = editor
}

export default function App() {
	return (
		<div style={{ position: 'fixed', inset: 0 }}>
			<Tldraw
				persistenceKey="drawds"
				shapeUtils={shapeUtils}
				tools={tools}
				overrides={uiOverrides}
				components={components}
				options={options}
				onMount={onMount}
			/>
		</div>
	)
}
