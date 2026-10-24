import type { Category, Gif, ProviderRequest } from './types'

const TENOR_KEY = '3Z0688EVWYKH'
// Public key used by giphy.com.
const GIPHY_KEY = 'Gc7131jiJuvI7IdN0HZ1D7nh0ow5BU6g'

function record(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object'
		? (value as Record<string, unknown>)
		: {}
}

function list(value: unknown): unknown[] {
	return Array.isArray(value) ? value : []
}

function text(value: unknown): string {
	return typeof value === 'string' ? value : ''
}

async function request(
	context: ProviderRequest,
	path: string,
	params: Record<string, string> = {},
) {
	const { provider, locale, signal } = context
	const language = locale.replace('_', '-').toLowerCase()
	const query: Record<string, string> =
		provider === 'tenor'
			? { key: TENOR_KEY, locale: language.replace('-', '_') }
			: {
					api_key: GIPHY_KEY,
					lang: language.startsWith('zh')
						? language.includes('tw')
							? 'zh-TW'
							: 'zh-CN'
						: language.split('-')[0],
				}
	const url = `https://api.${provider}.com/v1/${path}?${new URLSearchParams({ ...query, ...params })}`
	const response = await fetch(url, { signal })
	if (!response.ok)
		throw new Error(`${provider} request failed (${response.status})`)
	return record(await response.json())
}

function normalize(value: unknown, context: ProviderRequest): Gif | null {
	const item = record(value)
	const { provider, quality } = context
	const media = record(list(item.media)[0])
	const images = record(item.images)
	const rendition = {
		gif: 'original',
		tinygif: 'fixed_height',
		nanogif: 'fixed_height_small',
	}[quality]
	const format = record(
		provider === 'tenor'
			? (media[quality] ??
					media.tinygif ??
					media.gif ??
					media.mp4 ??
					media.webm)
			: (images[rendition] ?? images.original),
	)
	const original = record(provider === 'tenor' ? media.gif : images.original)
	const dims = list(format.dims)
	const width = Number(provider === 'tenor' ? dims[0] : format.width)
	const height = Number(provider === 'tenor' ? dims[1] : format.height)
	const id = text(item.id)
	const url = text(provider === 'tenor' ? item.itemurl : item.url)
	const src = text(format.url)
	if (
		!id ||
		!url ||
		!src ||
		!Number.isFinite(width) ||
		!Number.isFinite(height) ||
		width <= 0 ||
		height <= 0
	)
		return null

	return {
		id,
		title: text(item.title),
		url,
		src,
		gif_src: text(original.url) || src,
		width,
		height,
		preview: src,
	}
}

export async function loadGifs(
	context: ProviderRequest,
	trending: boolean,
): Promise<Gif[]> {
	const { provider, limit, query } = context
	const items = new Map<string, Gif>()
	let cursor = ''

	for (let page = 0; page < 5 && items.size < limit; page++) {
		const params: Record<string, string> = {
			limit: String(Math.min(50, limit - items.size)),
		}
		if (!trending) params.q = query
		if (provider === 'tenor' && cursor) params.pos = cursor
		if (provider === 'giphy') params.offset = String(page * 50)

		const endpoint = trending ? 'trending' : 'search'
		const response = await request(
			context,
			provider === 'tenor' ? endpoint : `gifs/${endpoint}`,
			params,
		)
		const results = list(
			provider === 'tenor' ? response.results : response.data,
		)

		for (const value of results) {
			const gif = normalize(value, context)
			if (gif) items.set(gif.id, gif)
		}

		if (!results.length) break
		if (provider === 'giphy' && results.length < Number(params.limit)) break
		if (provider === 'tenor') {
			const next = text(response.next)
			if (!next || next === cursor || next === '0') break
			cursor = next
		}
	}

	return [...items.values()].slice(0, limit)
}

export async function loadCategories(
	context: ProviderRequest,
): Promise<Category[]> {
	const tenor = context.provider === 'tenor'
	const response = await request(
		context,
		tenor ? 'categories' : 'gifs/categories',
		tenor ? { type: 'featured' } : {},
	)
	return list(
		tenor ? (response.tags ?? response.results) : response.data,
	).flatMap(value => {
		const item = record(value)
		const name = text(tenor ? item.searchterm : item.name)
		const src = tenor ? text(item.image) : normalize(item.gif, context)?.src
		return name && src ? [{ name, src }] : []
	})
}

export async function loadSuggestions(
	context: ProviderRequest,
	trending: boolean,
): Promise<string[]> {
	const tenor = context.provider === 'tenor'

	const path = tenor
		? trending
			? 'trending_terms'
			: 'search_suggestions'
		: trending
			? 'trending/searches'
			: 'gifs/search/tags'
	const response = await request(context, path, {
		q: context.query,
		limit: '5',
	})
	return list(tenor ? response.results : response.data)
		.map(value =>
			typeof value === 'string' ? value : text(record(value).name),
		)
		.filter(Boolean)
}

export async function registerShare(context: ProviderRequest, id: string) {
	await request(context, 'registershare', { id, q: context.query })
}

export function mergeGifs(pages: Gif[][], limit: number): Gif[] {
	const result: Gif[] = []
	const seen = new Set<string>()
	const length = Math.max(0, ...pages.map(page => page.length))

	for (let index = 0; index < length && result.length < limit; index++) {
		for (const page of pages) {
			const gif = page[index]
			if (!gif || seen.has(gif.url)) continue
			seen.add(gif.url)
			result.push(gif)
			if (result.length === limit) break
		}
	}

	return result
}
