import type { CollectionData, GifData, RecordValue } from './sync/protocol'
import type { Collection } from './types'

export function newId(): string {
	// IDs are not credentials; no native crypto dependency is needed here.
	return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`
}

export function normalize(collections: Collection[]): Collection[] {
	return collections.map(collection => ({
		...collection,
		gifs: collection.gifs.map(gif =>
			gif.syncId ? gif : { ...gif, syncId: newId() },
		),
	}))
}

export function toRecords(collections: Collection[]): RecordValue[] {
	const stamp = { revision: 0, createdAt: 0, updatedAt: 0 }
	return collections.flatMap((collection, order): RecordValue[] => [
		{
			id: collection.id,
			kind: 'collection',
			value: { name: collection.name, order },
			...stamp,
		},
		...collection.gifs.map(
			(gif, order): RecordValue => ({
				id: gif.syncId!,
				kind: 'gif',
				value: {
					collectionId: collection.id,
					url: gif.url,
					src: gif.src,
					width: gif.width,
					height: gif.height,
					format: gif.format,
					order,
					...(gif.title ? { title: gif.title } : {}),
					...(gif.tags ? { tags: gif.tags } : {}),
				},
				...stamp,
			}),
		),
	])
}

export function fromRecords(records: RecordValue[]): Collection[] {
	const live = records.filter(item => item.value)
	const gifs = new Map<string, RecordValue[]>()
	for (const item of live) {
		if (item.kind !== 'gif') continue
		const parent = (item.value as GifData).collectionId
		const group = gifs.get(parent) ?? []
		group.push(item)
		gifs.set(parent, group)
	}
	const byOrder = (a: RecordValue, b: RecordValue) =>
		a.value!.order - b.value!.order || a.id.localeCompare(b.id)
	return live
		.filter(item => item.kind === 'collection')
		.sort(byOrder)
		.map(item => ({
			id: item.id,
			name: (item.value as CollectionData).name,
			gifs: (gifs.get(item.id) ?? []).sort(byOrder).map(item => {
				const { collectionId: _, order: __, ...gif } = item.value as GifData
				return { ...gif, syncId: item.id }
			}),
		}))
}
