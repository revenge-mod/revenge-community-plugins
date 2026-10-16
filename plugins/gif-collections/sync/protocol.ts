// Shared by the Worker and both clients. Keep this module free of host APIs.
export const SCHEMA_VERSION = 1
export const MAX_BACKUP_BYTES = 16 * 1024 * 1024

export interface CollectionData {
	name: string
	order: number
}

export interface GifData {
	collectionId: string
	url: string
	src: string
	width: number
	height: number
	format: number
	order: number
	title?: string
	tags?: string[]
}

export type Kind = 'collection' | 'gif'
export type Data = CollectionData | GifData

export interface RecordValue {
	id: string
	kind: Kind
	value: Data | null
	revision: number
	createdAt: number
	updatedAt: number
}

export interface Mutation {
	id: string
	kind: Kind
	value: Data | null
	baseRevision: number
}

export interface SyncPage {
	version: 1
	changes: RecordValue[]
	cursor: string
	more: boolean
}

export interface Backup {
	version: 1
	records: Omit<RecordValue, 'revision'>[]
}

export function object(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value))
		throw new Error('Expected an object.')
	return value as Record<string, unknown>
}

export function text(value: unknown, max: number, min = 1): string {
	if (
		typeof value !== 'string' ||
		value.length < min ||
		value.length > max ||
		// biome-ignore lint/suspicious/noControlCharactersInRegex: Reject control characters in untrusted metadata.
		/[\u0000-\u0008\u000b-\u001f]/.test(value)
	) {
		throw new Error('Invalid text field.')
	}
	return value
}

export function integer(value: unknown, max = Number.MAX_SAFE_INTEGER): number {
	if (
		typeof value !== 'number' ||
		!Number.isSafeInteger(value) ||
		value < 0 ||
		value > max
	)
		throw new Error('Invalid number.')
	return value
}

export function identifier(value: unknown): string {
	const id = text(value, 96)
	if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('Invalid ID.')
	return id
}

function url(value: unknown): string {
	const string = text(value, 2048)
	const parsed = new URL(string)
	if (parsed.protocol !== 'https:' || parsed.username || parsed.password)
		throw new Error('Only HTTPS media references are supported.')
	return string
}

export function data(kind: Kind, value: unknown): Data {
	const input = object(value)
	const order = integer(input.order, 1000000)
	const allowed =
		kind === 'collection'
			? ['name', 'order']
			: [
					'collectionId',
					'url',
					'src',
					'width',
					'height',
					'format',
					'order',
					'title',
					'tags',
				]
	if (Object.keys(input).some(key => !allowed.includes(key)))
		throw new Error('Unsupported metadata field.')
	if (kind === 'collection') return { name: text(input.name, 60).trim(), order }

	const width = integer(input.width, 16384)
	const height = integer(input.height, 16384)
	if (!width || !height) throw new Error('Invalid dimensions.')
	const result: GifData = {
		collectionId: identifier(input.collectionId),
		url: url(input.url),
		src: url(input.src),
		width,
		height,
		format: integer(input.format, 2),
		order,
	}
	if (input.title !== undefined) result.title = text(input.title, 128, 0)
	if (input.tags !== undefined) {
		if (!Array.isArray(input.tags) || input.tags.length > 16)
			throw new Error('Too many tags.')
		result.tags = [...new Set(input.tags.map(tag => text(tag, 32)))]
	}
	return result
}

export function mutation(value: unknown): Mutation {
	const input = object(value)
	if (
		Object.keys(input).some(
			key => !['id', 'kind', 'value', 'baseRevision'].includes(key),
		)
	)
		throw new Error('Unsupported mutation field.')
	if (input.kind !== 'collection' && input.kind !== 'gif')
		throw new Error('Invalid record kind.')
	const result = {
		id: identifier(input.id),
		kind: input.kind,
		value: input.value === null ? null : data(input.kind, input.value),
		baseRevision: integer(input.baseRevision),
	}
	if (result.value && 'name' in result.value && !result.value.name)
		throw new Error('A collection needs a name.')
	return result as Mutation
}

export function record(value: unknown): RecordValue {
	const input = object(value)
	const item = mutation({
		id: input.id,
		kind: input.kind,
		value: input.value,
		baseRevision: input.revision,
	})
	return {
		id: item.id,
		kind: item.kind,
		value: item.value,
		revision: item.baseRevision,
		createdAt: integer(input.createdAt),
		updatedAt: integer(input.updatedAt),
	}
}

export function page(value: unknown): SyncPage {
	const input = object(value)
	if (
		input.version !== 1 ||
		!Array.isArray(input.changes) ||
		input.changes.length > 200 ||
		typeof input.more !== 'boolean'
	)
		throw new Error('Unsupported sync response.')
	const cursor = text(input.cursor, 120)
	if (!/^\d+:[A-Za-z0-9_-]*$/.test(cursor)) throw new Error('Invalid cursor.')
	return {
		version: 1,
		changes: input.changes.map(record),
		cursor,
		more: input.more,
	}
}

export function backup(value: unknown): Backup {
	const input = object(value)
	if (
		input.version !== 1 ||
		!Array.isArray(input.records) ||
		input.records.length > 10100
	)
		throw new Error('Unsupported or oversized backup.')
	const records = input.records.map(entry => {
		const item = record({ ...object(entry), revision: 0 })
		if (item.value === null)
			throw new Error('Backups must contain live records.')
		const { revision: _, ...portable } = item
		return portable
	})
	const ids = new Set(records.map(item => item.id))
	if (ids.size !== records.length) throw new Error('Duplicate IDs in backup.')
	const collections = new Set(
		records.filter(item => item.kind === 'collection').map(item => item.id),
	)
	const urls = new Set<string>()
	for (const item of records) {
		if (item.kind !== 'gif') continue
		const gif = item.value as GifData
		if (!collections.has(gif.collectionId))
			throw new Error('Missing collection in backup.')
		const key = JSON.stringify([gif.collectionId, gif.url])
		if (urls.has(key)) throw new Error('Duplicate GIF in collection.')
		urls.add(key)
	}
	return { version: 1, records }
}
