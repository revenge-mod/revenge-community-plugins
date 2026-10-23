import { lookupModuleWithImportedPath } from '@revenge-mod/discord/utils/modules/finders'
import { lookupModules } from '@revenge-mod/modules/finders'
import { withDependencies } from '@revenge-mod/modules/finders/filters'
import { openSheet, roleMembersKey } from './navigation'
import { getRole } from './stores'
import type { ComponentType } from 'react'

/** Discord's own member list for a role; lazy, so it is fingerprinted then initialized. */
const SHEET_PATH = 'modules/messages/native/RoleMembersActionSheet.tsx'

/** Lazy modules are initialized one by one; stop before touching too many strangers. */
const MAX_CANDIDATES = 8

const CHANNEL_MEMBER_STORE_PATH = 'stores/ChannelMemberStore.tsx'
const GUILD_ROLE_STORE_PATH = 'stores/GuildRoleStore.tsx'
const SNOWFLAKE_PATH = 'utils/SnowflakeUtils.tsx'

export interface RoleMembersSheetProps {
	guildId: string
	roleId: string
	channelId?: string
}

let sheet: ComponentType<RoleMembersSheetProps> | undefined
let lastError = ''

function pathId(path: string) {
	const result = lookupModuleWithImportedPath(path)
	return result.length === 2 ? result[1] : undefined
}

function anchorIds() {
	return [
		pathId(GUILD_ROLE_STORE_PATH),
		pathId(CHANNEL_MEMBER_STORE_PATH),
		pathId(SNOWFLAKE_PATH),
	].filter((id): id is number => id !== undefined)
}

/**
 * Find every module depending on the anchor set (any order, any map size), then
 * initialize candidates until the sheet's imported path shows up. Path is the
 * proof of identity, so no dependency positions are assumed.
 */
export function resolveRoleMembersSheet(): boolean {
	if (sheet) return true

	lastError = ''

	try {
		const anchors = anchorIds()
		if (anchors.length < 2) {
			lastError = `found ${anchors.length}/3 anchor modules`
			return false
		}

		const filter = withDependencies(
			withDependencies.partial(withDependencies.unordered(anchors)),
		)
		let tried = 0

		for (const [exports, id] of lookupModules(filter, {
			cached: false,
			initialize: true,
		})) {
			tried++

			if (pathId(SHEET_PATH) === id) {
				const component = (exports as { default?: unknown } | undefined)
					?.default

				if (typeof component !== 'function') {
					lastError = `module ${id} has no component export`
					return false
				}

				sheet = component as ComponentType<RoleMembersSheetProps>
				return true
			}

			if (tried >= MAX_CANDIDATES) break
		}

		lastError = `${tried} candidates, none matched the path`
		return false
	} catch (error) {
		lastError = String(error)
		return false
	}
}

export function roleMembersResolutionError() {
	return lastError
}

/** False when the sheet could not be resolved or the role is gone. */
export function openRoleMembers(guildId: string, roleId: string) {
	if (!resolveRoleMembersSheet() || !sheet || !getRole(guildId, roleId))
		return false

	openSheet(
		roleMembersKey(guildId, roleId),
		sheet,
		{ guildId, roleId },
		'stack',
	)
	return true
}
