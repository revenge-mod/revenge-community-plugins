import { getModuleWithImportedPath } from '@revenge-mod/discord/utils/modules/finders'
import { Clipboard } from '@revenge-mod/externals/react-native-clipboard'
import { getModules } from '@revenge-mod/modules/finders'
import { withProps } from '@revenge-mod/modules/finders/filters'
import { lookupGeneratedIconComponent } from '@revenge-mod/utils/discord'
import { Platform } from 'react-native'
import { reportError } from './report'
import type { ComponentType } from 'react'
import type { Role, User } from './stores'

/** Resolves a client module by import path; reports only when a required shape is missing. */
function resolveClientModule<T>(
	path: string,
	validate: (module: T) => boolean,
	assign: (module: T) => void,
	failMessage?: string,
) {
	return getModuleWithImportedPath<T>(path, module => {
		if (!validate(module)) {
			if (failMessage) reportError(failMessage)
			return
		}
		assign(module)
	})
}

/** Client HTTP helper; relative paths get the API base and auth from it. */
export interface Http {
	get(options: {
		url: string
		rejectWithError?: boolean
	}): Promise<{ body?: unknown }>
}

/** No facade; matched by its export shape. */
interface HttpModule {
	HTTP: Http
	get: unknown
	post: unknown
	put: unknown
	patch: unknown
	del: unknown
}

let http: Http | undefined

export function resolveHttp(cleanup: (...fns: (() => any)[]) => void) {
	cleanup(
		getModules(
			withProps<HttpModule>('HTTP', 'get', 'post', 'put', 'patch', 'del'),
			module => {
				http = module.HTTP
			},
			{ max: 1 },
		),
	)
}

export function getHttp() {
	return http
}

/** Client haptics by import path; types come from its own numeric enum. */
const HAPTICS_PATH = 'modules/haptics/HapticUtils.native.tsx'

interface HapticsModule {
	triggerHapticFeedback?(type: number): void
	HapticFeedbackTypes?: Record<string, number>
}

let triggerHapticFeedback: HapticsModule['triggerHapticFeedback']
let types: HapticsModule['HapticFeedbackTypes']

export function resolveHaptics(cleanup: (...fns: (() => any)[]) => void) {
	cleanup(
		resolveClientModule<HapticsModule>(
			HAPTICS_PATH,
			module =>
				typeof module.triggerHapticFeedback === 'function' &&
				Boolean(module.HapticFeedbackTypes),
			module => {
				triggerHapticFeedback = module.triggerHapticFeedback
				types = module.HapticFeedbackTypes
			},
			`${HAPTICS_PATH} resolved without the haptics exports, menus open without feedback.`,
		),
	)
}

/** Context-menu open tap: heavy on iOS, medium elsewhere; quiet if unresolved. */
export function hapticMenuOpen() {
	if (!triggerHapticFeedback || !types) return

	triggerHapticFeedback(
		Platform.OS === 'ios' ? types.IMPACT_HEAVY : types.IMPACT_MEDIUM,
	)
}

/** Client avatar by import path; lazy because resolving during module eval can fail. */
const AVATAR_PATH = 'design/void/native.tsx'

interface AvatarProps {
	user: User
	guildId?: string
	/** AvatarSizes value, e.g. 'refreshMedium32', not pixels. */
	size?: string
}

interface AvatarModule {
	Avatar?: ComponentType<AvatarProps>
	AvatarSizes?: Record<string, string>
}

let avatar: ComponentType<AvatarProps> | undefined
let avatarSizes: Record<string, string> | undefined

export function resolveUserUi(cleanup: (...fns: (() => any)[]) => void) {
	cleanup(
		resolveClientModule<AvatarModule>(
			AVATAR_PATH,
			// Avatar is a react.memo object; a typeof guard would reject it.
			module => Boolean(module.Avatar),
			module => {
				avatar = module.Avatar
				avatarSizes = module.AvatarSizes
			},
			`${AVATAR_PATH} resolved without an Avatar export, member rows will draw without one.`,
		),
	)
}

export function getUserAvatar() {
	return avatar
}

export function getAvatarSizes() {
	return avatarSizes
}

/** Role icon URL and blob-to-base64 reader, resolved by import path. */
const ROLE_ICON_PATH = 'modules/guild_boosting/RoleIconUtils.tsx'
const IMAGE_UTILS_PATH = 'utils/ImageUtils.tsx'

