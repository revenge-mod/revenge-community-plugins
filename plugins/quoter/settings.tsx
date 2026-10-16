/** @jsxImportSource . */
import { getAssetIdByName as findAssetId } from '@revenge-mod/assets'
import { Design } from '@revenge-mod/discord/design'
import { useEffect } from 'react'
import { ScrollView } from 'react-native'
import {
	configureStorage,
	DEFAULT_WATERMARK,
	loadSettings,
	useQuoterSettings,
} from './storage'
import type { PluginSettingsComponent } from '@revenge-mod/plugins/types'
import type { ComponentProps } from 'react'
import type { QuoterSettings } from './types'

export default function Settings({
	api: { jsonStorage, plugin },
}: ComponentProps<PluginSettingsComponent<{ jsonStorage: QuoterSettings }>>) {
	configureStorage(jsonStorage)
	jsonStorage.use()
	useEffect(() => {
		void loadSettings().catch(error => plugin.reportError(error))
	}, [plugin])
	const settings = useQuoterSettings()

	return (
		<ScrollView
			style={{ flex: 1 }}
			contentContainerStyle={{ paddingBottom: 38 }}
		>
			<Design.Stack
				style={{ paddingVertical: 24, paddingHorizontal: 12 }}
				spacing={24}
			>
				<Design.TableRowGroup title="Quote content">
					<Design.TableSwitchRow
						label="Quotation marks"
						subLabel={'Add " on both sides of the quote text.'}
						value={settings.quotationMarks}
						onValueChange={quotationMarks =>
							settings.updateSettings({ quotationMarks })
						}
					/>
					<Design.TableSwitchRow
						label="Allow media"
						subLabel="Include images and GIFs. Animated media exports as a GIF."
						value={settings.allowMedia}
						onValueChange={allowMedia =>
							settings.updateSettings({ allowMedia })
						}
					/>
					<Design.TableSwitchRow
						label="Allow replies"
						subLabel="Show an Include reply toggle when quoting a reply."
						value={settings.allowReplies}
						onValueChange={allowReplies =>
							settings.updateSettings({ allowReplies })
						}
					/>
				</Design.TableRowGroup>
				<Design.TableRowGroup title="Rendering">
					<Design.TableSwitchRow
						label="Grayscale"
						subLabel="Render the avatar in black and white"
						icon={<Design.TableRow.Icon source={findAssetId('ImageIcon')} />}
						value={Boolean(settings.grayscale)}
						onValueChange={(value: boolean) =>
							settings.updateSettings({ grayscale: value })
						}
					/>
					<Design.TableSwitchRow
						label="Show Watermark"
						subLabel="Draw watermark text in the bottom-right corner"
						icon={<Design.TableRow.Icon source={findAssetId('PencilIcon')} />}
						value={Boolean(settings.showWatermark)}
						onValueChange={(value: boolean) =>
							settings.updateSettings({ showWatermark: value })
						}
					/>
				</Design.TableRowGroup>
				{settings.showWatermark ? (
					<Design.TextInput
						label="Watermark Text"
						description="Only used when watermark is enabled. Max 32 characters."
						placeholder={DEFAULT_WATERMARK}
						size="md"
						maxLength={32}
						value={String(settings.watermark ?? '')}
						onChange={(value: string) =>
							settings.updateSettings({ watermark: value })
						}
					/>
				) : null}
			</Design.Stack>
		</ScrollView>
	)
}
