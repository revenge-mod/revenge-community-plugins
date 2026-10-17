import { Dispatcher } from '@revenge-mod/discord/common/flux'
import Constants from '../constants'
import { stop } from './manager'
import { getAssetManager, getHTTPUtils } from './modules'
import { pluginState } from './state'
import type { Activity } from '../types'

/** Clears the user's activity */
export function clearActivity() {
	return sendRequest(null)
}

/** Sends the activity details to Discord */
export function sendRequest(activity: Activity | null) {
	if (pluginState.pluginStopped) {
		stop()
		activity = null
	}

	pluginState.lastActivity = activity

	Dispatcher.dispatch({
		type: 'LOCAL_ACTIVITY_UPDATE',
		activity: activity,
		pid: 2312,
		socketId: 'Multi-Scrobbler@Revenge-next',
	})
}

async function resolveExternalAssets(
	urls: string[],
	appId: string,
): Promise<string[]> {
	const httpUtils = getHTTPUtils()
	const baseUrl = httpUtils.getAPIBaseURL()
	const endpoint = `${baseUrl}/applications/${appId}/external-assets`

	const resp = await httpUtils.post({
		url: endpoint,
		body: { urls },
		oldFormErrors: true,
		rejectWithError: false,
	})
	const body = resp?.body

	if (!Array.isArray(body)) return []

	return body.map(
		(item: { url: string; external_asset_path: string }) =>
			`mp:${item.external_asset_path}`,
	)
}

/** Resolves external image URLs to Discord asset paths */
export async function fetchAsset(
	asset: string[],
	appId: string = Constants.APPLICATION_ID,
): Promise<string[]> {
	if (!asset?.length) return []

	const remoteUrls: string[] = []
	for (const url of asset) {
		if (url && !url.startsWith('data:')) remoteUrls.push(url)
	}
	if (remoteUrls.length === 0) return []

	try {
		const assetManager = getAssetManager()
		const result = await assetManager.fetchAssetIds(appId, remoteUrls)

		// If it returned an actual array with results, use it
		if (Array.isArray(result) && result.length > 0 && result[0]) {
			return result
		}

		// fetchAssetIds returned empty/broken — try external-assets API
		const httpUrls = remoteUrls.filter(
			url => url.startsWith('http:') || url.startsWith('https:'),
		)
		if (httpUrls.length === 0) return []

		return await resolveExternalAssets(httpUrls, appId)
	} catch (_error) {
		return []
	}
}
