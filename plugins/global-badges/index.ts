import { getModules } from '@revenge-mod/modules/finders'
import { withName } from '@revenge-mod/modules/finders/filters'
import { before, instead } from '@revenge-mod/patcher'
import { React, ReactJSXRuntime } from '@revenge-mod/react'
import { useSyncExternalStore } from 'react'
import {
	createBadgeStore,
	DefaultSettings,
	isRecord,
	parseBadges,
} from './badges'
import SettingsComponent from './settings'
import type { Settings } from './badges'

const RefreshInterval = 30 * 60 * 1000

type UseBadges = (user: { userId: string } | null) => unknown[]

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: { load: true, default: DefaultSettings },
	start({ cleanup, jsonStorage, plugin }) {
		if (plugin.startedLate) {
			plugin.requireReload()
			return
		}
		const store = createBadgeStore()
		let controller: AbortController | undefined
		let active = true
		let loading = false
		let timeout: ReturnType<typeof setTimeout> | undefined

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

		async function refresh() {
			if (loading || !active) return
			loading = true
			const requestController = new AbortController()
			controller = requestController
			timeout = setTimeout(() => requestController.abort(), 30_000)
			try {
				const response = await fetch('https://badges.equicord.org/users', {
					cache: 'no-cache',
					signal: requestController.signal,
				})
				if (!response.ok)
					throw new Error(`Badge service returned ${response.status}`)
				const users = parseBadges(await response.json())
				if (active) store.setUsers(users)
			} catch (error) {
				if (active) plugin.reportError(error)
			} finally {
				clearTimeout(timeout)
				loading = false
			}
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

		refresh()
		const interval = setInterval(refresh, RefreshInterval)
		cleanup(() => clearInterval(interval))
	},
	stop({ plugin }) {
		plugin.requireReload()
	},
	SettingsComponent,
})
