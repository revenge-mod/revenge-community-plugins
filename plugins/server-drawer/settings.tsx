/** @jsxImportSource . */
import Page from '@revenge-mod/components/Page'
import { Design } from '@revenge-mod/discord/design'
import { ScrollView } from 'react-native'
import type { PluginSettingsComponent } from '@revenge-mod/plugins/types'
import type { ComponentProps } from 'react'
import type { ServerDrawerPreferences } from './types'

export const DefaultSettings: ServerDrawerPreferences = {
	dmOrder: [],
	layout: 'grid',
	pullToMarkRead: false,
}

export default function Settings({
	api: { jsonStorage },
}: ComponentProps<
	PluginSettingsComponent<{ jsonStorage: ServerDrawerPreferences }>
>) {
	const { pullToMarkRead } = jsonStorage.use() ?? DefaultSettings
	return (
		<ScrollView style={{ flex: 1 }}>
			<Page>
				<Design.TableRowGroup title="Gestures">
					<Design.TableSwitchRow
						label="Pull down to mark all as read"
						subLabel="Pull the collapsed dock down until it is flat, then release to mark all servers and DMs as read."
						value={pullToMarkRead}
						onValueChange={value => jsonStorage.set({ pullToMarkRead: value })}
					/>
				</Design.TableRowGroup>
			</Page>
		</ScrollView>
	)
}
