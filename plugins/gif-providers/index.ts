import { ToastActionCreators } from '@revenge-mod/discord/actions'
import { getStore, onFluxEventDispatched } from '@revenge-mod/discord/flux'
import { getModules } from '@revenge-mod/modules/finders'
import { withProps } from '@revenge-mod/modules/finders/filters'
import { after, instead } from '@revenge-mod/patcher'
import { patchPicker } from './picker'
import { registerShare } from './providers'
import { loadProviders } from './requests'
import GifProvidersSettings from './settings'
import {
	configureStorage,
	defaults,
	getSettings,
	providerLabels,
	selectedProviders,
	setActive,
	storage,
} from './storage'
import type { GifProvidersSettings as SettingsData } from './storage'
import type {
	GifActions,
	GifViewStore,
	HttpModule,
	HttpRequest,
	RequestOptions,
} from './types'

export default plugin<{ jsonStorage: SettingsData }>({
	jsonStorage: { default: defaults },
	SettingsComponent: GifProvidersSettings,
	async start({ cleanup: registerCleanup, jsonStorage, plugin, logger }) {
		const patches: (() => void)[] = []
		const requests = new Map<string, AbortController>()
		let stopped = false
		function cancelRequests() {
			for (const controller of requests.values()) controller.abort()
			requests.clear()
		}
		function cleanup() {
			stopped = true
			setActive(false)
			cancelRequests()
			for (const unpatch of patches.splice(0).reverse()) {
				try {
					unpatch()
				} catch (error) {
					plugin.reportError(error)
				}
			}
		}
		registerCleanup(cleanup)
		if (plugin.startedLate) plugin.requireReload()
		configureStorage(jsonStorage)
		await jsonStorage.get()
		if (stopped) return
		let actions: GifActions | undefined
		patches.push(
			getModules(
				withProps<GifActions>('fetchTrendingGIFs', 'trackSelectGIF'),
				value => {
					if (!stopped) actions = value
				},
			),
		)
		function install(http: HttpModule['HTTP'], viewStore: GifViewStore) {
			const get: HttpRequest = http.get.bind(http)

			setActive(true)
			patches.push(
				getModules(
					withProps('GIF_PROVIDER', 'getSearchPlaceholder'),
					provider => {
						if (stopped) return
						patches.push(
							after(
								provider,
								'getSearchPlaceholder',
								(placeholder: unknown) => {
									const names = selectedProviders(getSettings().providers)
										.map(value => providerLabels[value])
										.join(', ')
									return typeof placeholder === 'string'
										? placeholder.replace(/klipy|tenor|giphy/gi, names)
										: placeholder
								},
							),
						)
					},
				),
			)

			patches.push(
				onFluxEventDispatched('GIF_PICKER_QUERY', payload => {
					if (payload.type === 'GIF_PICKER_QUERY') {
						requests.get('results')?.abort()
						requests.get('suggest')?.abort()
					}
					return payload
				}),
			)
			patches.push(
				instead(http, 'get', function (args: unknown[], original) {
					const [options] = args as [RequestOptions]
					const match =
						/^\/gifs\/(search|trending-gifs|trending|suggest|trending-search)$/.exec(
							options?.url?.toLowerCase().replaceAll('_', '-'),
						)
					if (!match || (match[1] === 'suggest' && !options.query?.q))
						return Reflect.apply(original, this, args)

					const operation = match[1] as Parameters<typeof loadProviders>[0]
					const slot =
						operation === 'search' || operation === 'trending-gifs'
							? 'results'
							: operation
					requests.get(slot)?.abort()
					const controller = new AbortController()
					requests.set(slot, controller)
					const query =
						typeof options.query?.q === 'string' ? options.query.q : ''
					const locale =
						typeof options.query?.locale === 'string'
							? options.query.locale
							: 'en-US'
					const limit = Math.max(
						1,
						Math.min(Number(options.query?.limit) || 50, 250),
					)
					const format =
						typeof options.query?.media_format === 'string'
							? options.query.media_format
							: viewStore.getSelectedFormat()
					const pending = loadProviders(
						operation,
						query,
						limit,
						locale,
						format,
						controller.signal,
						get,
						logger,
					)
						.then(body => ({ body }))
						.catch(error => {
							if (!controller.signal.aborted) {
								logger.warn(`GIF ${operation} failed`, error)
								if (slot === 'results')
									ToastActionCreators.open('GIF_PROVIDERS_FAILED', {
										text: 'Could not load GIFs. Try another provider.',
										variant: 'critical',
									})
							}
							if (slot === 'results') throw error
							return {
								body:
									operation === 'trending'
										? { categories: [], gifs: [{ src: '' }] }
										: [],
							}
						})

					// Obsolete requests stay unsettled so neither success nor failure clears newer results.
					return new Promise<{ body: unknown }>((resolve, reject) => {
						void pending
							.then(
								response => {
									if (!controller.signal.aborted && !stopped) resolve(response)
								},
								error => {
									if (!controller.signal.aborted && !stopped) reject(error)
								},
							)
							.finally(() => {
								if (requests.get(slot) === controller) requests.delete(slot)
							})
					})
				}),
			)
			for (const method of ['get', 'post'] as const)
				patches.push(
					instead(http, method, function (args: unknown[], original) {
						const [options] = args as [RequestOptions]
						const field = method === 'get' ? 'query' : 'body'
						const data = options?.[field]
						if (options?.url !== '/gifs/select' || typeof data?.id !== 'string')
							return Reflect.apply(original, this, args)
						const selected = selectedProviders(getSettings().providers)
						const match =
							/^(tenor|giphy|klipy):(.+)$/.exec(data.id) ??
							(method === 'get' &&
							selected.length === 1 &&
							selected[0] === 'tenor'
								? ['', 'tenor', data.id]
								: null)
						if (!match) return Reflect.apply(original, this, args)
						if (match[1] === 'klipy')
							return Reflect.apply(original, this, [
								{ ...options, [field]: { ...data, id: match[2] } },
								...args.slice(1),
							])
						if (match[1] === 'giphy') return Promise.resolve({ body: {} })

						const controller = new AbortController()
						const key = `share:${match[2]}`
						requests.get(key)?.abort()
						requests.set(key, controller)
						const timer = setTimeout(() => controller.abort(), 10000)

						return registerShare(
							{
								provider: 'tenor',
								query: String(data.q ?? ''),
								limit: 1,
								locale: 'en-US',
								quality: getSettings().gridQuality,
								signal: controller.signal,
							},
							match[2],
						)
							.catch(error => {
								if (!controller.signal.aborted)
									logger.warn('GIF share registration failed', error)
							})
							.then(() => ({ body: {} }))
							.finally(() => {
								clearTimeout(timer)
								if (requests.get(key) === controller) requests.delete(key)
							})
					}),
				)
			patches.push(
				patchPicker(
					category => {
						if (stopped || !actions) return
						const query: string = viewStore.getQuery()
						actions.resetSearch()
						actions.fetchTrending()
						actions.fetchTrendingSearchTerms()
						if (category === 'Trending') actions.fetchTrendingGIFs(50)
						else if (category !== 'Favorites' && query)
							actions.search(query, 'Search', true, 100)
					},
					error => plugin.reportError(error),
				),
			)
			patches.push(storage.subscribe(cancelRequests))
		}
		patches.push(
			getModules(
				withProps<HttpModule>('HTTP', 'get', 'post', 'put', 'patch', 'del'),
				module => {
					if (stopped) return
					patches.push(
						getStore<GifViewStore>('GIFPickerViewStore', viewStore => {
							if (stopped) return
							try {
								install(module.HTTP, viewStore)
							} catch (error) {
								cleanup()
								plugin.reportError(error)
							}
						}),
					)
				},
			),
		)
	},
})
