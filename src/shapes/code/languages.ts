import type { CodeLanguage } from './highlight'

// What every language drawds writes spells its own way, in one place: a record over every CodeLanguage,
// so a language added there doesn't compile until it says how it writes these (rather than coming out
// as C wherever code once asked "Python? Java? else C"). Its tokens' colours are `highlight.ts`'s RULES.

export interface LanguageSpec {
	/** Its name, as pickers and messages give it. */
	name: string
	/** A line comment's start. */
	comment: string
	/** After a statement: a semicolon, or nothing. */
	end: string
	/** No value, no node. */
	none: string
	/** True and false, as written. */
	bools: readonly [string, string]
	/** A test's and and or, as written between its parts. */
	and: string
	or: string
	/** A block opens with `{` and closes with `}`, else it opens with `:` and is indented. */
	braces: boolean
}

export const LANGUAGES: Record<CodeLanguage, LanguageSpec> = {
	c: { name: 'C', comment: '//', end: ';', none: 'NULL', bools: ['true', 'false'], and: '&&', or: '||', braces: true },
	java: { name: 'Java', comment: '//', end: ';', none: 'null', bools: ['true', 'false'], and: '&&', or: '||', braces: true },
	python: { name: 'Python', comment: '#', end: '', none: 'None', bools: ['True', 'False'], and: ' and ', or: ' or ', braces: false },
}
