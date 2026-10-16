/** @jsxImportSource . */
import { getAssetIdByName as findAssetId } from '@revenge-mod/assets'
import { Design } from '@revenge-mod/discord/design'
import { Fragment, useEffect, useState } from 'react'
import { ScrollView } from 'react-native'
import {
	cloudRequest,
	cloudState,
	deleteCloud,
	exportLocal,
	importLocal,
	isSignedIn,
	pickBackup,
	resolveConflicts,
	revokeAllDevices,
	setCloud,
	setEnabled,
	signIn,
	signOut,
	syncNow,
} from './cloud'
import { showConfirmationAlert } from './native'
import {
	configureStorage,
	loadStorage,
	useAccountId,
	useCollectionStore,
} from './storage'
import { serverOrigin } from './sync/client'
import { object, text } from './sync/protocol'
import type { PluginSettingsComponent } from '@revenge-mod/plugins/types'
import type { ComponentProps } from 'react'
import type { CollectionStorage } from './types'

export default function Settings({
	api: { jsonStorage, plugin },
}: ComponentProps<
	PluginSettingsComponent<{ jsonStorage: CollectionStorage }>
>) {
	configureStorage(jsonStorage, error => plugin.reportError(error))
	jsonStorage.use()
	useEffect(() => {
		void loadStorage().catch(error => plugin.reportError(error))
	}, [plugin])
	const accountId = useAccountId()
	const onlyShowCollections = useCollectionStore(
		state => state.onlyShowCollections,
	)
	const stored = useCollectionStore(state =>
		accountId ? state.cloud[accountId] : undefined,
	)
	const hydrated = useCollectionStore(state => state._hasHydrated)
	const cloud = stored ?? cloudState(accountId ?? '')
	const [server, setServer] = useState(cloud.server)
	const [busy, setBusy] = useState(false)
	const [advanced, setAdvanced] = useState(false)
	const [error, setError] = useState('')
	const [devices, setDevices] = useState<{ id: string; label: string }[]>([])
	useEffect(() => setServer(cloud.server), [cloud.server])
	const run = async (action: () => Promise<unknown>) => {
		setBusy(true)
		setError('')
		try {
			await action()
		} catch (error) {
			setError(
				error instanceof Error
					? error.message
					: 'Could not complete this action.',
			)
		} finally {
			setBusy(false)
		}
	}
	const confirm = (
		title: string,
		content: string,
		action: () => Promise<unknown>,
	) =>
		showConfirmationAlert({
			title,
			content,
			confirmText: 'Continue',
			onConfirm: () => void run(action),
		})
	if (!accountId || !hydrated)
		return <Design.Text>Loading collections…</Design.Text>
	const connected = isSignedIn(accountId)

	return (
		<ScrollView style={{ flex: 1 }}>
			<Design.Stack
				style={{ paddingVertical: 24, paddingHorizontal: 12 }}
				spacing={16}
			>
				<Design.TableRowGroup title="GIF picker">
					<Design.TableSwitchRow
						label="Only show collections"
						subLabel="Hide normal categories. Favourites stay visible."
						value={onlyShowCollections}
						onValueChange={(value: boolean) =>
							useCollectionStore
								.getState()
								.updateSettings({ onlyShowCollections: value })
						}
					/>
				</Design.TableRowGroup>
				<Design.TableRowGroup title="Cloud sync">
					<Design.TableSwitchRow
						label="Cloud Sync"
						value={cloud.enabled}
						disabled={busy}
						onValueChange={(value: boolean) =>
							void run(() => setEnabled(accountId, value))
						}
					/>
					<Design.TableRow
						label="Status"
						subLabel={cloud.status ?? 'Local only.'}
					/>
					<Design.TableRow
						label="Last sync"
						subLabel={
							cloud.lastSuccess
								? new Date(cloud.lastSuccess).toLocaleString()
								: 'Never'
						}
					/>
				</Design.TableRowGroup>
				<Design.Button
					text="Sync now"
					variant="secondary"
					disabled={busy || !cloud.enabled || !connected}
					onPress={() => void run(() => syncNow(accountId))}
				/>
				<Design.Button
					text={connected ? 'Sign out' : 'Sign in'}
					variant={connected ? 'destructive' : 'primary'}
					loading={busy || cloud.status === 'Signing in…'}
					disabled={
						busy ||
						cloud.status === 'Signing in…' ||
						(!connected && !cloud.enabled)
					}
					onPress={() =>
						void run(() => (connected ? signOut(accountId) : signIn(accountId)))
					}
				/>
				{!!error && (
					<Design.Text color="text-feedback-critical">{error}</Design.Text>
				)}
				<Design.TableRowGroup title="">
					<Design.TableRow
						label="Advanced"
						trailing={
							<Design.TableRow.Icon
								source={findAssetId(
									advanced ? 'ChevronSmallUpIcon' : 'ChevronSmallDownIcon',
								)}
							/>
						}
						onPress={() => setAdvanced(value => !value)}
					/>
				</Design.TableRowGroup>
				{advanced && (
					<Fragment>
						<Design.Text variant="text-sm/medium">
							Cloud sync backs up GIF links and collections, not the media
							itself. Your server operator can access this metadata. Sign in
							again after restarting Discord.
						</Design.Text>
						<Design.TableRowGroup title="Backups">
							<Design.TableRow
								label="Export Backup"
								subLabel="Download your collections as a JSON file"
								disabled={busy}
								onPress={() => void run(() => exportLocal(accountId))}
							/>
							<Design.TableRow
								label="Import Backup"
								subLabel="Choose a JSON file. The backup takes precedence over local collections."
								disabled={busy}
								onPress={() =>
									void run(async () => {
										const incoming = await pickBackup()
										if (!incoming) return
										confirm(
											'Replace collections?',
											"Replace this account's local collections with the selected backup. If sync is enabled, these changes will also sync. Export a backup first.",
											() => importLocal(accountId, incoming),
										)
									})
								}
							/>
						</Design.TableRowGroup>
						{cloud.replica.conflicts.length > 0 && (
							<Design.TableRowGroup title="Resolve conflicts">
								<Design.TableRow
									label="Use cloud version"
									subLabel="Discard pending local edits; export a backup first"
									disabled={busy}
									onPress={() =>
										confirm(
											'Use cloud collections?',
											'Pending local edits will be discarded.',
											() => resolveConflicts(accountId, false),
										)
									}
								/>
								<Design.TableRow
									label="Merge local additions"
									subLabel="Keep cloud edits and add missing local collections and GIFs"
									disabled={busy}
									onPress={() =>
										void run(() => resolveConflicts(accountId, true))
									}
								/>
							</Design.TableRowGroup>
						)}
						<Design.TableRowGroup title="Devices and data">
							<Design.TableRow
								label="Connected Devices"
								disabled={busy}
								onPress={() =>
									void run(async () => {
										const response = object(
											await cloudRequest(accountId, '/v1/sessions'),
										)
										if (
											!Array.isArray(response.sessions) ||
											response.sessions.length > 20
										)
											throw new Error('Invalid device list.')
										setDevices(
											response.sessions.map(value => {
												const item = object(value)
												return {
													id: text(item.id, 96),
													label: text(item.label, 60),
												}
											}),
										)
									})
								}
							/>
							{devices.map(device => (
								<Design.TableRow
									key={device.id}
									label={device.label}
									subLabel={
										device.id === cloud.sessionId
											? 'This session'
											: 'Revoke this device'
									}
									disabled={busy}
									onPress={() =>
										confirm(
											'Revoke device?',
											'This device will need to sign in again.',
											async () => {
												await cloudRequest(
													accountId,
													`/v1/sessions/${encodeURIComponent(device.id)}`,
													{ method: 'DELETE' },
												)
												setDevices(current =>
													current.filter(item => item.id !== device.id),
												)
											},
										)
									}
								/>
							))}
							<Design.TableRow
								label="Revoke all devices"
								disabled={busy}
								onPress={() =>
									confirm(
										'Revoke all devices?',
										'All devices, including this one, will be signed out. Use Sign in to reconnect.',
										async () => {
											await revokeAllDevices(accountId)
											setDevices([])
										},
									)
								}
							/>
							<Design.TableRow
								label="Delete Cloud Data"
								disabled={busy}
								onPress={() =>
									confirm(
										'Delete cloud collections?',
										'This deletes all cloud metadata and sessions. Local collections stay on this device, and sync will be turned off.',
										() => deleteCloud(accountId),
									)
								}
							/>
						</Design.TableRowGroup>
						<Design.TextInput
							label="Sync server"
							placeholder="https://sync.example.com"
							value={server}
							onChange={setServer}
							editable={!busy && !cloud.sessionId && !cloud.enabled}
						/>
						<Design.Button
							text="Save server"
							variant="secondary"
							disabled={busy || !!cloud.sessionId || cloud.enabled}
							onPress={() =>
								void run(async () => {
									if (
										cloud.replica.pending.length ||
										Object.keys(cloud.replica.records).length
									)
										throw new Error(
											'Export your backup and delete the old cloud data before switching servers.',
										)
									setCloud(accountId, { server: serverOrigin(server) })
								})
							}
						/>
					</Fragment>
				)}
			</Design.Stack>
		</ScrollView>
	)
}
