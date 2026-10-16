import type {
	Backup,
	Data,
	GifData,
	Mutation,
	RecordValue,
	SyncPage,
} from './protocol'

export interface Replica {
	cursor: string
	sequence: number
	records: Record<string, RecordValue>
	pending: Mutation[]
	flight?: { sequence: number; mutations: Mutation[] }
	conflicts: string[]
}

export function emptyReplica(): Replica {
	return { cursor: '0:', sequence: 0, records: {}, pending: [], conflicts: [] }
}

export function same(a: Data | null, b: Data | null): boolean {
	return JSON.stringify(a) === JSON.stringify(b)
}

export function visible(replica: Replica): RecordValue[] {
	const records = new Map(
		Object.values(replica.records).map(item => [item.id, item]),
	)
	for (const item of [
		...(replica.flight?.mutations ?? []),
		...replica.pending,
	]) {
		records.set(item.id, {
			...item,
			revision: item.baseRevision,
			createdAt: records.get(item.id)?.createdAt ?? Date.now(),
			updatedAt: Date.now(),
		})
	}
	return [...records.values()].filter(
		item =>
			item.value !== null &&
			(item.kind === 'collection' ||
				!!records.get((item.value as GifData).collectionId)?.value),
	)
}

export function queue(replica: Replica, desired: RecordValue[]): Replica {
	const previous = new Map(visible(replica).map(item => [item.id, item]))
	const next = new Map(desired.map(item => [item.id, item]))
	const pending = new Map(replica.pending.map(item => [item.id, item]))
	for (const id of new Set([...previous.keys(), ...next.keys()])) {
		const old = previous.get(id)
		const item = next.get(id)
		const source = item ?? old
		if (!source) continue
		const value = item?.value ?? null
		if (same(old?.value ?? null, value)) continue
		const base = replica.records[id]
		if (
			!base &&
			!value &&
			!replica.flight?.mutations.some(item => item.id === id)
		)
			pending.delete(id)
		else
			pending.set(id, {
				id,
				kind: source.kind,
				value,
				baseRevision: pending.get(id)?.baseRevision ?? base?.revision ?? 0,
			})
	}
	return { ...replica, pending: [...pending.values()] }
}

export function beginBatch(
	replica: Replica,
	maximum: number,
	maximumBytes = 60000,
): Replica {
	if (replica.flight || replica.conflicts.length || !replica.pending.length)
		return replica
	// Release unique names/URLs before a replace import creates new records.
	const rank = (item: Mutation) =>
		item.value
			? item.kind === 'collection'
				? 2
				: 3
			: item.kind === 'gif'
				? 0
				: 1
	const pending = [...replica.pending].sort((a, b) => rank(a) - rank(b))
	const mutations: Mutation[] = []
	let bytes = 128
	for (const item of pending.slice(0, maximum)) {
		const size = JSON.stringify(item).length * 3
		if (bytes + size > maximumBytes) break
		mutations.push(item)
		bytes += size
	}
	if (!mutations.length)
		throw new Error(
			"A collection item exceeds this server's request limit. Local data is safe.",
		)
	return {
		...replica,
		pending: pending.slice(mutations.length),
		flight: { sequence: replica.sequence + 1, mutations },
	}
}

export function acknowledge(replica: Replica, revision: number): Replica {
	if (!replica.flight) throw new Error('No pending upload.')
	const records = { ...replica.records }
	const ids = new Set(replica.flight.mutations.map(item => item.id))
	for (const item of replica.flight.mutations)
		records[item.id] = {
			id: item.id,
			kind: item.kind,
			value: item.value,
			revision,
			createdAt: records[item.id]?.createdAt ?? Date.now(),
			updatedAt: Date.now(),
		}
	return {
		...replica,
		records,
		sequence: replica.flight.sequence,
		flight: undefined,
		pending: replica.pending.map(item =>
			ids.has(item.id) ? { ...item, baseRevision: revision } : item,
		),
	}
}

export function rejectBatch(replica: Replica): Replica {
	const pending = new Map(
		(replica.flight?.mutations ?? []).map(item => [item.id, item]),
	)
	for (const item of replica.pending) pending.set(item.id, item)
	return { ...replica, flight: undefined, pending: [...pending.values()] }
}

export function receive(replica: Replica, page: SyncPage): Replica {
	const records = { ...replica.records }
	for (const item of page.changes)
		if (!records[item.id] || records[item.id].revision <= item.revision)
			records[item.id] = item
	const pending: Mutation[] = []
	const conflicts = new Set<string>()
	const key = (item: Mutation | RecordValue) =>
		item.kind === 'collection'
			? `collection:${(item.value as { name: string }).name.toLowerCase()}`
			: JSON.stringify([
					(item.value as GifData).collectionId,
					(item.value as GifData).url,
				])
	const unique = new Map(
		Object.values(records)
			.filter(item => item.value)
			.map(item => [key(item), item.id]),
	)
	const deleting = new Set(
		replica.pending.filter(item => item.value === null).map(item => item.id),
	)
	for (const item of replica.pending) {
		const remote = records[item.id]
		if (remote && same(remote.value, item.value)) continue
		pending.push(item)
		if ((remote?.revision ?? 0) !== item.baseRevision) conflicts.add(item.id)
		const duplicate = item.value ? unique.get(key(item)) : undefined
		if (duplicate && duplicate !== item.id && !deleting.has(duplicate))
			conflicts.add(item.id)
		if (
			item.kind === 'gif' &&
			item.value &&
			records[(item.value as GifData).collectionId]?.value === null
		)
			conflicts.add(item.id)
		if (
			item.kind === 'gif' &&
			item.value &&
			remote?.value &&
			records[(remote.value as GifData).collectionId]?.value === null
		)
			conflicts.add(item.id)
	}
	return {
		...replica,
		records,
		pending,
		conflicts: [...conflicts],
		cursor: page.cursor,
	}
}

export function exportBackup(records: RecordValue[]): Backup {
	return {
		version: 1,
		records: records
			.filter(item => item.value !== null)
			.map(({ revision: _, ...item }) => item),
	}
}

export function importBackup(
	current: RecordValue[],
	incoming: Backup,
	mode: 'merge' | 'replace',
	newId: () => string,
): RecordValue[] {
	const result = mode === 'merge' ? [...current] : []
	const parents = new Map<string, string>()
	const names = new Map(
		result
			.filter(item => item.kind === 'collection')
			.map(item => [
				(item.value as { name: string }).name.toLowerCase(),
				item.id,
			]),
	)
	const urls = new Set(
		result
			.filter(item => item.kind === 'gif')
			.map(item =>
				JSON.stringify([
					(item.value as GifData).collectionId,
					(item.value as GifData).url,
				]),
			),
	)
	for (const item of incoming.records.filter(
		item => item.kind === 'collection',
	)) {
		const { name } = item.value as { name: string }
		const existing = names.get(name.toLowerCase())
		const id = existing ?? newId()
		parents.set(item.id, id)
		if (!existing) {
			result.push({ ...item, id, revision: 0 })
			names.set(name.toLowerCase(), id)
		}
	}
	for (const item of incoming.records.filter(item => item.kind === 'gif')) {
		const gif = item.value as GifData
		const collectionId = parents.get(gif.collectionId)
		if (!collectionId) throw new Error('Missing collection in backup.')
		const key = JSON.stringify([collectionId, gif.url])
		if (urls.has(key)) continue
		result.push({
			...item,
			id: newId(),
			value: { ...gif, collectionId },
			revision: 0,
		})
		urls.add(key)
	}
	return result
}
