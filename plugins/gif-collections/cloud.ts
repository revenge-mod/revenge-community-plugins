import { ToastActionCreators } from '@revenge-mod/discord/actions'
import { callNativeMethod, getNativeModule } from '@revenge-mod/modules/native'
import { AppState, PermissionsAndroid, Platform } from 'react-native'
import { authorize, cancelAuthorization } from './authorize'
import { fromRecords, newId, normalize, toRecords } from './metadata'
import { currentAccountId } from './native'
import { flushCollections } from './persistence'
import {
	collectionsActive,
	updateCollections,
	useCollectionStore,
} from './storage'
import { request, retryDelay, SyncError, synchronize } from './sync/client'
import { backup, object, text } from './sync/protocol'
import {
	emptyReplica,
	exportBackup,
	importBackup,
	queue,
	rejectBatch,
	visible,
} from './sync/replica'
import type { Backup } from './sync/protocol'
import type { CloudState } from './types'

// Discord exposes no verified general-purpose secure credential store here.
// Keep credentials in memory rather than in plaintext settings/backups.
const tokens = new Map<string, string>()
const logins = new Map<string, { id: string; claim: string; server: string }>()
let timer: ReturnType<typeof setTimeout> | undefined
let controller: AbortController | undefined
let running = false
let started = false
let attempts = 0
let nextAttempt = 0

export function cloudState(accountId: string): CloudState {
	return (
		useCollectionStore.getState().cloud[accountId] ?? {
			enabled: false,
			server: '',
			replica: emptyReplica(),
		}
	)
}

export function isSignedIn(accountId: string): boolean {
	return tokens.has(accountId)
}

export function setCloud(accountId: string, update: Partial<CloudState>) {
	const state = useCollectionStore.getState()
	if (!state._hasHydrated || currentAccountId() !== accountId)
		throw new Error('Reopen settings for the current account.')
	state.updateSettings({
		cloud: {
			...state.cloud,
			[accountId]: { ...cloudState(accountId), ...update },
		},
	})
}

export async function setEnabled(accountId: string, enabled: boolean) {
	if (enabled && !cloudState(accountId).server)
		throw new Error(
			'Save your sync server under Advanced before enabling Cloud Sync.',
		)
	if (!enabled) controller?.abort()
	const state = useCollectionStore.getState()
	const collections = normalize(state.accounts[accountId] ?? [])
	const cloud = cloudState(accountId)
	state.updateSettings({
		accounts: { ...state.accounts, [accountId]: collections },
	})
	setCloud(accountId, {
		enabled,
		replica: queue(cloud.replica, toRecords(collections)),
	})
	await flushCollections()
	if (enabled) schedule()
}

export async function signIn(accountId: string) {
	const cloud = cloudState(accountId)
	if (!cloud.enabled) throw new Error('Enable Cloud Sync first.')
	const result = object(
		await request(cloud.server, undefined, '/v1/auth/start', {
			method: 'POST',
			body: { label: 'Revenge Next mobile', native: true },
		}),
	)
	if (
		!started ||
		currentAccountId() !== accountId ||
		!cloudState(accountId).enabled ||
		cloudState(accountId).server !== cloud.server
	)
		throw new Error('Sign-in cancelled because settings or account changed.')
	const redirectUri = text(result.redirectUri, 2048)
	if (redirectUri !== `${cloud.server}/v1/auth/callback`)
		throw new Error('Unexpected sign-in server.')
	const state = text(result.state, 64)
	const login = {
		id: text(result.id, 96),
		claim: text(result.claim, 64),
		server: cloud.server,
	}
	authorize(
		text(result.clientId, 32),
		redirectUri,
		state,
		async code => {
			if (
				!started ||
				currentAccountId() !== accountId ||
				cloudState(accountId).server !== cloud.server ||
				!cloudState(accountId).enabled
			)
				throw new Error(
					'Sign-in cancelled because settings or account changed.',
				)
			setCloud(accountId, { status: 'Signing in…' })
			await request(cloud.server, undefined, '/v1/auth/native', {
				method: 'POST',
				body: { id: login.id, claim: login.claim, state, code },
			})
			logins.set(accountId, login)
			await finishSignIn(accountId)
		},
		error => {
			if (started && currentAccountId() === accountId)
				setCloud(accountId, {
					status:
						error instanceof Error
							? error.message
							: 'Sign-in failed. Try again.',
				})
		},
	)
}

