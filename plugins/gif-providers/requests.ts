import {
	loadCategories,
	loadGifs,
	loadSuggestions,
	mergeGifs,
} from './providers'
import { getSettings, selectedProviders } from './storage'
import type { DiscordModules } from '@revenge-mod/discord/types'
import type {
	Category,
	Gif,
	HttpRequest,
	ProviderRequest,
	Trending,
} from './types'

type Operation =
	| 'search'
	| 'trending-gifs'
	| 'trending'
	| 'suggest'
	| 'trending-search'
type Result = Gif[] | string[] | Trending

async function withTimeout<T>(
	signal: AbortSignal,
	work: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
	if (signal.aborted) throw new Error('GIF request cancelled')
	const controller = new AbortController()
	const abort = () => controller.abort()
	signal.addEventListener('abort', abort)
	const timer = setTimeout(abort, 10000)
	let rejectAbort: () => void = () => {}

	try {
		const cancelled = new Promise<never>((_, reject) => {
			rejectAbort = () =>
				reject(new Error('GIF request cancelled or timed out'))
			controller.signal.addEventListener('abort', rejectAbort)
		})
		if (signal.aborted) abort()
		return await Promise.race([cancelled, work(controller.signal)])
	} finally {
		clearTimeout(timer)
		signal.removeEventListener('abort', abort)
		controller.signal.removeEventListener('abort', rejectAbort)
	}
}

export async function loadProviders(
	operation: Operation,
	query: string,
	limit: number,
	locale: string,
	mediaFormat: string,
	signal: AbortSignal,
	get: HttpRequest,
	logger: DiscordModules.Logger,
): Promise<Result> {
	const selected = selectedProviders(getSettings().providers)
	const quality = getSettings().gridQuality
	const results = await Promise.allSettled(
		selected.map(provider =>
			withTimeout(signal, async providerSignal => {
				let result: Result

				if (provider === 'klipy') {
					const response = await get({
						url: `/gifs/${operation}`,
						query: {
							q: query,
							limit:
								operation === 'search' || operation === 'trending-gifs'
									? Math.max(20, limit)
									: limit,
							locale,
							media_format: mediaFormat,
						},
					})
					result = response.body as Result
					if (
						operation === 'trending'
							? !result ||
								!Array.isArray((result as Trending).categories) ||
								!Array.isArray((result as Trending).gifs)
							: !Array.isArray(result)
					) {
						throw new Error('Invalid Klipy response')
					}
				} else {
					const context: ProviderRequest = {
						provider,
						query,
						limit,
						locale,
						quality,
						signal: providerSignal,
					}

					if (operation === 'trending') {
						const [categories, gifs] = await Promise.allSettled([
							loadCategories(context),
							loadGifs({ ...context, limit: 1 }, true),
						])
						if (categories.status === 'rejected' && gifs.status === 'rejected')
							throw categories.reason
						result = {
							categories:
								categories.status === 'fulfilled' ? categories.value : [],
							gifs: gifs.status === 'fulfilled' ? gifs.value : [],
						}
					} else if (
						operation === 'suggest' ||
						operation === 'trending-search'
					) {
						result = await loadSuggestions(
							context,
							operation === 'trending-search',
						)
					} else {
						result = await loadGifs(context, operation === 'trending-gifs')
					}
				}

				if (operation === 'search' || operation === 'trending-gifs') {
					return (result as Gif[])
						.filter(
							gif =>
								typeof gif?.id === 'string' &&
								typeof gif.url === 'string' &&
								typeof gif.src === 'string' &&
								gif.width > 0 &&
								gif.height > 0,
						)
						.map(gif => ({ ...gif, id: `${provider}:${gif.id}` }))
				}
				return result
			}),
		),
	)
	const pages: Result[] = []

	results.forEach((result, index) => {
		if (result.status === 'fulfilled') pages.push(result.value)
		else if (!signal.aborted)
			logger.warn(
				`[GifProviders] ${selected[index]} ${operation} failed`,
				result.reason,
			)
	})
	if (!pages.length) throw new Error('No GIF providers responded')

	if (operation === 'trending') {
		const categories = new Map<string, Category>()
		const gifs: Pick<Gif, 'src'>[] = []

		for (const page of pages as Trending[]) {
			for (const category of page.categories) {
				if (
					typeof category?.name !== 'string' ||
					typeof category.src !== 'string'
				)
					continue
				if (!categories.has(category.name.toLowerCase()))
					categories.set(category.name.toLowerCase(), category)
			}
			gifs.push(...page.gifs.filter(gif => typeof gif?.src === 'string'))
		}

		return {
			categories: [...categories.values()],
			gifs: gifs.length ? gifs : [{ src: '' }],
		}
	}
	if (operation === 'suggest' || operation === 'trending-search')
		return [
			...new Set(
				(pages as string[][]).flat().filter(item => typeof item === 'string'),
			),
		].slice(0, 5)
	return mergeGifs(pages as Gif[][], limit)
}
