import { DEFAULTS } from '../../../defaults'
import { getStorage } from '../../../lib/state'
import { settleToast, showToast } from '../../../lib/toasts'
import { serviceFactory } from '../../../services/ServiceFactory'
import { TextInputRow } from '../../components/TextInputRow'
import type { MultiScrobblerStorage } from '../../../types'

const API_KEY_URL = 'https://www.last.fm/api/account/create'

export default function LastFmSettingsPage() {
	const { Page } =
		revenge.components as typeof import('@revenge-mod/components')
	const { ScrollView } = revenge.react.ReactNative
	const { Stack, TableRowGroup, TableRow } = revenge.discord.design.Design

	const storage = getStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }
	const set = (patch: Partial<MultiScrobblerStorage>) => storage?.set(patch)

	const testConnection = async () => {
		const id = showToast('Testing Last.fm connection...', 'info')
		try {
			const isValid = await serviceFactory.testService('lastfm')
			settleToast(
				id,
				isValid
					? 'Last.fm connection successful!'
					: 'Last.fm connection failed',
				isValid ? 'success' : 'critical',
			)
		} catch {
			settleToast(id, 'Connection error', 'critical')
		}
	}

	const openApiKeyPage = async () => {
		try {
			await revenge.react.ReactNative.Linking?.openURL(API_KEY_URL)
		} catch (_error) {
			showToast(
				`Failed to open web browser. Please visit: ${API_KEY_URL}`,
				'critical',
			)
		}
	}

	return (
		<Page>
			<ScrollView contentContainerStyle={{ padding: 0 }}>
				<Stack>
					<TableRowGroup title="Credentials">
						<Stack>
							<TextInputRow
								placeholder="Last.fm Username"
								value={s.username}
								onChangeText={v => set({ username: v })}
							/>
							<TextInputRow
								placeholder="Last.fm API Key"
								value={s.apiKey}
								onChangeText={v => set({ apiKey: v })}
								secureTextEntry
							/>
						</Stack>
					</TableRowGroup>

					<TableRowGroup title="Actions">
						<TableRow
							label="Test Connection"
							subLabel="Verify your Last.fm credentials"
							trailing={<TableRow.Arrow />}
							onPress={testConnection}
						/>
						<TableRow
							label="Get API Key"
							subLabel="Create a Last.fm API key at last.fm/api/account/create"
							trailing={<TableRow.Arrow />}
							onPress={openApiKeyPage}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
