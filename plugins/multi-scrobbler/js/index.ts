import { DEFAULTS } from './defaults'
import { stop, tryInitialize } from './lib/manager'
import { getSettings, setStorage } from './lib/state'
import { setToastApi } from './lib/toasts'
import { applySidebarSettings, registerPages } from './ui/pages/routes'
import Settings from './ui/pages/Settings'
import type { MultiScrobblerStorage } from './types'

export { DEFAULTS }
export type { MultiScrobblerStorage }

export default plugin<{ jsonStorage: MultiScrobblerStorage }>({
	jsonStorage: {
		load: true,
		default: DEFAULTS,
	},
	start({ cleanup, jsonStorage, plugin }) {
		setToastApi(plugin.api)
		setStorage(jsonStorage)

		// Initialize settings from shared storage
		getSettings()

		// Register settings pages (routes)
		const unregisterPages = registerPages()
		cleanup(unregisterPages)

		try {
			cleanup(applySidebarSettings())
		} catch {}

		try {
			cleanup(() => stop())
			void tryInitialize()
		} catch {}
	},
	SettingsComponent: Settings,
})
