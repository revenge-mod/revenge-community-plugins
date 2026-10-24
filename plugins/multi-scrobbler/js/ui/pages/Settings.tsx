import { DEFAULTS } from '../../defaults'
import { switchService } from '../../lib/manager'
import { serviceFactory } from '../../services/ServiceFactory'
import {
	DEBUG_ROUTE,
	DISPLAY_ROUTE,
	IGNORE_LIST_ROUTE,
	LASTFM_ROUTE,
	LIBREFM_ROUTE,
	LISTENBRAINZ_ROUTE,
	LOGGING_ROUTE,
	MEDIA_SESSION_ROUTE,
	RPC_ROUTE,
} from './routes'
import type { PluginApi } from '@revenge-mod/plugins/types'
import type { MultiScrobblerStorage, ServiceType } from '../../types'

export default function Settings({
	api,
}: {
	api: PluginApi<{ jsonStorage: MultiScrobblerStorage }>
}) {
	const { Page } =
		revenge.components as typeof import('@revenge-mod/components')
	const { ScrollView } = revenge.react.ReactNative
	const { Stack, TableRowGroup, TableRow, TableRadioGroup, TableRadioRow } =
		revenge.discord.design.Design
	const { useNavigation } =
		revenge.externals.ReactNavigation.ReactNavigationNative

	const navigation = useNavigation() as { navigate: (route: string) => void }

	// Root settings page receives api with jsonStorage
	const s = { ...DEFAULTS, ...(api.jsonStorage.use() ?? {}) }
	const set = (patch: Partial<MultiScrobblerStorage>) =>
		api.jsonStorage.set({ ...s, ...patch })

	const currentService = s.service as ServiceType | undefined

	const getCredentialStatus = (service: ServiceType) => {
		switch (service) {
			case 'lastfm':
				return s.username && s.apiKey
					? '✅ Configured'
					: '❌ Missing credentials'
			case 'librefm':
				return s.librefmUsername && s.librefmApiKey
					? '✅ Configured'
					: '❌ Missing credentials'
			case 'listenbrainz':
				return s.listenbrainzUsername ? '✅ Configured' : '❌ Missing username'
			case 'mediasession':
				return '📱 Uses device media session'
			default:
				return '❓ Unknown'
		}
	}

	const handleServiceChange = (service: ServiceType) => {
		if (service !== currentService) {
			set({ service })
			switchService(service)
		}
	}

	return (
		<Page>
			<ScrollView contentContainerStyle={{ padding: 0 }}>
				<Stack>
					<TableRowGroup title="Active Service">
						<TableRadioGroup
							defaultValue={currentService}
							onChange={handleServiceChange}
						>
							{(
								[
									'lastfm',
									'librefm',
									'listenbrainz',
									'mediasession',
								] as ServiceType[]
							).map(service => (
								<TableRadioRow
									key={service}
									value={service}
									label={serviceFactory.getServiceDisplayName(service)}
									subLabel={getCredentialStatus(service)}
								/>
							))}
						</TableRadioGroup>
					</TableRowGroup>

					<TableRowGroup title="Service Configuration">
						<TableRow
							label="Last.fm Settings"
							subLabel="Configure Last.fm credentials and options"
							trailing={<TableRow.Arrow />}
							onPress={() => navigation.navigate(LASTFM_ROUTE)}
						/>
						<TableRow
							label="Libre.fm Settings"
							subLabel="Configure Libre.fm credentials and options"
							trailing={<TableRow.Arrow />}
							onPress={() => navigation.navigate(LIBREFM_ROUTE)}
						/>
						<TableRow
							label="ListenBrainz Settings"
							subLabel="Configure ListenBrainz credentials and options"
							trailing={<TableRow.Arrow />}
							onPress={() => navigation.navigate(LISTENBRAINZ_ROUTE)}
						/>
						<TableRow
							label="Media Session"
							subLabel="View currently playing media from your device"
							trailing={<TableRow.Arrow />}
							onPress={() => navigation.navigate(MEDIA_SESSION_ROUTE)}
						/>
					</TableRowGroup>

					<TableRowGroup title="Plugin Configuration">
						<TableRow
							label="Display Settings"
							subLabel="Customize app name and update interval"
							trailing={<TableRow.Arrow />}
							onPress={() => navigation.navigate(DISPLAY_ROUTE)}
						/>
						<TableRow
							label="RPC Customization"
							subLabel="Customize Discord rich presence display options"
							trailing={<TableRow.Arrow />}
							onPress={() => navigation.navigate(RPC_ROUTE)}
						/>
						<TableRow
							label="Ignore List"
							subLabel="Configure apps that should hide your status"
							trailing={<TableRow.Arrow />}
							onPress={() => navigation.navigate(IGNORE_LIST_ROUTE)}
						/>
						<TableRow
							label="Logging Settings"
							subLabel="Configure logging and debugging options"
							trailing={<TableRow.Arrow />}
							onPress={() => navigation.navigate(LOGGING_ROUTE)}
						/>
						<TableRow
							label="Debug Console"
							subLabel="View debug information"
							trailing={<TableRow.Arrow />}
							onPress={() => navigation.navigate(DEBUG_ROUTE)}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
