/** Break `text` into lines of at most `width` characters, at spaces (a longer word gets a line of its own). */
export function wrapText(text: string, width: number): string[] {
	const lines: string[] = []
	let line = ''
	for (const word of text.split(/\s+/).filter(Boolean)) {
		if (line && line.length + 1 + word.length > width) {
			lines.push(line)
			line = word
		} else line = line ? `${line} ${word}` : word
	}
	if (line) lines.push(line)
	return lines
}

/** A file name for step `index` (from 0) of `count`: zero-padded number, then the caption's first words. */
export function stepFileName(index: number, count: number, caption: string | undefined, extension: string): string {
	const number = String(index + 1).padStart(Math.max(2, String(count).length), '0')
	const full = (caption ?? '')
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
	// Cut at a word, not in one.
	const slug = full.length <= 48 ? full : full.slice(0, 48).replace(/-[^-]*$/, '')
	return `${number}${slug ? `-${slug}` : ''}.${extension}`
}
