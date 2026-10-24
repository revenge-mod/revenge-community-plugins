function createModuleGetter<T>(
	filter: any,
	resolve: (exports: any) => T | undefined,
): () => T | undefined {
	const { getModules, lookupModule } = revenge.modules.finders
	let cached: T | undefined
	let done = false
	let unsub: (() => void) | undefined

	try {
		unsub = getModules(
			filter,
			(exports: any) => {
				try {
					const resolved = resolve(exports)
					if (resolved !== undefined) {
						cached = resolved
						done = true
						unsub?.()
					}
				} catch {}
			},
			{ returnNamespace: true },
		)
	} catch {}

	return () => {
		if (done) return cached
		try {
			const resolved = resolve(lookupModule(filter)?.[0])
			if (resolved !== undefined) {
				cached = resolved
				done = true
			}
		} catch {}
		return cached
	}
}

function createStoreGetter(name: string): () => any {
	const { getStore, Stores } = revenge.discord.flux
	let cached: any
	let done = false
	let unsub: (() => void) | undefined

	try {
		unsub = getStore(name, (store: any) => {
			cached = store
			done = true
			unsub?.()
		})
	} catch {}

	return () => {
		if (done) return cached
		try {
			const viaProxy = (Stores as any)[name]
			if (viaProxy) {
				cached = viaProxy
				done = true
			}
		} catch {}
		return cached
	}
}

const httpUtilsGetter = createModuleGetter<any>(
	revenge.modules.finders.filters.withProps('getAPIBaseURL', 'get', 'post'),
	exports => exports,
)

const assetManagerGetter = createModuleGetter<any>(
	revenge.modules.finders.filters.withProps('getAssetIds', 'fetchAssetIds'),
	exports => exports,
)

const selfPresenceStoreGetter = createStoreGetter('SelfPresenceStore')

export function getHTTPUtils(): any {
	return httpUtilsGetter()
}

export function getAssetManager(): any {
	return assetManagerGetter()
}

export function getSelfPresenceStore(): any {
	return selfPresenceStoreGetter()
}
