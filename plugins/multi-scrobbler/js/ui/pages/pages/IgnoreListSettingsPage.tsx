import { DEFAULTS } from '../../../defaults'
import { getStorage } from '../../../lib/state'
import { showToast } from '../../../lib/toasts'
import { TextInputRow } from '../../components/TextInputRow'
import type { MultiScrobblerStorage } from '../../../types'

export default function IgnoreListSettingsPage() {
	const React = revenge.react.React
	const { Page } =
		revenge.components as typeof import('@revenge-mod/components')
	const { ScrollView, TouchableOpacity, Image } = revenge.react.ReactNative
	const { Stack, TableRowGroup, TableRow } = revenge.discord.design.Design

	const storage = getStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }
	const set = (patch: Partial<MultiScrobblerStorage>) => storage?.set(patch)

	const [newAppName, setNewAppName] = React.useState('')

	const addAppToIgnoreList = () => {
		if (!newAppName.trim()) {
			showToast('Please enter an app name', 'warning')
			return
		}

		if (!s.ignoreList.includes(newAppName.trim())) {
			set({ ignoreList: [...s.ignoreList, newAppName.trim()] })
			setNewAppName('')
			showToast('App added to ignore list', 'success')
		} else {
			showToast('App already in ignore list', 'warning')
		}
	}

	const removeAppFromIgnoreList = (appName: string) => {
		set({
			ignoreList: s.ignoreList.filter((app: string) => app !== appName),
		})
		showToast('App removed from ignore list', 'success')
	}

	return (
		<Page>
			<ScrollView contentContainerStyle={{ padding: 0 }}>
				<Stack>
					<TableRowGroup title="Add App to Ignore">
						<Stack>
							<TextInputRow
								placeholder="Enter app name"
								value={newAppName}
								onChangeText={setNewAppName}
							/>
						</Stack>
					</TableRowGroup>

					<TableRowGroup>
						<TableRow
							label="Add to Ignore List"
							subLabel="Add the current app name to your ignore list"
							trailing={<TableRow.Arrow />}
							onPress={addAppToIgnoreList}
						/>
					</TableRowGroup>

					{s.ignoreList.length > 0 && (
						<TableRowGroup title="Ignored Apps">
							{s.ignoreList.map((appName: string, index: number) => (
								<TableRow
									key={index}
									label={appName}
									trailing={
										<TouchableOpacity
											onPress={() => removeAppFromIgnoreList(appName)}
											style={{
												padding: 8,
												backgroundColor: '#ff4d4d',
												borderRadius: 12,
												width: 24,
												height: 24,
												justifyContent: 'center',
												alignItems: 'center',
											}}
										>
											<Image
												source={revenge.assets.getAssetIdByName('TrashIcon')}
												style={{ width: 14, height: 14, tintColor: '#ffffff' }}
											/>
										</TouchableOpacity>
									}
								/>
							))}
						</TableRowGroup>
					)}

					<TableRowGroup title="About Ignore List">
						<TableRow
							label="How it Works"
							subLabel="When any app in your ignore list is active, your music status will be hidden"
						/>
						<TableRow
							label="Detection"
							subLabel="Apps are detected by their Discord activity name"
						/>
						<TableRow
							label="Examples"
							subLabel="Spotify, YouTube Music, Kizzy, Metrolist, echo"
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
