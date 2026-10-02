import { Tldraw, type Editor } from 'tldraw'
import 'tldraw/tldraw.css'
import './drawds.css'
import { ArrayShapeTool } from './shapes/array/ArrayShapeTool'
import { ArrayShapeUtil } from './shapes/array/ArrayShapeUtil'
import { ListShapeTool } from './shapes/list/ListShapeTool'
import { ListShapeUtil } from './shapes/list/ListShapeUtil'
import { TreeShapeTool } from './shapes/tree/TreeShapeTool'
import { TreeShapeUtil } from './shapes/tree/TreeShapeUtil'
import { components, uiOverrides } from './ui/overrides'

// Defined at module level so they aren't recreated on every render.
const shapeUtils = [ArrayShapeUtil, ListShapeUtil, TreeShapeUtil]
const tools = [ArrayShapeTool, ListShapeTool, TreeShapeTool]

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
				onMount={onMount}
			/>
		</div>
	)
}