/** Icon fetch size; the clipboard wants a large image. */
const ICON_SIZE = 128

interface RoleIconData {
	customIconSrc?: string | null
}

interface RoleIconModule {
	getRoleIconData?(role: Role, size?: number): RoleIconData | null
}

interface ImageUtilsModule {
	readFileAsBase64?(blob: unknown): Promise<string>
}

let getRoleIconData: RoleIconModule['getRoleIconData']
let readFileAsBase64: ImageUtilsModule['readFileAsBase64']

export function resolveRoleIcon(cleanup: (...fns: (() => any)[]) => void) {
	cleanup(
		resolveClientModule<RoleIconModule>(
			ROLE_ICON_PATH,
			module => typeof module.getRoleIconData === 'function',
			module => {
				getRoleIconData = module.getRoleIconData
			},
			`${ROLE_ICON_PATH} resolved without a getRoleIconData export, role icons cannot be copied.`,
		),
	)

	cleanup(
		resolveClientModule<ImageUtilsModule>(
			IMAGE_UTILS_PATH,
			module => typeof module.readFileAsBase64 === 'function',
			module => {
				readFileAsBase64 = module.readFileAsBase64
			},
			`${IMAGE_UTILS_PATH} resolved without a readFileAsBase64 export, role icons cannot be copied.`,
		),
	)
}

/** Copies the icon itself on iOS, where `setImage` takes raw base64. */
export async function copyRoleIcon(role: Role): Promise<void> {
	if (!getRoleIconData) {
		throw new Error('the client icon modules were not resolved')
	}

	const src = getRoleIconData(role, ICON_SIZE)?.customIconSrc
	if (!src) throw new Error('this role has no icon')

	// Android's clipboard takes a URI for images, so it gets the icon link.
	if (Platform.OS === 'android') {
		Clipboard.setString(src)
		return
	}

	const reader = readFileAsBase64
	if (!reader) throw new Error('the client icon modules were not resolved')

	const base64 = src.startsWith('data:')
		? src.slice(src.indexOf(',') + 1)
		: await fetchAsBase64(src, reader)

	Clipboard.setImage(base64)
}

async function fetchAsBase64(
	url: string,
	read: (blob: unknown) => Promise<string>,
): Promise<string> {
	const blob = await (await fetch(url)).blob()
	const dataUri = await read(blob)

	return dataUri.slice(dataUri.indexOf(',') + 1)
}

/** Client profile role order (connection roles first); falls back to guild order. */
const ROLE_SORT_PATH = 'modules/user_profile/UserProfileRoleUtils.tsx'

type RoleComparator = (a: Role, b: Role) => number

let roleSort: RoleComparator | undefined

export function getRoleSort() {
	return roleSort
}

export function resolveRoleSort(cleanup: (...fns: (() => any)[]) => void) {
	cleanup(
		resolveClientModule<{ sortRolesByVerification?: RoleComparator }>(
			ROLE_SORT_PATH,
			module => typeof module.sortRolesByVerification === 'function',
			module => {
				roleSort = module.sortRolesByVerification
			},
		),
	)
}

export type GeneratedIcon = ReturnType<typeof lookupGeneratedIconComponent>

/** Client icon registries populate after startup; resolve on first use. */
function memoIcon(name: string) {
	let icon: GeneratedIcon
	return () => {
		if (icon === undefined) icon = lookupGeneratedIconComponent(name)
		return icon
	}
}

/** Role shield icon. */
export const getRoleIcon = memoIcon('ShieldUserIcon')

export const getGroupIcon = memoIcon('GroupIcon')

/** Overwrite grant glyph. */
export const getAllowIcon = memoIcon('CheckmarkLargeBoldIcon')

/** Overwrite deny glyph. */
export const getDenyIcon = memoIcon('DenyIcon')

/** Overwrite inherited glyph. */
export const getPassthroughIcon = memoIcon('SlashIcon')

/** Avatar fallback. */
export const getMemberIcon = memoIcon('UserIcon')

export const getCopyNameIcon = memoIcon('TextIcon')

export const getCopyColorIcon = memoIcon('PaintPaletteIcon')

export const getCopyImageIcon = memoIcon('ImageIcon')

export const getCopyIdIcon = memoIcon('IdIcon')

export const getPermissionsIcon = memoIcon('ShieldUserIcon')
