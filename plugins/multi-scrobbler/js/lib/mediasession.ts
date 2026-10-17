export interface MediaSessionInfo {
	packageName: string
	sessionTag: string
	appName: string
	title: string | null
	artist: string | null
	album: string | null
	duration: number
	position: number
	state: number
	stateLabel: string
	playbackSpeed: number
	actions: number
	canPause: boolean
	canPlay: boolean
	canSkipNext: boolean
	canSkipPrevious: boolean
	canStop: boolean
	canSeek: boolean
	albumArtBase64: string | null
	trackNumber: number
	discNumber: number
	genre: string | null
	date: string | null
}

function isNativeAvailable(): boolean {
	try {
		return typeof revenge?.modules?.native?.callNativeMethod === 'function'
	} catch {
		return false
	}
}

export function getCurrentMediaInfo(): Promise<MediaSessionInfo | null> {
	if (!isNativeAvailable()) return Promise.resolve(null)
	return revenge.modules.native
		.callNativeMethod('mediasession.getCurrentMediaInfo', [])
		.then((result: any) => {
			if (!result || typeof result !== 'object' || !result.title) return null
			return result as MediaSessionInfo
		})
		.catch(() => null)
}

export function sendMediaCommand(
	action: string,
	...params: any[]
): Promise<boolean> {
	if (!isNativeAvailable()) return Promise.resolve(false)
	return revenge.modules.native
		.callNativeMethod('mediasession.sendMediaCommand', [action, ...params])
		.catch(() => false)
}

export function isMediaSessionAvailable(): Promise<boolean> {
	if (!isNativeAvailable()) return Promise.resolve(false)
	return revenge.modules.native
		.callNativeMethod('mediasession.isAvailable', [])
		.catch(() => false)
}

export function openNotificationListenerSettings(): Promise<boolean> {
	if (!isNativeAvailable()) return Promise.resolve(false)
	return revenge.modules.native
		.callNativeMethod('mediasession.openNotificationListenerSettings', [])
		.catch(() => false)
}

export function isNotificationListenerEnabled(): Promise<boolean> {
	if (!isNativeAvailable()) return Promise.resolve(false)
	return revenge.modules.native
		.callNativeMethod('mediasession.getNotificationListenerStatus', [])
		.catch(() => false)
}

export function isCompanionInstalled(): Promise<boolean> {
	if (!isNativeAvailable()) return Promise.resolve(false)
	return revenge.modules.native
		.callNativeMethod('mediasession.isCompanionInstalled', [])
		.catch(() => false)
}

export function isCompanionListenerEnabled(): Promise<boolean> {
	if (!isNativeAvailable()) return Promise.resolve(false)
	return revenge.modules.native
		.callNativeMethod('mediasession.isCompanionListenerEnabled', [])
		.catch(() => false)
}

export function installCompanion(): Promise<boolean> {
	if (!isNativeAvailable()) return Promise.resolve(false)
	return revenge.modules.native
		.callNativeMethod('mediasession.installCompanion', [])
		.catch(() => false)
}

export function getCompanionVersion(): Promise<number> {
	if (!isNativeAvailable()) return Promise.resolve(-1)
	return revenge.modules.native
		.callNativeMethod('mediasession.getCompanionVersion', [])
		.then((v: unknown) => (typeof v === 'number' ? v : -1))
		.catch(() => -1)
}
