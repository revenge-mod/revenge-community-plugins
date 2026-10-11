import { NetInfo } from '@revenge-mod/externals/react-native-community'
import { getJsonStorage } from '@revenge-mod/json-storage'
import { getModules } from '@revenge-mod/modules/finders'
import { withName } from '@revenge-mod/modules/finders/filters'
import { before, instead } from '@revenge-mod/patcher'
import { pluginStorageDirFor } from '@revenge-mod/plugins/constants'
import { React, ReactJSXRuntime } from '@revenge-mod/react'
import { useSyncExternalStore } from 'react'
import {
	createBadgeStore,
	DefaultSettings,
	isRecord,
	parseBadges,
} from './badges'
import SettingsComponent from './settings'
import type { JsonStorage } from '@revenge-mod/json-storage'
import type { AnyPlugin } from '@revenge-mod/plugins/_'
import type { AnyObject } from '@revenge-mod/utils/types'
import type { Settings } from './badges'

const RefreshInterval = 30 * 60 * 1000

type UseBadges = (user: { userId: string } | null) => unknown[]

let controller: AbortController | undefined
let active = true
let fetching = false
let timeout: ReturnType<typeof setTimeout> | undefined

async function fetchBadges(
	jsonStorage: JsonStorage<Settings>,
	cacheStorage: JsonStorage<AnyObject>,
): Promise<AnyObject> {
	const requestController = new AbortController()
	controller = requestController
	timeout = setTimeout(() => requestController.abort(), 30_000)

	const storage = await jsonStorage.get()
	const netInfo = await NetInfo.fetch()

	if (
		// User said to not update on metered connections...
		(netInfo.details?.isConnectionExpensive &&
			!jsonStorage.cache?.updateOnMetered) ||
		// or, cached data is still valid
		Date.now() - (storage.lastFetched ?? 0) < RefreshInterval
	) {
		return await cacheStorage.get()
	}

	const response = await fetch('https://badges.equicord.org/users', {
		signal: requestController.signal,
		cache: 'no-cache',
	})

	if (!response.ok) throw new Error(`Badge service returned ${response.status}`)

	const json = await response.json()
	await cacheStorage.set(json)
	return json
}

async function refresh(
	jsonStorage: JsonStorage<Settings>,
	cacheStorage: JsonStorage<AnyObject>,
	plugin: AnyPlugin,
	store: ReturnType<typeof createBadgeStore>,
) {
	if (fetching || !active) return
	fetching = true

	try {
		const json = await fetchBadges(jsonStorage, cacheStorage)
		const users = parseBadges(json)
		if (active) store.setUsers(users)
	} catch (error) {
		if (active) plugin.reportError(error)
	} finally {
		clearTimeout(timeout)
		fetching = false
	}
}

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: { load: true, default: DefaultSettings },
	start({ cleanup, jsonStorage, plugin }) {
		if (plugin.startedLate) {
			plugin.requireReload()
			return
		}

		const cacheStorage = getJsonStorage(
			`${pluginStorageDirFor(plugin.manifest.id)}/cache.json`,
		)

		const store = createBadgeStore()

		const syncSettings = () => {
			const value = jsonStorage.cache
			store.setSettings({
				left: value?.left === true,
				showModStyle:
					value?.showModStyle === 'prefix' || value?.showModStyle === 'suffix'
						? value.showModStyle
						: 'none',
				providers: value?.providers ?? {},
			})
		}

		cleanup(() => {
			active = false
			controller?.abort()
			clearTimeout(timeout)
		})

		syncSettings()
		cleanup(jsonStorage.subscribe(syncSettings))

		cleanup(
			getModules(
				withName<UseBadges>('useBadges'),
				module => {
					if (
						!active ||
						!('default' in module) ||
						typeof module.default !== 'function'
					)
						return
					cleanup(
						instead(module, 'default', function (args, original) {
							useSyncExternalStore(store.subscribe, store.getSnapshot)
							const result = Reflect.apply(original, this, args)
							const user = args[0]
							return user?.userId && Array.isArray(result)
								? store.addBadges(result, user.userId)
								: result
						}),
					)
				},
				{ returnNamespace: true, max: Infinity },
			),
		)

		function badgeProps(props: unknown) {
			if (!isRecord(props) || typeof props.id !== 'string') return
			const custom = store.getProps(props.id)
			if (custom) return { ...props, ...custom }
		}

		function patchBadgeProps<Args extends [unknown, unknown?, ...unknown[]]>(
			args: Args,
		): Args {
			const props = badgeProps(args[1])
			if (props) args[1] = props
			return args
		}

		cleanup(
			before(ReactJSXRuntime, 'jsx', patchBadgeProps),
			before(ReactJSXRuntime, 'jsxs', patchBadgeProps),
			before(React, 'createElement', patchBadgeProps),
		)

		refresh(jsonStorage, cacheStorage, plugin, store).then(() => {
			const interval = setInterval(refresh, RefreshInterval)
			cleanup(() => clearInterval(interval))
		})
	},
	stop({ plugin }) {
		plugin.requireReload()
	},
	SettingsComponent,
})
