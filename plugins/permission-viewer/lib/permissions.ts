import { Constants } from '@revenge-mod/discord/common/constants'
import { getModules } from '@revenge-mod/modules/finders'
import { withProps } from '@revenge-mod/modules/finders/filters'
import { reportError } from './report'
import { getEveryoneRole, getGuild } from './stores'
import type { Role } from './stores'

export interface PermissionEntry {
	name: string
	flag: bigint
	label: string
}

export interface PermissionCategory {
	label: string
	permissions: PermissionEntry[]
}

/**
 * Client permission flags; `ADMINISTRATOR` implies every other bit.
 * `initPermissions` resolves the map before use.
 */
let flags: Record<string, bigint> | undefined

export function initPermissions() {
	const map = (
		Constants as { Permissions?: Record<string, bigint> } | undefined
	)?.Permissions
	if (!map)
		throw new Error('the client Constants.Permissions map is unavailable')
	flags = map
}

/** One named flag; throws if read before init. */
export function permissionFlagOf(name: string): bigint {
	if (!flags)
		throw new Error('permission flags were read before the map resolved')
	const value = flags[name]
	if (value === undefined)
		throw new Error(`the client has no permission named ${name}`)
	return value
}

type CategorySpec = [
	label: string,
	channelSettable: boolean,
	entries: [name: string, label: string][],
]

const categorySpecs: CategorySpec[] = [
	[
		'General',
		false,
		[
			['ADMINISTRATOR', 'Administrator'],
			['VIEW_AUDIT_LOG', 'View audit log'],
			['MANAGE_GUILD', 'Manage server'],
			['VIEW_GUILD_ANALYTICS', 'View server insights'],
			['USE_EXTERNAL_APPS', 'Use external apps'],
		],
	],
	[
		'Text',
		true,
		[
			['SEND_MESSAGES', 'Send messages'],
			['SEND_MESSAGES_IN_THREADS', 'Send messages in threads'],
			['MANAGE_MESSAGES', 'Manage messages'],
			['EMBED_LINKS', 'Embed links'],
			['ATTACH_FILES', 'Attach files'],
			['ADD_REACTIONS', 'Add reactions'],
			['USE_EXTERNAL_EMOJIS', 'Use external emoji'],
			['USE_EXTERNAL_STICKERS', 'Use external stickers'],
			['USE_EXTERNAL_SOUNDS', 'Use external sounds'],
			['SEND_TTS_MESSAGES', 'Send text-to-speech messages'],
			['SEND_VOICE_MESSAGES', 'Send voice messages'],
			['MENTION_EVERYONE', 'Mention @everyone, @here, and all roles'],
			['READ_MESSAGE_HISTORY', 'Read message history'],
		],
	],
	[
		'Voice',
		true,
		[
			['CONNECT', 'Connect'],
			['SPEAK', 'Speak'],
			['USE_VAD', 'Use voice activity'],
			['PRIORITY_SPEAKER', 'Priority speaker'],
			['STREAM', 'Video, screen share, and stream games'],
			['USE_SOUNDBOARD', 'Use soundboard'],
			['REQUEST_TO_SPEAK', 'Request to speak'],
			['MUTE_MEMBERS', 'Mute members'],
			['DEAFEN_MEMBERS', 'Deafen members'],
			['MOVE_MEMBERS', 'Move members'],
		],
	],
	[
		'Channel',
		true,
		[
			['VIEW_CHANNEL', 'View channel'],
			['MANAGE_CHANNELS', 'Manage channels'],
			['MANAGE_ROLES', 'Manage roles'],
			['MANAGE_WEBHOOKS', 'Manage webhooks'],
			['MANAGE_THREADS', 'Manage threads'],
			['CREATE_PUBLIC_THREADS', 'Create public threads'],
			['CREATE_PRIVATE_THREADS', 'Create private threads'],
			['CREATE_INSTANT_INVITE', 'Create invite'],
		],
	],
	[
		'Members',
		false,
		[
			['KICK_MEMBERS', 'Kick members'],
			['BAN_MEMBERS', 'Ban members'],
			['MODERATE_MEMBERS', 'Timeout members'],
		],
	],
	[
		'Roles',
		true,
		[
			['CHANGE_NICKNAME', 'Change own nickname'],
			['MANAGE_NICKNAMES', 'Manage other members’ nicknames'],
			['MANAGE_GUILD_EXPRESSIONS', 'Manage server emoji and stickers'],
			['CREATE_GUILD_EXPRESSIONS', 'Create server emoji and stickers'],
			['USE_EMBEDDED_ACTIVITIES', 'Use activities'],
		],
	],
	[
		'Advanced',
		true,
		[
			[
				'VIEW_CREATOR_MONETIZATION_ANALYTICS',
				'View role subscription insights',
			],
			['SEND_POLLS', 'Create polls'],
		],
	],
]

