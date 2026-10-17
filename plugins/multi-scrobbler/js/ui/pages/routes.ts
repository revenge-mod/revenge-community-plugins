import Debug from './Debug'
import DisplaySettingsPage from './pages/DisplaySettingsPage'
import IgnoreListSettingsPage from './pages/IgnoreListSettingsPage'
import LastFmSettingsPage from './pages/LastFmSettingsPage'
import LibreFmSettingsPage from './pages/LibreFmSettingsPage'
import ListenBrainzSettingsPage from './pages/ListenBrainzSettingsPage'
import LoggingSettingsPage from './pages/LoggingSettingsPage'
import MediaSessionPage from './pages/MediaSessionPage'
import RPCCustomizationSettingsPage from './pages/RPCCustomizationSettingsPage'

const PREFIX = 'kmmiio99o.multi-scrobbler'

export const LASTFM_ROUTE = `${PREFIX}.lastfm`
export const LIBREFM_ROUTE = `${PREFIX}.librefm`
export const LISTENBRAINZ_ROUTE = `${PREFIX}.listenbrainz`
export const DISPLAY_ROUTE = `${PREFIX}.display`
export const RPC_ROUTE = `${PREFIX}.rpc`
export const IGNORE_LIST_ROUTE = `${PREFIX}.ignore-list`
export const LOGGING_ROUTE = `${PREFIX}.logging`
export const MEDIA_SESSION_ROUTE = `${PREFIX}.mediasession`
export const DEBUG_ROUTE = `${PREFIX}.debug`

function refreshSettingsUI() {
	const settings = revenge.discord.modules.settings as any
	if (typeof settings.refreshSettings === 'function') {
		settings.refreshSettings()
		return
	}
	settings.refreshSettingsNavigator?.()
	settings.refreshSettingsOverviewScreen?.()
}

export function registerPages(): () => void {
	const { registerSettingsItem } = revenge.discord.modules.settings

	const unregister = [
		registerSettingsItem(LASTFM_ROUTE, {
			parent: null,
			type: 'route',
			useTitle: () => 'Last.fm Settings',
			screen: { route: LASTFM_ROUTE, getComponent: () => LastFmSettingsPage },
		}),
		registerSettingsItem(LIBREFM_ROUTE, {
			parent: null,
			type: 'route',
			useTitle: () => 'Libre.fm Settings',
			screen: { route: LIBREFM_ROUTE, getComponent: () => LibreFmSettingsPage },
		}),
		registerSettingsItem(LISTENBRAINZ_ROUTE, {
			parent: null,
			type: 'route',
			useTitle: () => 'ListenBrainz Settings',
			screen: {
				route: LISTENBRAINZ_ROUTE,
				getComponent: () => ListenBrainzSettingsPage,
			},
		}),
		registerSettingsItem(DISPLAY_ROUTE, {
			parent: null,
			type: 'route',
			useTitle: () => 'Display Settings',
			screen: { route: DISPLAY_ROUTE, getComponent: () => DisplaySettingsPage },
		}),
		registerSettingsItem(RPC_ROUTE, {
			parent: null,
			type: 'route',
			useTitle: () => 'RPC Customization',
			screen: {
				route: RPC_ROUTE,
				getComponent: () => RPCCustomizationSettingsPage,
			},
		}),
		registerSettingsItem(IGNORE_LIST_ROUTE, {
			parent: null,
			type: 'route',
			useTitle: () => 'Ignore List Settings',
			screen: {
				route: IGNORE_LIST_ROUTE,
				getComponent: () => IgnoreListSettingsPage,
			},
		}),
		registerSettingsItem(LOGGING_ROUTE, {
			parent: null,
			type: 'route',
			useTitle: () => 'Logging Settings',
			screen: { route: LOGGING_ROUTE, getComponent: () => LoggingSettingsPage },
		}),
		registerSettingsItem(MEDIA_SESSION_ROUTE, {
			parent: null,
			type: 'route',
			useTitle: () => 'Media Session',
			screen: {
				route: MEDIA_SESSION_ROUTE,
				getComponent: () => MediaSessionPage,
			},
		}),
		registerSettingsItem(DEBUG_ROUTE, {
			parent: null,
			type: 'route',
			useTitle: () => 'Debug Console',
			screen: { route: DEBUG_ROUTE, getComponent: () => Debug },
		}),
	]

	refreshSettingsUI()

	return () => {
		for (const remove of unregister) remove()
		refreshSettingsUI()
	}
}

let unregister: (() => void) | null = null

export function applySidebarSettings(): () => void {
	return () => {
		if (unregister) {
			unregister()
			unregister = null
		}
	}
}
