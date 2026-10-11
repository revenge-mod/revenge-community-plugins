interface UserBGData {
	endpoint: string
	bucket: string
	prefix: string
	users: Record<string, string>
}

interface UserPFPData {
	avatars: Record<string, string>
}

type NitroSettings = {
	userbgEnabled: boolean
	userpfpEnabled: boolean
}

const DEFAULTS: NitroSettings = {
	userbgEnabled: true,
	userpfpEnabled: true,
}

let bgData: UserBGData | null = null
let pfpData: UserPFPData | null = null
let jsonStorageRef: any = null
let pluginRef: any = null

async function fetchBG(): Promise<UserBGData | null> {
	try {
		const res = await fetch('https://usrbg.is-hardly.online/users', { cache: 'no-store' })
		bgData = await res.json()
		return bgData
	} catch {
		return null
	}
}

async function fetchPFP(): Promise<UserPFPData | null> {
	try {
		const res = await fetch('https://userpfp.github.io/UserPFP/source/data.json', {
			headers: { 'cache-control': 'max-age=1800' },
		})
		pfpData = await res.json()
		return pfpData
	} catch {
		return null
	}
}

function urlExt(url: string): string {
	return url.split('.').pop() ?? ''
}

function getCustomAvatar(id: string, isStatic?: boolean): string | undefined {
	if (!pfpData?.avatars[id]) return undefined
	const avatar = pfpData.avatars[id]
	if (isStatic && urlExt(avatar) === 'gif') return avatar.replace('.gif', '.png')
	return avatar
}

function NitroSettings() {
	const { React } = revenge.react
	const { Linking } = revenge.react.ReactNative
	const { Page } = revenge.components
	const { Stack, TableRowGroup, TableRow, TableSwitchRow, Card, Text } = (revenge as any).discord?.design?.Design ?? {}

	const s: NitroSettings = jsonStorageRef?.use() ?? DEFAULTS

	const [bgReloading, setBGReloading] = React.useState(false)
	const [pfpReloading, setPFPReloading] = React.useState(false)
	const [bgStatus, setBGStatus] = React.useState<string | null>(null)
	const [pfpStatus, setPFPStatus] = React.useState<string | null>(null)

	if (!TableRowGroup || !TableRow || !TableSwitchRow) return null

	return (
		<Page>
			<Stack spacing={16} style={{ padding: 16 }}>
				{Card && Text && (
					<Card style={{ paddingVertical: 14, paddingHorizontal: 16 }}>
						<Text variant="heading-md/semibold">How this plugin works</Text>
						<Text variant="text-sm/medium" color="text-muted" style={{ marginTop: 4 }}>
							Only UserPFP (custom avatars) requires a Discord restart after toggling. Everything else applies instantly.
						</Text>
					</Card>
				)}
				<TableRowGroup title={bgStatus ?? 'UserBG'}>
					<TableSwitchRow
						label="Enable UserBG"
						subLabel="Custom profile banners from the UserBG project"
						value={s.userbgEnabled}
						onValueChange={(v: boolean) => jsonStorageRef?.set({ userbgEnabled: v })}
					/>
					<TableRow
						label="UserBG Project"
						onPress={() => Linking.openURL('https://git.is-hardly.online/USRBG/USRBG')}
					/>
					<TableRow
						label={bgReloading ? 'Reloading…' : 'Reload DB'}
						disabled={bgReloading}
						onPress={async () => {
							setBGReloading(true)
							setBGStatus(null)
							const result = await fetchBG()
							setBGStatus(result ? 'DB reloaded!' : 'Failed to reload DB')
							setBGReloading(false)
						}}
					/>
				</TableRowGroup>

				<TableRowGroup title={pfpStatus ?? 'UserPFP'}>
					<TableSwitchRow
						label="Enable UserPFP"
						subLabel="Custom avatars from the UserPFP project — requires reload"
						value={s.userpfpEnabled}
						onValueChange={(v: boolean) => {
							jsonStorageRef?.set({ userpfpEnabled: v })
							pluginRef?.requireReload()
						}}
					/>
					<TableRow
						label="UserPFP Project"
						onPress={() => Linking.openURL('https://github.com/UserPFP/UserPFP')}
					/>
					<TableRow
						label={pfpReloading ? 'Reloading…' : 'Reload DB'}
						disabled={pfpReloading}
						onPress={async () => {
							setPFPReloading(true)
							setPFPStatus(null)
							const result = await fetchPFP()
							setPFPStatus(result ? 'DB reloaded!' : 'Failed to reload DB')
							setPFPReloading(false)
						}}
					/>
				</TableRowGroup>
			</Stack>
		</Page>
	)
}

