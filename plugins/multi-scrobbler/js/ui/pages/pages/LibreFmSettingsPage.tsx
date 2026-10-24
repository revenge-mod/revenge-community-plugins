import { DEFAULTS } from '../../../defaults'
import { getStorage } from '../../../lib/state'
import { settleToast, showToast } from '../../../lib/toasts'
import { serviceFactory } from '../../../services/ServiceFactory'
import { TextInputRow } from '../../components/TextInputRow'
import type { MultiScrobblerStorage } from '../../../types'

const API_KEY_URL = 'https://www.last.fm/api/account/create'

export default function LibreFmSettingsPage() {
	const { Page } =
		revenge.components as typeof import('@revenge-mod/components')
	const { ScrollView } = revenge.react.ReactNative
	const { Stack, TableRowGroup, TableRow } = revenge.discord.design.Design

	const storage = getStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }
	const set = (patch: Partial<MultiScrobblerStorage>) => storage?.set(patch)

	const testConnection = async () => {
		const id = showToast('Testing Libre.fm connection...', 'info')
		try {
			const isValid = await serviceFactory.testService('librefm')
			settleToast(
				id,
				isValid
					? 'Libre.fm connection successful!'
					: 'Libre.fm connection failed',
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
								placeholder="Libre.fm Username"
								value={s.librefmUsername}
								onChangeText={v => set({ librefmUsername: v })}
							/>
							<TextInputRow
								placeholder="Libre.fm API Key"
								value={s.librefmApiKey}
								onChangeText={v => set({ librefmApiKey: v })}
								secureTextEntry
							/>
						</Stack>
					</TableRowGroup>

					<TableRowGroup title="Actions">
						<TableRow
							label="Test Connection"
							subLabel="Verify your Libre.fm credentials"
							trailing={<TableRow.Arrow />}
							onPress={testConnection}
						/>
						<TableRow
							label="Get API Key"
							subLabel="Create a Last.fm API key (compatible with Libre.fm)"
							trailing={<TableRow.Arrow />}
							onPress={openApiKeyPage}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
