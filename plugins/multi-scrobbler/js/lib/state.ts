import { DEFAULTS } from '../defaults'
import type { JsonStorage } from '@revenge-mod/json-storage'
import type { MultiScrobblerStorage } from '../types'

type RevengeJsonStorageApi<S extends object> = JsonStorage<S>

let storage: RevengeJsonStorageApi<MultiScrobblerStorage> | undefined

export function setStorage(
	handle: RevengeJsonStorageApi<MultiScrobblerStorage>,
) {
	storage = handle
}

export function getStorage() {
	return storage
}

export function getSettings(): MultiScrobblerStorage {
	return { ...DEFAULTS, ...(storage?.cache ?? {}) }
}

export function setSettings(patch: Partial<MultiScrobblerStorage>): void {
	storage?.set({ ...getSettings(), ...patch })
}

export function getSettingsSync(): MultiScrobblerStorage {
	return getSettings()
}

export function getStorageObj() {
	return {
		set: (patch: Partial<MultiScrobblerStorage>) => setSettings(patch),
	}
}

export { DEFAULTS }

export const pluginState = {
	pluginStopped: false,
	lastActivity: undefined,
	updateInterval: undefined,
	lastTrackUrl: undefined,
} as {
	pluginStopped: boolean
	lastActivity?: import('../types').Activity | null
	updateInterval?: number
	lastTrackUrl?: string
}
