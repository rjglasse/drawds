/** What a board file ends in: it is tldraw's own file format (JSON records plus their schema). */
export const BOARD_EXTENSION = '.tldr'

/** The file a board called `name` saves to: the name made safe for any file system, plus .tldr. */
export function boardFileName(name: string): string {
	let base = name.replace(/\s+/g, ' ').trim()
	if (base.toLowerCase().endsWith(BOARD_EXTENSION)) base = base.slice(0, -BOARD_EXTENSION.length)
	base = base
		.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
		.replace(/^[.\s]+/, '')
		.trim()
	return (base || 'board') + BOARD_EXTENSION
}

/** The board a file holds, named after the file: no folder, no .tldr (or .json). */
export function boardName(fileName: string): string {
	const base = fileName.split(/[\\/]/).pop() ?? ''
	return base.replace(/\.(tldr|json)$/i, '').trim()
}
