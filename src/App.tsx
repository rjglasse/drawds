import { exportSteps, type StepExportOptions } from './export/steps'
import { exportLesson, startLessonLog } from './lesson/log'
import { lessonManifest } from './lesson/manifest'
import { Tldraw, type Editor } from 'tldraw'
import 'tldraw/tldraw.css'
import './drawds.css'
import { ArrayShapeTool } from './shapes/array/ArrayShapeTool'
import { ArrayShapeUtil } from './shapes/array/ArrayShapeUtil'
import { GraphShapeTool } from './shapes/graph/GraphShapeTool'
import { GraphShapeUtil } from './shapes/graph/GraphShapeUtil'
import { GraphViewShapeUtil } from './shapes/graph-view/GraphViewShapeUtil'
import { RecursionTreeShapeUtil } from './shapes/recursion/RecursionTreeShapeUtil'
import { TracerShapeTool } from './shapes/recursion/TracerShapeTool'
import { TracerShapeUtil } from './shapes/recursion/TracerShapeUtil'
import { CodeShapeTool } from './shapes/code/CodeShapeTool'
import { CodeShapeUtil } from './shapes/code/CodeShapeUtil'
import { HashShapeTool } from './shapes/hash/HashShapeTool'
import { HashShapeUtil } from './shapes/hash/HashShapeUtil'
import { HeapShapeTool } from './shapes/heap/HeapShapeTool'
import { HeapShapeUtil } from './shapes/heap/HeapShapeUtil'
import { UnionFindShapeTool } from './shapes/union-find/UnionFindShapeTool'
import { UnionFindShapeUtil } from './shapes/union-find/UnionFindShapeUtil'
import { ListShapeTool } from './shapes/list/ListShapeTool'
import { ListShapeUtil } from './shapes/list/ListShapeUtil'
import { MatrixShapeTool } from './shapes/matrix/MatrixShapeTool'
import { MatrixShapeUtil } from './shapes/matrix/MatrixShapeUtil'
import { TreeShapeTool } from './shapes/tree/TreeShapeTool'
import { TreeShapeUtil } from './shapes/tree/TreeShapeUtil'
import { deleteFollowersWithTheirStructure } from './cells/followers'
import { showBoardNameInTitle } from './files/board'
import { BoardFileKeys } from './files/BoardFileKeys'
import { clearStaleRooms } from './nodelink/playback'
import { components, uiOverrides } from './ui/overrides'

// Defined at module level so they aren't recreated on every render.
const shapeUtils = [ArrayShapeUtil, MatrixShapeUtil, ListShapeUtil, TreeShapeUtil, HeapShapeUtil, UnionFindShapeUtil, HashShapeUtil, GraphShapeUtil, GraphViewShapeUtil, RecursionTreeShapeUtil, TracerShapeUtil, CodeShapeUtil]
const tools = [ArrayShapeTool, MatrixShapeTool, ListShapeTool, TreeShapeTool, HeapShapeTool, UnionFindShapeTool, HashShapeTool, GraphShapeTool, TracerShapeTool, CodeShapeTool]
// Digits mark the element under the pointer (1-4, 0 clears), so tldraw's "press n for the nth
// toolbar tool" shortcuts are off; every tool still has its letter shortcut.
const options = { enableToolbarKeyboardShortcuts: false }

declare global {
	interface Window {
		editor?: Editor
		/** Dev: every step of the open operation as images, base64 (the run-drawds driver's `steps`). */
		drawdsSteps?: (options?: StepExportOptions) => Promise<{ name: string; caption: string; header: string; width: number; height: number; base64: string }[]>
		/** Dev: every operation in the lesson log, its steps as images (base64) in folders, and the manifest. */
		drawdsLesson?: (options?: StepExportOptions) => Promise<{ manifest: unknown; files: { path: string; base64: string }[] }>
	}
}

async function base64(blob: Blob) {
	const bytes = new Uint8Array(await blob.arrayBuffer())
	let binary = ''
	for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
	return btoa(binary)
}

// Expose the editor in dev for console poking and browser-driven tests. A graph's views
// (adjacency matrix, lists) are deleted with it; the tab's title names the board; room left for an
// operation's steps that none needs any more goes.
function onMount(editor: Editor) {
	if (import.meta.env.DEV) {
		window.editor = editor
		window.drawdsSteps = async (options) =>
			Promise.all((await exportSteps(editor, options)).map(async ({ blob, ...image }) => ({ ...image, base64: await base64(blob) })))
		window.drawdsLesson = async (options) => {
			const exported = await exportLesson(editor, options)
			const files = await Promise.all(
				exported.flatMap(({ folder, images }) => images.map(async (image) => ({ path: `${folder}/${image.name}`, base64: await base64(image.blob) })))
			)
			return { manifest: lessonManifest(exported), files }
		}
	}
	const cleanups = [deleteFollowersWithTheirStructure(editor), showBoardNameInTitle(editor), clearStaleRooms(editor), startLessonLog(editor)]
	return () => cleanups.forEach((f) => f())
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
			>
				<BoardFileKeys />
			</Tldraw>
		</div>
	)
}
