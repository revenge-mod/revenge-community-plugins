import { pluginStoragePathFor } from '@revenge-mod/json-storage'
import { readFile } from '@revenge-mod/modules/native/fs'
import type { JsonStorage } from '@revenge-mod/json-storage'
import type { CollectionStorage } from './types'

let writes = Promise.resolve()
let failure: unknown
export function persistCollections(
	storage: JsonStorage<CollectionStorage>,
	value: CollectionStorage,
	report: (error: unknown) => void,
) {
	const contents = JSON.stringify(value)
	writes = writes
		.then(async () => {
			await storage.set(JSON.parse(contents), true)
			// JsonStorage logs write failures; sync requires a durable outbox before upload.
			if (
				(await readFile(
					pluginStoragePathFor('revenge-next.gif-collections'),
				)) !== contents
			)
				throw new Error(
					'Could not persist collections. Cloud sync paused; retry before closing Discord.',
				)
		})
		.then(
			() => {
				failure = undefined
			},
			error => {
				failure = error
				report(error)
			},
		)
}
export async function flushCollections() {
	let pending: Promise<void>
	do {
		pending = writes
		await pending
	} while (pending !== writes)
	if (failure) throw failure
}
