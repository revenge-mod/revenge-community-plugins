import { useEffect, useState } from 'react'
import { getHttp } from './client'
import { channelPermissionEntries, hasFlag } from './permissions'
import { reportError } from './report'
import {
	getGuildMemberCount,
	getGuildMembers,
	getMember,
	getRoleMemberCountFromStore,
	getSortedRoles,
	getUser,
	shouldFetchRoleMemberCounts,
} from './stores'
import type { PermissionOverwrite, Role } from './stores'

// Role counts from `GET /guilds/:id/roles/member-counts`, cached 120s.
// The member-list fallback is used only when the list is complete.

type MemberCounts = Record<string, number>

const REFRESH_AFTER_MS = 120_000

const cache = new Map<
	string,
	{ counts: MemberCounts | undefined; fetchedAt: number }
>()
const inFlight = new Map<string, Promise<MemberCounts | undefined>>()

/** @everyone count is the guild size; no role map carries it. */
function getEveryoneCount(guildId: string) {
	const count = getGuildMemberCount(guildId)
	return typeof count === 'number' ? count : undefined
}

function withEveryone(guildId: string, counts: MemberCounts) {
	const total = getEveryoneCount(guildId)
	return total === undefined ? counts : { ...counts, [guildId]: total }
}

/** Client store, only when fresh. */
function fromStore(guildId: string) {
	if (shouldFetchRoleMemberCounts(guildId) !== false) return undefined
	return getRoleMemberCountFromStore(guildId)
}

function fromMembers(guildId: string) {
	const members = getGuildMembers(guildId)
	if (!Array.isArray(members) || !members.length) return undefined

	const total = getEveryoneCount(guildId)
	if (total === undefined || members.length !== total) return undefined

	const counts: MemberCounts = {}
	for (const member of members) {
		for (const roleId of member?.roles ?? []) {
			if (roleId === guildId) continue
			counts[roleId] = (counts[roleId] ?? 0) + 1
		}
	}

	return withEveryone(guildId, counts)
}

/** Freshest local source, no request. */
function getRoleMemberCounts(guildId: string) {
	const cached = cache.get(guildId)?.counts
	if (cached) return cached

	const stored = fromStore(guildId)
	if (stored) return withEveryone(guildId, stored)

	return fromMembers(guildId)
}

async function fetchCounts(guildId: string) {
	const http = getHttp()
	if (!http) return getRoleMemberCounts(guildId)

	try {
		const response = await http.get({
			url: `/guilds/${guildId}/roles/member-counts`,
			rejectWithError: true,
		})
		const body = response?.body
		if (body && typeof body === 'object' && !Array.isArray(body)) {
			const counts = withEveryone(guildId, { ...(body as MemberCounts) })
			cache.set(guildId, { counts, fetchedAt: Date.now() })
			return counts
		}
	} catch (error) {
		reportError(error)
	}

	// Known-bad until the TTL expires, so a cold sheet does not re-hit the endpoint.
	cache.set(guildId, { counts: undefined, fetchedAt: Date.now() })

	// Stale backend beats a part-loaded member list.
	return getRoleMemberCounts(guildId)
}

/** Cached or fetched counts; concurrent callers share one request. */
function loadRoleMemberCounts(guildId: string) {
	const cached = cache.get(guildId)
	if (cached && Date.now() - cached.fetchedAt < REFRESH_AFTER_MS) {
		return Promise.resolve(cached.counts ?? getRoleMemberCounts(guildId))
	}

	const pending = inFlight.get(guildId)
	if (pending) return pending

	const request = fetchCounts(guildId).finally(() => {
		inFlight.delete(guildId)
	})
	inFlight.set(guildId, request)
	return request
}

/** @everyone's role id is the guild id. */
export function isEveryoneRole(guildId: string, roleId: string) {
	return roleId === guildId
}

/** Loads counts when cold and re-renders when they arrive. */
export function useRoleMemberCounts(guildId: string) {
	const [counts, setCounts] = useState(() => getRoleMemberCounts(guildId))

	useEffect(() => {
		let live = true
		loadRoleMemberCounts(guildId).then(next => {
			if (live && next) setCounts(next)
		})
		return () => {
			live = false
		}
	}, [guildId])

	return counts
}

/** Role overwrite is type 0; member is type 1. */
export function isRoleOverwrite(overwrite: PermissionOverwrite): boolean {
	return overwrite.type === 0
}

export type OverwriteState = 'allow' | 'deny' | 'passthrough'

/** Allow, deny, or inherited; deny wins when both masks set a bit. */
export function overwriteStateOf(
	overwrite: PermissionOverwrite,
	flag: bigint,
): OverwriteState {
	if (hasFlag(overwrite.deny, flag)) return 'deny'
	if (hasFlag(overwrite.allow, flag)) return 'allow'
	return 'passthrough'
}

export interface OverwriteSummary {
	allowed: number
	denied: number
}

/** Granted and denied channel permission counts; a bit in both masks is a deny. */
export function summarizeOverwrite(
	overwrite: PermissionOverwrite,
): OverwriteSummary {
	let allowed = 0
	let denied = 0
	for (const entry of channelPermissionEntries()) {
		if (hasFlag(overwrite.deny, entry.flag)) denied++
		else if (hasFlag(overwrite.allow, entry.flag)) allowed++
	}
	return { allowed, denied }
}

/** Nickname, then global name, then username, then the caller's fallback. */
export function displayName(
	member: { nick: string | null } | undefined,
	user: { globalName: string | null; username: string } | undefined,
	fallback: string,
): string {
	return member?.nick ?? user?.globalName ?? user?.username ?? fallback
}

/** Role name or member display name. */
export function overwriteSubjectName(
	guildId: string,
	overwrite: PermissionOverwrite,
): string {
	if (isRoleOverwrite(overwrite)) {
		const role = getSortedRoles(guildId).find(
			candidate => candidate.id === overwrite.id,
		)
		return role?.name ?? 'Unknown role'
	}
	const member = getMember(guildId, overwrite.id)
	const user = getUser(overwrite.id)
	return displayName(member, user, overwrite.id)
}

/** Copyable hex color; gradients join both stops with ', ', undefined when none. */
export function roleColorText(role: Role): string | undefined {
	const primary = role.colorStrings?.primaryColor ?? role.colorString
	if (!primary) return undefined

	const secondary = role.colorStrings?.secondaryColor
	return secondary ? `${primary}, ${secondary}` : primary
}
