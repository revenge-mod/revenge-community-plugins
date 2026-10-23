interface USRBGData {
	endpoint: string
	bucket: string
	prefix: string
	users: Record<string, string>
}
interface UserPFPData {
	avatars: Record<string, string>
}

export type Settings = {
	userbgEnabled: boolean
	userpfpEnabled: boolean
}

export const DEFAULTS: Settings = {
	userbgEnabled: true,
	userpfpEnabled: true,
}

let bgData: USRBGData | null = null
let bgPromise: Promise<USRBGData | null> | null = null
let pfpData: UserPFPData | null = null
let pfpPromise: Promise<UserPFPData | null> | null = null

export function loadBG(force = false): Promise<USRBGData | null> {
	if (force) bgPromise = null
	bgPromise ??= fetch('https://usrbg.is-hardly.online/users')
		.then(res => res.json())
		.then(data => (bgData = data))
		.catch(() => null)
	return bgPromise
}

export function loadPFP(force = false): Promise<UserPFPData | null> {
	if (force) pfpPromise = null
	pfpPromise ??= fetch('https://userpfp.github.io/UserPFP/source/data.json')
		.then(res => res.json())
		.then(data => (pfpData = data))
		.catch(() => null)
	return pfpPromise
}

export function getBannerURL(user: any): string | undefined {
	if (!bgData) {
		void loadBG()
		return undefined
	}
	const entry = bgData.users[user?.id]
	if (!entry) return undefined
	return `${bgData.endpoint}/${bgData.bucket}/${bgData.prefix}${user.id}?${entry}`
}

function urlExt(url: string): string {
	return url.split('.').pop() ?? ''
}

export function getCustomAvatar(
	id: string,
	isStatic?: boolean,
): string | undefined {
	if (!pfpData) {
		void loadPFP()
		return undefined
	}
	const avatar = pfpData.avatars[id]
	if (!avatar) return undefined
	if (isStatic && urlExt(avatar) === 'gif')
		return avatar.replace('.gif', '.png')
	return avatar
}
