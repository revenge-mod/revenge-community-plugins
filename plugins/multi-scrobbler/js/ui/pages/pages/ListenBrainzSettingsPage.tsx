import { DEFAULTS } from '../../../defaults'
import { getStorage } from '../../../lib/state'
import { settleToast, showToast } from '../../../lib/toasts'
import { serviceFactory } from '../../../services/ServiceFactory'
import { TextInputRow } from '../../components/TextInputRow'
import type { MultiScrobblerStorage } from '../../../types'

const TOKEN_URL = 'https://listenbrainz.org/settings/'

export default function ListenBrainzSettingsPage() {
	const { Page } =
		revenge.components as typeof import('@revenge-mod/components')
	const { ScrollView } = revenge.react.ReactNative
	const { Stack, TableRowGroup, TableRow } = revenge.discord.design.Design

	const storage = getStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }
	const set = (patch: Partial<MultiScrobblerStorage>) => storage?.set(patch)

	const testConnection = async () => {
		const id = showToast('Testing ListenBrainz connection...', 'info')
		try {
			const isValid = await serviceFactory.testService('listenbrainz')
			settleToast(
				id,
				isValid
					? 'ListenBrainz connection successful!'
					: 'ListenBrainz connection failed',
				isValid ? 'success' : 'critical',
			)
		} catch {
			settleToast(id, 'Connection error', 'critical')
		}
	}

	const openTokenPage = async () => {
		try {
			await revenge.react.ReactNative.Linking?.openURL(TOKEN_URL)
		} catch (_error) {
			showToast(
				`Failed to open web browser. Please visit: ${TOKEN_URL}`,
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
								placeholder="ListenBrainz Username"
								value={s.listenbrainzUsername}
								onChangeText={v => set({ listenbrainzUsername: v })}
							/>
							<TextInputRow
								placeholder="ListenBrainz Token"
								value={s.listenbrainzToken}
								onChangeText={v => set({ listenbrainzToken: v })}
								secureTextEntry
							/>
						</Stack>
					</TableRowGroup>

					<TableRowGroup title="Actions">
						<TableRow
							label="Test Connection"
							subLabel="Verify your ListenBrainz credentials"
							trailing={<TableRow.Arrow />}
							onPress={testConnection}
						/>
						<TableRow
							label="Get User Token"
							subLabel="Get your ListenBrainz user token at listenbrainz.org/settings/"
							trailing={<TableRow.Arrow />}
							onPress={openTokenPage}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
