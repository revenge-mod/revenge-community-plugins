import Constants from '../../../constants'
import { DEFAULTS } from '../../../defaults'
import { getStorage } from '../../../lib/state'
import { TextInputRow } from '../../components/TextInputRow'
import type { MultiScrobblerStorage } from '../../../types'

export default function DisplaySettingsPage() {
	const { Page } =
		revenge.components as typeof import('@revenge-mod/components')
	const { ScrollView } = revenge.react.ReactNative
	const { Stack, TableRowGroup, TableRow, Slider, Card, Text } =
		revenge.discord.design.Design

	const storage = getStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }
	const set = (patch: Partial<MultiScrobblerStorage>) => storage?.set(patch)

	const isLibreFm = s.service === 'librefm'
	const isMediaSession = s.service === 'mediasession'
	const currentInterval = Number(s.timeInterval)

	return (
		<Page>
			<ScrollView contentContainerStyle={{ padding: 0 }}>
				<Stack>
					<TableRowGroup title="App Name">
						<Stack>
							<TextInputRow
								placeholder={`App Name (Default: ${Constants.DEFAULT_APP_NAME})`}
								value={s.appName}
								onChangeText={v => set({ appName: v })}
							/>
						</Stack>
					</TableRowGroup>

					<Stack>
						<Card style={{ padding: 12 }}>
							<Stack spacing={6}>
								<Text
									variant="text-md/semibold"
									style={{ color: 'text-normal', marginLeft: 10 }}
								>
									Update Interval:{' '}
									{isLibreFm
										? 'fixed at 60s'
										: isMediaSession
											? 'not used'
											: `${currentInterval}s`}
								</Text>
								<Text
									variant="text-sm/normal"
									style={{ color: 'text-muted', marginLeft: 10 }}
								>
									{isLibreFm
										? 'Libre.fm requires a fixed 60s interval to prevent rate limiting'
										: isMediaSession
											? "Reads your device's media state directly — always live, no interval needed"
											: `Min: ${Constants.MIN_UPDATE_INTERVAL}s · Max: 300s`}
								</Text>
								<Slider
									step={1}
									value={currentInterval}
									minimumValue={Constants.MIN_UPDATE_INTERVAL}
									maximumValue={300}
									onValueChange={v => {
										if (!isLibreFm && !isMediaSession)
											set({ timeInterval: Math.round(v) })
									}}
								/>
							</Stack>
						</Card>
					</Stack>

					<TableRowGroup title="About Display Settings">
						<TableRow
							label="App Name"
							subLabel="The name shown in Discord for your activity"
						/>
						<TableRow
							label="Update Interval"
							subLabel="How often the plugin checks for new tracks (in seconds)"
						/>
						<TableRow
							label="Minimum Interval"
							subLabel={`The plugin will never check more frequently than ${Constants.MIN_UPDATE_INTERVAL} seconds`}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
