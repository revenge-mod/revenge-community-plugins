import { getModules } from '@revenge-mod/modules/finders'
import { withProps } from '@revenge-mod/modules/finders/filters'
import { instead } from '@revenge-mod/patcher'
import SettingsComponent from './settings'
import { DEFAULTS, getBannerURL, getCustomAvatar } from './shared'
import type { Settings } from './shared'

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: {
		load: true,
		default: DEFAULTS,
	},
	start({ cleanup, jsonStorage, plugin }) {
		if (plugin.startedLate) {
			plugin.requireReload()
			return
		}

		// --- USRBG: patch getUserBannerURL ---
		cleanup(
			getModules(withProps('getUserBannerURL'), mod => {
				cleanup(
					instead(mod as any, 'getUserBannerURL', (args, original) => {
						const ret = original(...args)
						const user = args[0]
						if (
							jsonStorage.cache?.userbgEnabled !== true ||
							user?.banner !== undefined
						)
							return ret
						return getBannerURL(user) ?? ret
					}),
				)
			}),
		)

		// --- UserPFP: patch getUserAvatarURL + getUserAvatarSource ---
		cleanup(
			getModules(withProps('getUserAvatarURL', 'getUserAvatarSource'), mod => {
				cleanup(
					instead(mod as any, 'getUserAvatarURL', (args, original) => {
						const ret = original(...args)
						if (jsonStorage.cache?.userpfpEnabled !== true) return ret
						const custom = getCustomAvatar(args[0]?.id, !args[1])
						return custom ?? ret
					}),
					instead(mod as any, 'getUserAvatarSource', (args, original) => {
						const ret = original(...args)
						if (jsonStorage.cache?.userpfpEnabled !== true) return ret
						const custom = getCustomAvatar(args[0]?.id, !args[1])
						if (!custom) return ret
						if (ret && typeof ret === 'object' && typeof ret.uri === 'string')
							return { ...ret, uri: custom }
						if (typeof ret === 'number') return { uri: custom }
						return ret
					}),
				)
			}),
		)
	},
	SettingsComponent,
})
