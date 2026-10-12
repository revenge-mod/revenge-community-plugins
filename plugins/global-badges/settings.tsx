import Page from '@revenge-mod/components/Page'
import { Design } from '@revenge-mod/discord/design'
import { Linking, ScrollView } from 'react-native'
import { DefaultSettings, Providers } from './badges'
import type { PluginSettingsComponent } from '@revenge-mod/plugins/types'
import type { ComponentProps } from 'react'
import type { ModStyle, Settings } from './badges'

const {
	TableRow,
	TableRowGroup,
	TableSwitchRow,
	TableRadioGroup,
	TableRadioRow,
} = Design

type Props = ComponentProps<PluginSettingsComponent<{ jsonStorage: Settings }>>

export default function SettingsComponent({
	api: { jsonStorage: storage },
}: Props) {
	const settings = storage.use() ?? DefaultSettings

	return (
		<ScrollView
			style={{ flex: 1 }}
			contentContainerStyle={{ paddingBottom: 24 }}
		>
			<Page>
				<TableRowGroup>
					<TableRow
						label="Get a BadgeVault badge"
						onPress={() => Linking.openURL('https://discord.gg/eTvYv95PCG')}
					/>
					<TableSwitchRow
						label="Show custom badges first"
						value={settings.left ?? false}
						onValueChange={left => storage.set({ left })}
					/>
					<TableSwitchRow
						label="Update badges on metered connections"
						value={settings.updateOnMetered ?? false}
						onValueChange={updateOnMetered => storage.set({ updateOnMetered })}
					/>
				</TableRowGroup>
				<TableRadioGroup
					title="Client names"
					defaultValue={settings.showModStyle ?? 'none'}
					onChange={(showModStyle: ModStyle) => storage.set({ showModStyle })}
				>
					<TableRadioRow value="none" label="Hide client names" />
					<TableRadioRow value="prefix" label="Show before badge name" />
					<TableRadioRow value="suffix" label="Show after badge name" />
				</TableRadioGroup>
				<TableRowGroup title="Badge providers">
					{Object.entries(Providers).map(([provider, label]) => (
						<TableSwitchRow
							key={provider}
							label={label}
							value={
								settings.providers?.[provider as keyof typeof Providers] ?? true
							}
							onValueChange={enabled =>
								storage.set({ providers: { [provider]: enabled } })
							}
						/>
					))}
				</TableRowGroup>
			</Page>
		</ScrollView>
	)
}
