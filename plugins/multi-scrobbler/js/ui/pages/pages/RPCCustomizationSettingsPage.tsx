import { DEFAULTS } from '../../../defaults'
import { getStorage } from '../../../lib/state'
import RPCPreview from './components/RPCPreview'
import type { MultiScrobblerStorage } from '../../../types'

export default function RPCCustomizationSettingsPage() {
	const { Page } =
		revenge.components as typeof import('@revenge-mod/components')
	const { ScrollView } = revenge.react.ReactNative
	const { Stack, TableRowGroup, TableCheckboxRow, TableRow } =
		revenge.discord.design.Design

	const storage = getStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }
	const set = (patch: Partial<MultiScrobblerStorage>) => storage?.set(patch)

	const handleListeningToChange = () => {
		const newValue = !s.listeningTo
		set({ listeningTo: newValue })

		if (!newValue && s.showTimestamp) {
			set({ showTimestamp: false })
		}
	}

	const handleTimestampChange = () => {
		if (!s.listeningTo) return
		set({ showTimestamp: !s.showTimestamp })
	}

	return (
		<Page>
			<ScrollView contentContainerStyle={{ padding: 0 }}>
				<RPCPreview />
				<Stack>
					<TableRowGroup title="RPC Display Options">
						<TableCheckboxRow
							value="listeningTo"
							label="Show as Listening"
							subLabel="Display as 'Listening to' instead of 'Playing'"
							checked={s.listeningTo}
							onPress={handleListeningToChange}
						/>

						<TableCheckboxRow
							value="showLargeText"
							label="Show Tooltip Text"
							subLabel="Show album name and track duration in Discord activity tooltip"
							checked={s.showLargeText}
							onPress={() => set({ showLargeText: !s.showLargeText })}
						/>

						{!s.listeningTo && (
							<TableRow
								label="Timestamp Unavailable"
								subLabel="Enable 'Show as Listening' to use timestamp feature"
								disabled
							/>
						)}

						<TableCheckboxRow
							value="showTimestamp"
							label="Show Timestamp"
							subLabel="Display track progress and duration"
							checked={s.showTimestamp}
							onPress={handleTimestampChange}
							disabled={!s.listeningTo}
						/>

						<TableCheckboxRow
							value="showAlbumInTooltip"
							label="Show Album in Tooltip"
							subLabel="Include album name in the tooltip text"
							checked={s.showAlbumInTooltip}
							onPress={() => set({ showAlbumInTooltip: !s.showAlbumInTooltip })}
						/>

						<TableCheckboxRow
							value="showDurationInTooltip"
							label="Show Duration in Tooltip"
							subLabel="Include track duration in the tooltip text"
							checked={s.showDurationInTooltip}
							onPress={() =>
								set({ showDurationInTooltip: !s.showDurationInTooltip })
							}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
