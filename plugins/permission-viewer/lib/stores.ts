import { Stores } from '@revenge-mod/discord/flux'
import { getModuleWithImportedPath } from '@revenge-mod/discord/utils/modules/finders'
import { useEffect, useReducer } from 'react'
import { reportError } from './report'
import type { DiscordModules } from '@revenge-mod/discord/types'

/**
 * Store shapes this plugin reads. Permissions are bigint on Hermes.
 * Overwrites are keyed by snowflake, not an array.
 */

/** Role gradient hex, including `#`. */
export interface RoleColorStrings {
	primaryColor: string | null
	secondaryColor: string | null
	tertiaryColor: string | null
}

export interface Role {
	id: string
	name: string
	color: number
	colorString: string | null
	/** Set only for a gradient; null for a plain color. */
	colorStrings?: RoleColorStrings | null
	/** Uploaded icon hash; null for the default shield. */
	icon?: string | null
	permissions: bigint
	position: number
	managed: boolean
}

export interface Member {
	userId: string
	nick: string | null
	roles: string[]
}

export interface PermissionOverwrite {
	id: string
	/** 0 for roles, 1 for members. */
	type: 0 | 1
	allow: bigint
	deny: bigint
}

export interface Channel {
	id: string
	name: string
	guild_id: string
	permissionOverwrites: Record<string, PermissionOverwrite> | null
}

export interface Guild {
	id: string
	name: string
	ownerId: string
}

export interface User {
	id: string
	username: string
	globalName: string | null
}

interface GuildRoleStoreShape {
	getRole(guildId: string, roleId: string): Role | undefined
	getSortedRoles(guildId: string): Role[]
}

interface GuildMemberStoreShape {
	getMember(guildId: string, userId: string): Member | undefined
}

interface ChannelStoreShape {
	getChannel(channelId: string): Channel | undefined
}

interface GuildStoreShape {
	getGuild(guildId: string): Guild | undefined
}

interface UserStoreShape {
	getUser(userId: string): User | undefined
}

interface GuildMemberCountStoreShape {
	getMemberCount(guildId: string): number | undefined
}

interface GuildRoleMemberCountStoreShape {
	getRoleMemberCount(guildId: string): Record<string, number> | undefined
	shouldFetch(guildId: string): boolean
}

interface GuildMemberListStoreShape {
	getMembers(guildId: string): Member[]
}

/** Types a client Flux store; callers rely on the shape the client itself exposes. */
function asStore<T>(store: unknown): DiscordModules.Flux.Store<T> {
	return store as DiscordModules.Flux.Store<T>
}

export function getRole(guildId: string, roleId: string): Role | undefined {
	return asStore<GuildRoleStoreShape>(Stores.GuildRoleStore).getRole(
		guildId,
		roleId,
	)
}

export function getSortedRoles(guildId: string): Role[] {
	return (
		asStore<GuildRoleStoreShape>(Stores.GuildRoleStore).getSortedRoles(
			guildId,
		) ?? []
	)
}

export function getMember(guildId: string, userId: string): Member | undefined {
	return asStore<GuildMemberStoreShape>(Stores.GuildMemberStore).getMember(
		guildId,
		userId,
	)
}

export function getChannel(channelId: string): Channel | undefined {
	return asStore<ChannelStoreShape>(Stores.ChannelStore).getChannel(channelId)
}

export function getGuild(guildId: string): Guild | undefined {
	return asStore<GuildStoreShape>(Stores.GuildStore).getGuild(guildId)
}

export function getUser(userId: string): User | undefined {
	return asStore<UserStoreShape>(Stores.UserStore).getUser(userId)
}

/** Guild size; the @everyone count comes from here. */
export function getGuildMemberCount(guildId: string): number | undefined {
	return asStore<GuildMemberCountStoreShape>(
		Stores.GuildMemberCountStore,
	)?.getMemberCount?.(guildId)
}

/** Client role member counts; only fresh when `shouldFetch` is false. */
export function getRoleMemberCountFromStore(
	guildId: string,
): Record<string, number> | undefined {
	return asStore<GuildRoleMemberCountStoreShape>(
		Stores.GuildRoleMemberCountStore,
	)?.getRoleMemberCount?.(guildId)
}

export function shouldFetchRoleMemberCounts(guildId: string) {
	return asStore<GuildRoleMemberCountStoreShape>(
		Stores.GuildRoleMemberCountStore,
	)?.shouldFetch?.(guildId)
}

/** Complete member list, when the client cached the whole guild. */
export function getGuildMembers(guildId: string): Member[] | undefined {
	return asStore<GuildMemberListStoreShape>(
		Stores.GuildMemberStore,
	)?.getMembers?.(guildId)
}

/** Subscribes to the stores a member row reads; returns the detacher. */
export function subscribeToMemberStores(listener: () => void): () => void {
	const { GuildMemberStore, UserStore } = Stores
	GuildMemberStore.addChangeListener(listener)
	UserStore.addChangeListener(listener)
	return () => {
		GuildMemberStore.removeChangeListener(listener)
		UserStore.removeChangeListener(listener)
	}
}

/** Fetches each id `UserStore` lacks; `getUser` makes no guild-cache assumption. */
const USER_ACTIONS_PATH = 'actions/UserActionCreators.tsx'

interface UserActions {
	getUser(userId: string): Promise<User | undefined>
}

let userActions: UserActions | undefined

export function resolveUserActions(cleanup: (...fns: (() => any)[]) => void) {
	cleanup(
		getModuleWithImportedPath<UserActions>(USER_ACTIONS_PATH, module => {
			if (typeof module.getUser !== 'function') return
			userActions = module
		}),
	)
}

async function hydrateUsers(ids: string[]) {
	const actions = userActions
	if (!actions || !ids.length) return

	const results = await Promise.allSettled(
		ids.map(userId => actions.getUser(userId)),
	)
	const failed = results.filter(result => result.status === 'rejected').length
	if (failed) {
		reportError(`${failed} of ${ids.length} members could not be loaded.`)
	}
}

/** Loads users for member ids and re-renders as the stores fill in. */
export function useMemberUsers(ids: string[]) {
	const key = ids.join(',')
	const [, bump] = useReducer(count => count + 1, 0)

	useEffect(() => subscribeToMemberStores(bump), [])
	useEffect(() => {
		hydrateUsers(key ? key.split(',') : [])
	}, [key])
}

/** @everyone is stored under the guild id. */
export function getEveryoneRole(guildId: string): Role | undefined {
	return getRole(guildId, guildId)
}

export function getOverwrites(channel: Channel): PermissionOverwrite[] {
	return Object.values(channel.permissionOverwrites ?? {})
}

/** Member roles in guild order. */
export function getMemberRoles(guildId: string, roleIds: string[]): Role[] {
	return roleIds
		.map(roleId => getRole(guildId, roleId))
		.filter((role): role is Role => role !== undefined)
		.sort((a, b) => b.position - a.position)
}
