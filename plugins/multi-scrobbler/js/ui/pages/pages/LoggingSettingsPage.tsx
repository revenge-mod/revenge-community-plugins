import { DEFAULTS } from '../../../defaults'
import { getStorage } from '../../../lib/state'
import type { MultiScrobblerStorage } from '../../../types'

export default function LoggingSettingsPage() {
	const { Page } =
		revenge.components as typeof import('@revenge-mod/components')
	const { ScrollView } = revenge.react.ReactNative
	const { Stack, TableRowGroup, TableRow, TableSwitchRow } =
		revenge.discord.design.Design

	const storage = getStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }
	const set = (patch: Partial<MultiScrobblerStorage>) => storage?.set(patch)

	return (
		<Page>
			<ScrollView contentContainerStyle={{ padding: 0 }}>
				<Stack>
					<TableRowGroup title="Logging Options">
						<TableSwitchRow
							label="Verbose Logging"
							subLabel="Enable detailed console logging for debugging"
							value={s.verboseLogging}
							onValueChange={value => set({ verboseLogging: value })}
						/>
					</TableRowGroup>

					<TableRowGroup title="Debug Information">
						<TableRow
							label="Console Logging"
							subLabel="Logs are written to the browser/app console when verbose is enabled"
						/>
						<TableRow
							label="Error Tracking"
							subLabel="Connection errors and API failures are automatically logged"
						/>
					</TableRowGroup>

					<TableRowGroup title="Log Information">
						<TableRow
							label="API Calls"
							subLabel="All API requests are logged when verbose is enabled"
						/>
						<TableRow
							label="Track Updates"
							subLabel="Song changes and RPC updates are logged"
						/>
						<TableRow
							label="Error Details"
							subLabel="Connection errors and retries are logged"
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