function buildCategories(channelSettableOnly = false): PermissionCategory[] {
	return categorySpecs
		.filter(spec => !channelSettableOnly || spec[1])
		.map(([label, , entries]) => ({
			label,
			permissions: entries.map(([name, entryLabel]) => ({
				name,
				flag: permissionFlagOf(name),
				label: entryLabel,
			})),
		}))
}

let categories: PermissionCategory[] | undefined
let channelCategories: PermissionCategory[] | undefined

/** Permission list in client order; builds once after init. */
export function permissionCategories(): PermissionCategory[] {
	return (categories ??= buildCategories())
}

/** Categories a channel overwrite can set; drops General and Members. */
export function channelPermissionCategories(): PermissionCategory[] {
	return (channelCategories ??= buildCategories(true))
}

/** Every channel-settable permission, category order kept. */
export function channelPermissionEntries(): PermissionEntry[] {
	return channelPermissionCategories().flatMap(category => category.permissions)
}

/** Guild-level effective bits: every role, @everyone, and owner-implicit admin. */
export function effectivePermissions(
	guildId: string,
	userId: string,
	roles: Role[],
): bigint {
	let permissions = 0n
	for (const role of roles) permissions |= toBigInt(role.permissions)
	permissions |= toBigInt(getEveryoneRole(guildId)?.permissions)
	if (getGuild(guildId)?.ownerId === userId)
		permissions |= permissionFlagOf('ADMINISTRATOR')

	return permissions
}

export function toBigInt(value: unknown): bigint {
	if (value === null || value === undefined) return 0n
	if (typeof value === 'bigint') return value
	try {
		return BigInt(value as string | number)
	} catch (error) {
		reportError(error)
		return 0n
	}
}

export function hasFlag(bits: unknown, flag: bigint): boolean {
	return (toBigInt(bits) & flag) === flag
}

/** hasPermission probe; ADMINISTRATOR implies every other bit. */
export function permissionProbe(bits: unknown) {
	const value = toBigInt(bits)
	const administrator = hasFlag(value, permissionFlagOf('ADMINISTRATOR'))

	return (name: string) =>
		administrator || hasFlag(value, permissionFlagOf(name))
}

interface PermissionNamesModule {
	getPermissionName(flag: bigint): string
}

let resolvePermissionName: (() => ((flag: bigint) => string) | null) | undefined

/** Client-localized permission name; a missing module keeps local labels. */
function getPermissionName(): ((flag: bigint) => string) | null {
	if (!resolvePermissionName) {
		let resolved: ((flag: bigint) => string) | null = null
		getModules(
			withProps<PermissionNamesModule>('getPermissionName'),
			module => {
				resolved = module.getPermissionName
			},
			{ max: 1 },
		)
		resolvePermissionName = () => resolved
	}
	return resolvePermissionName()
}

export function formatPermissionName(entry: PermissionEntry): string {
	const getName = getPermissionName()
	if (getName) {
		try {
			const localized = getName(entry.flag)
			if (localized) return localized
		} catch {
			// Unknown flag: fall through to the local label.
		}
	}
	return entry.label
}