async function finishSignIn(
	accountId: string,
	options: { replaceSessions?: boolean; skipSync?: boolean } = {},
) {
	const login = logins.get(accountId)
	if (!login) throw new Error('Choose Sign In first.')
	const result = object(
		await request(login.server, undefined, '/v1/auth/finish', {
			method: 'POST',
			body: {
				id: login.id,
				claim: login.claim,
				replaceSessions: options.replaceSessions === true,
				replaceSessionId: cloudState(accountId).sessionId,
			},
		}),
	)
	const token = text(result.token, 64)
	const sessionId = text(result.sessionId, 96)
	if (
		!started ||
		!cloudState(accountId).enabled ||
		result.userId !== accountId ||
		currentAccountId() !== accountId ||
		cloudState(accountId).server !== login.server
	) {
		await request(
			login.server,
			token,
			`/v1/sessions/${encodeURIComponent(sessionId)}`,
			{ method: 'DELETE' },
		)
		throw new Error(
			'Sign in with the Discord account currently open in Revenge Next.',
		)
	}
	controller?.abort()
	logins.delete(accountId)
	tokens.set(accountId, token)
	const replica = rejectBatch(cloudState(accountId).replica)
	setCloud(accountId, {
		sessionId,
		replica: { ...replica, sequence: 0 },
		status: 'Signed in for this app session.',
	})
	await flushCollections()
	attempts = 0
	if (!options.skipSync) await syncNow(accountId)
}

export async function revokeAllDevices(accountId: string) {
	// A completed Discord authorization can recover an account at its device limit.
	if (!tokens.has(accountId))
		await finishSignIn(accountId, { replaceSessions: true, skipSync: true })
	await signOut(accountId, true)
}

export async function cloudRequest(
	accountId: string,
	path: string,
	options?: Parameters<typeof request>[3],
) {
	const token = tokens.get(accountId)
	if (!token) throw new Error('Sign in on this device first.')
	return request(cloudState(accountId).server, token, path, options)
}

export async function signOut(accountId: string, all = false) {
	controller?.abort()
	const state = cloudState(accountId)
	await cloudRequest(
		accountId,
		all ? '/v1/sessions' : `/v1/sessions/${state.sessionId}`,
		{ method: 'DELETE' },
	)
	tokens.delete(accountId)
	setCloud(accountId, { sessionId: undefined, status: 'Signed out.' })
}

export async function deleteCloud(accountId: string) {
	controller?.abort()
	await cloudRequest(accountId, '/v1/account', {
		method: 'DELETE',
		headers: { 'X-Confirm-Delete': 'delete-cloud-data' },
	})
	tokens.delete(accountId)
	// Keep local collections, but do not immediately upload them again.
	setCloud(accountId, {
		enabled: false,
		sessionId: undefined,
		replica: emptyReplica(),
		lastSuccess: undefined,
		status: 'Cloud data deleted. Local collections kept.',
	})
}

function schedule(delay = 3000) {
	clearTimeout(timer)
	if (!started) return
	timer = setTimeout(
		() => {
			const id = currentAccountId()
			if (id)
				void syncNow(id).catch(() => {
					/* Status is shown in plugin settings. */
				})
		},
		Math.max(delay, nextAttempt - Date.now()),
	)
}

export async function syncNow(accountId: string) {
	if (running || !started || Date.now() < nextAttempt) return
	const cloud = cloudState(accountId)
	if (!cloud.enabled || !tokens.has(accountId) || !collectionsActive()) return
	running = true
	controller = new AbortController()
	const signal = controller.signal
	const active = () =>
		started &&
		!signal.aborted &&
		currentAccountId() === accountId &&
		cloudState(accountId).enabled
	try {
		setCloud(accountId, { status: 'Syncing…' })
		const complete = await synchronize({
			active,
			read: () => cloudState(accountId).replica,
			write: async update => {
				if (!active()) throw new Error('Sync cancelled.')
				const replica = update(cloudState(accountId).replica)
				const state = useCollectionStore.getState()
				state.updateSettings({
					cloud: {
						...state.cloud,
						[accountId]: { ...cloudState(accountId), replica },
					},
					...(!replica.conflicts.length
						? {
								accounts: {
									...state.accounts,
									[accountId]: fromRecords(visible(replica)),
								},
							}
						: {}),
				})
				await flushCollections()
			},
			call: (path, options) =>
				cloudRequest(accountId, path, { ...options, signal }),
		})
		if (!active()) return
		attempts = 0
		nextAttempt = 0
		setCloud(accountId, {
			lastSuccess: Date.now(),
			status: complete
				? 'Up to date.'
				: 'More changes remain. Choose Sync Now to continue.',
		})
	} catch (error) {
		if (!active()) return
		const message =
			error instanceof Error
				? error.message
				: 'Sync failed. Local collections are safe.'
		if (error instanceof SyncError && error.status === 401)
			tokens.delete(accountId)
		setCloud(accountId, { status: message })
		const retryable =
			!(error instanceof SyncError) ||
			error.status === 429 ||
			error.status >= 500
		if (retryable) {
			nextAttempt =
				Date.now() +
				retryDelay(attempts, error instanceof SyncError ? error.retryAfter : 0)
			if (++attempts <= 3) schedule(nextAttempt - Date.now())
		}
		throw error
	} finally {
		running = false
	}
}

