import { Stores } from '@revenge-mod/discord/flux'
import { useEffect, useMemo, useReducer } from 'react'
import { StyleSheet, View } from 'react-native'
import { getRoleSort } from '../lib/client'
import { getMemberRoles } from '../lib/stores'
import { RoleItemWithMenu } from './rolePill'
import type { Role } from '../lib/stores'
import type { RoleItemComponent } from './rolePill'

interface ProfileRolesProps {
	guildId: string
	guildMemberRoleIds: string[]
	/** Client's own pill, from lib/roleItem.ts. */
	Pill: RoleItemComponent
}

/** Draws the client's profile roles list so its pills get the menu. */
export function ProfileRoles({
	guildId,
	guildMemberRoleIds,
	Pill,
}: ProfileRolesProps) {
	const roles = useProfileRoles(guildId, guildMemberRoleIds)

	if (!roles.length) return null

	return (
		<View style={styles.list}>
			{roles.map(role => (
				<RoleItemWithMenu
					key={role.id}
					Pill={Pill}
					role={role}
					guildId={guildId}
				/>
			))}
		</View>
	)
}

/** Re-reads on role store changes; the card only watches the member store. */
function useProfileRoles(guildId: string, roleIds: string[]): Role[] {
	const [version, bump] = useReducer(n => n + 1, 0)

	useEffect(() => {
		const { GuildRoleStore: store } = Stores
		store.addChangeListener(bump)
		return () => store.removeChangeListener(bump)
	}, [])

	return useMemo(
		() => {
			const roles = getMemberRoles(guildId, roleIds)
			const compare = getRoleSort()
			return compare ? [...roles].sort(compare) : roles
		},
		// `version` forces recompute when the role store dispatches.
		[guildId, roleIds, version],
	)
}

/** The client's roleContainer, so layout matches. */
const styles = StyleSheet.create({
	list: {
		flexDirection: 'row',
		gap: 8,
		flexWrap: 'wrap',
	},
})
