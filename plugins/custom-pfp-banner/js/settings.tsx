import Page from '@revenge-mod/components/Page'
import { Design } from '@revenge-mod/discord/design'
import { Linking } from 'react-native'
import { DEFAULTS, loadBG, loadPFP } from './shared'
import type { PluginSettingsComponent } from '@revenge-mod/plugins/types'
import type { ComponentProps } from 'react'
import type { Settings } from './shared'

const { Stack, TableRowGroup, TableRow, TableSwitchRow } = Design

type Props = ComponentProps<PluginSettingsComponent<{ jsonStorage: Settings }>>

export default function SettingsPage({ api }: Props) {
	const { jsonStorage, plugin } = api
	const s = jsonStorage.use() ?? DEFAULTS

	return (
		<Page>
			<Stack spacing={16} style={{ padding: 16 }}>
				<TableRowGroup title="USRBG">
					<TableSwitchRow
						label="Enable USRBG"
						subLabel="Custom profile banners from the USRBG project. Requires reload."
						value={s.userbgEnabled}
						onValueChange={v => {
							jsonStorage.set({ userbgEnabled: v })
							plugin.requireReload()
						}}
					/>
					<TableRow
						label="USRBG Project"
						onPress={() =>
							Linking.openURL('https://git.is-hardly.online/USRBG/USRBG')
						}
					/>
					<TableRow label="Reload DB" onPress={() => void loadBG(true)} />
				</TableRowGroup>
				<TableRowGroup title="UserPFP">
					<TableSwitchRow
						label="Enable UserPFP"
						subLabel="Custom avatars from the UserPFP project. Requires reload."
						value={s.userpfpEnabled}
						onValueChange={v => {
							jsonStorage.set({ userpfpEnabled: v })
							plugin.requireReload()
						}}
					/>
					<TableRow
						label="UserPFP Project"
						onPress={() =>
							Linking.openURL('https://github.com/UserPFP/UserPFP')
						}
					/>
					<TableRow label="Reload DB" onPress={() => void loadPFP(true)} />
				</TableRowGroup>
			</Stack>
		</Page>
	)
}