export default plugin<{ jsonStorage: NitroSettings }>({
	jsonStorage: {
		load: true,
		default: DEFAULTS,
	},
	start({ cleanup, jsonStorage, plugin }) {
		jsonStorageRef = jsonStorage
		pluginRef = plugin
		fetchBG()
		fetchPFP()

		const { filters, lookupModule, waitForModules } = revenge.modules.finders

		// --- UserBG: patch getUserBannerURL ---
		let unpatchBG: (() => void) | null = null
		function applyBGPatch() {
			const mod = lookupModule(filters.withProps('getUserBannerURL'))?.[0]
			if (!mod || unpatchBG) return
			const original = mod.getUserBannerURL
			mod.getUserBannerURL = (user: any) => {
				if (jsonStorage.cache.userbgEnabled && bgData && user?.banner === undefined) {
					const entry = bgData.users[user?.id]
					if (entry) return `${bgData.endpoint}/${bgData.bucket}/${bgData.prefix}${user.id}?${entry}`
				}
				return original(user)
			}
			unpatchBG = () => { mod.getUserBannerURL = original }
		}
		applyBGPatch()
		cleanup(waitForModules(filters.withProps('getUserBannerURL'), () => applyBGPatch()))

		// --- UserPFP: patch getUserAvatarURL + getUserAvatarSource ---
		let unpatchAvatarURLBefore: (() => void) | null = null
		let unpatchAvatarURL: (() => void) | null = null
		let unpatchAvatarSourceBefore: (() => void) | null = null
		let unpatchAvatarSource: (() => void) | null = null

		function applyPFPPatches() {
			const avatarMod = lookupModule(filters.withProps('getUserAvatarURL', 'getUserAvatarSource'))?.[0]
			if (avatarMod) {
				if (!unpatchAvatarURL) {
					let pendingURL: { id: string, animate: boolean } | null = null
					unpatchAvatarURLBefore = revenge.patcher.before(avatarMod, 'getUserAvatarURL', (args: any[]) => {
						pendingURL = { id: args[0]?.id, animate: !!args[1] }
						return args
					})
					unpatchAvatarURL = revenge.patcher.after(avatarMod, 'getUserAvatarURL', (ret: any) => {
						const p = pendingURL; pendingURL = null
						if (!jsonStorage.cache.userpfpEnabled || !p) return ret
						return getCustomAvatar(p.id, !p.animate) ?? ret
					})
				}
				if (!unpatchAvatarSource) {
					let pendingSource: { id: string, animate: boolean } | null = null
					unpatchAvatarSourceBefore = revenge.patcher.before(avatarMod, 'getUserAvatarSource', (args: any[]) => {
						pendingSource = { id: args[0]?.id, animate: !!args[1] }
						return args
					})
					unpatchAvatarSource = revenge.patcher.after(avatarMod, 'getUserAvatarSource', (ret: any) => {
						const p = pendingSource; pendingSource = null
						if (!jsonStorage.cache.userpfpEnabled || !p) return ret
						const custom = getCustomAvatar(p.id, !p.animate)
						if (!custom) return ret
						if (ret && typeof ret === 'object' && typeof ret.uri === 'string') return { ...ret, uri: custom }
						if (typeof ret === 'number') return { uri: custom }
						return ret
					})
				}
			}
		}

		applyPFPPatches()
		cleanup(waitForModules(filters.withProps('getUserAvatarURL', 'getUserAvatarSource'), () => applyPFPPatches()))

		if (plugin.startedLate) plugin.requireReload()

		cleanup(() => {
			unpatchBG?.()
			unpatchAvatarURLBefore?.()
			unpatchAvatarURL?.()
			unpatchAvatarSourceBefore?.()
			unpatchAvatarSource?.()
		})
	},
	SettingsComponent: NitroSettings,
})
