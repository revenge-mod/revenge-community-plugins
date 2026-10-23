import { StyleSheet, View } from 'react-native'
import { effectivePermissions, permissionProbe } from '../lib/permissions'
import { reportError } from '../lib/report'
import { getRoleItem } from '../lib/roleItem'
import { displayName } from '../lib/roles'
import { getGuild, getMember, getMemberRoles, getUser } from '../lib/stores'
import { EmptyState, PermissionGrid, PermissionSheet } from './common'
import type { Role } from '../lib/stores'

interface UserPermissionsSheetProps {
	guildId: string
	userId: string
}

/** Guild-level effective permissions; channel overwrites not applied. */
export function UserPermissionsSheet({
	guildId,
	userId,
}: UserPermissionsSheetProps) {
	const member = getMember(guildId, userId)
	const user = getUser(userId)
	const guild = getGuild(guildId)

	const isOwner = guild?.ownerId === userId
	const roles = getMemberRoles(guildId, member?.roles ?? [])
	const permissions = effectivePermissions(guildId, userId, roles)

	const name = displayName(member, user, userId)
	const subtitle = isOwner
		? 'Owner'
		: roles.length
			? `${roles.length} ${roles.length === 1 ? 'role' : 'roles'}`
			: 'No roles'

	return (
		<PermissionSheet title={name} subtitle={subtitle}>
			{!member && !user ? (
				<EmptyState title="This member is no longer available." />
			) : (
				<>
					{roles.length ? (
						<MemberRoles guildId={guildId} roles={roles} />
					) : null}
					<PermissionGrid hasPermission={permissionProbe(permissions)} />
				</>
			)}
		</PermissionSheet>
	)
}

interface MemberRolesProps {
	guildId: string
	roles: Role[]
}

/** Member's roles as client pills; the menu is installed in lib/roleItem.ts. */
export function MemberRoles({ guildId, roles }: MemberRolesProps) {
	const RoleItem = getRoleItem()

	if (!RoleItem) {
		reportError(
			'the client role pill could not be resolved, roles will not be listed on the member sheet.',
		)
		return null
	}

	if (!roles.length) return null

	return (
		<View style={styles.list}>
			{roles.map(role => (
				<RoleItem key={role.id} role={role} guildId={guildId} />
			))}
		</View>
	)
}

const styles = StyleSheet.create({
	list: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 8,
		paddingHorizontal: 16,
	},
})