export async function exportLocal(accountId: string) {
	if (Platform.OS !== 'android')
		throw new Error('Direct backup downloads require Android.')
	if (
		Number(Platform.Version) < 29 &&
		(await PermissionsAndroid.request(
			PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
		)) !== PermissionsAndroid.RESULTS.GRANTED
	)
		throw new Error('Storage permission is required to save the backup.')
	updateCollections(accountId, normalize, true)
	await flushCollections()
	const collections = useCollectionStore.getState().accounts[accountId] ?? []
	const value = JSON.stringify(exportBackup(toRecords(collections)), null, 2)
	await callNativeMethod('revenge-next.gif-collections.export', [value])
	ToastActionCreators.open('GIF_COLLECTIONS_BACKUP_DOWNLOADED', {
		text: 'Backup downloaded to Downloads.',
	})
}

declare module '@revenge-mod/modules/native' {
	interface NativeMethods {
		'revenge-next.gif-collections.export': [[json: string], string]
		'revenge-next.gif-collections.readBackup': [[uri: string], string]
	}
}

export async function pickBackup(): Promise<Backup | undefined> {
	const picker = getNativeModule<{
		pick(options: {
			mode: string
			type: string[]
			allowMultiSelection: boolean
		}): Promise<unknown>
	}>('RNDocumentPicker')!
	let selected: unknown
	try {
		selected = await picker.pick({
			mode: 'open',
			type: ['application/json'],
			allowMultiSelection: false,
		})
	} catch (error) {
		if (
			error &&
			typeof error === 'object' &&
			'code' in error &&
			error.code === 'OPERATION_CANCELED'
		)
			return
		throw error
	}
	if (!Array.isArray(selected) || selected.length !== 1)
		throw new Error('Choose one JSON backup file.')
	const uri = text(object(selected[0]).uri, 4096)
	const value = await callNativeMethod(
		'revenge-next.gif-collections.readBackup',
		[uri],
	)
	return backup(JSON.parse(value))
}

export async function importLocal(accountId: string, incoming: Backup) {
	if (currentAccountId() !== accountId)
		throw new Error('Account changed. Import the backup again.')
	const current = toRecords(
		normalize(useCollectionStore.getState().accounts[accountId] ?? []),
	)
	updateCollections(
		accountId,
		() => fromRecords(importBackup(current, incoming, 'replace', newId)),
		true,
	)
	await flushCollections()
	ToastActionCreators.open('GIF_COLLECTIONS_BACKUP_IMPORTED', {
		text: 'Backup imported.',
	})
}

export async function resolveConflicts(accountId: string, keepLocal: boolean) {
	const cloud = cloudState(accountId)
	if (cloud.replica.flight)
		throw new Error('Retry Sync Now to settle the last upload first.')
	const local = exportBackup(
		toRecords(
			normalize(useCollectionStore.getState().accounts[accountId] ?? []),
		),
	)
	const replica = { ...cloud.replica, pending: [], conflicts: [] }
	const remote = visible(replica)
	// Keeping local explicitly creates fresh IDs, so deleted IDs are never revived.
	const desired = keepLocal
		? importBackup(remote, local, 'merge', newId)
		: remote
	const state = useCollectionStore.getState()
	state.updateSettings({
		accounts: { ...state.accounts, [accountId]: fromRecords(desired) },
	})
	setCloud(accountId, {
		replica: queue(replica, desired),
		status: 'Conflict resolved. Choose Sync Now.',
	})
	await flushCollections()
}

export function startCloud(): () => void {
	started = true
	const markSignedOut = () => {
		const id = currentAccountId()
		if (
			id &&
			useCollectionStore.getState()._hasHydrated &&
			cloudState(id).enabled &&
			!tokens.has(id)
		) {
			setCloud(id, { status: 'Sign in to resume cloud sync.' })
		}
	}
	markSignedOut()
	const unsubscribe = useCollectionStore.subscribe((state, previous) => {
		if (state._hasHydrated && !previous._hasHydrated) markSignedOut()
		const id = currentAccountId()
		if (
			id &&
			state._hasHydrated &&
			state.accounts[id] !== previous.accounts[id] &&
			!running
		)
			schedule()
	})
	const appState = AppState.addEventListener('change', value => {
		const id = currentAccountId()
		if (
			value === 'active' &&
			id &&
			Date.now() - (cloudState(id).lastSuccess ?? 0) > 15 * 60000
		)
			schedule()
		if (value !== 'active') controller?.abort()
	})
	return () => {
		started = false
		cancelAuthorization()
		clearTimeout(timer)
		controller?.abort()
		unsubscribe()
		appState.remove()
		tokens.clear()
		logins.clear()
	}
}
