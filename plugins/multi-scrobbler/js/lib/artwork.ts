/**
 * Resolves album artwork as a public https URL for Discord rich presence.
 *
 * Local media sessions only expose raw bitmap bytes, which Discord cannot
 * render — its asset-upload endpoint is OAuth-gated, and `external-assets`
 * needs a public URL. So we look the cover up by metadata instead.
 *
 * Results are cached per search term (including misses) since the manager
 * polls every second.
 */

const CACHE_LIMIT = 128
const artworkCache = new Map<string, string | ''>()

async function queryItunes(term: string): Promise<string | null> {
	try {
		const controller = new AbortController()
		const timeout = setTimeout(() => controller.abort(), 5000)
		const res = await fetch(
			`https://itunes.apple.com/search?media=music&entity=song&limit=5&term=${encodeURIComponent(term)}`,
			{ signal: controller.signal },
		)
		clearTimeout(timeout)
		if (!res.ok) return null

		const json: any = await res.json()
		for (const result of json?.results ?? []) {
			const art: unknown = result?.artworkUrl100
			if (typeof art === 'string' && art) {
				// Upgrade the 100x100 thumbnail to full resolution.
				return art.replace('100x100', '600x600')
			}
		}
		return null
	} catch {
		return null
	}
}

function cacheGet(key: string): string | null {
	const hit = artworkCache.get(key)
	return hit === undefined ? null : hit || null
}

function cacheSet(key: string, value: string | null) {
	if (artworkCache.size >= CACHE_LIMIT) artworkCache.clear()
	artworkCache.set(key, value ?? '')
}

/** Best-effort cover-art URL, or null when nothing sensible was found. */
export async function findAlbumArtUrl(
	artist: string,
	album: string,
	title: string,
): Promise<string | null> {
	const terms = [`${artist} ${album}`.trim(), `${artist} ${title}`.trim()]
	for (const term of terms) {
		if (!term || term.toLowerCase() === 'unknown') continue

		const key = term.toLowerCase()
		const cached = cacheGet(key)
		if (cached !== null) return cached

		const url = await queryItunes(term)
		cacheSet(key, url)
		if (url) return url
	}
	return null
}
