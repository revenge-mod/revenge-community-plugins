import { Design } from '@revenge-mod/discord/design'
import { openSheet, roleKey } from '../lib/navigation'
import { permissionProbe } from '../lib/permissions'
import { useRoleMemberCounts } from '../lib/roles'
import { getRole, getSortedRoles } from '../lib/stores'
import {
	EmptyState,
	PermissionGrid,
	PermissionSheet,
	roleGlyph,
} from './common'
import type { SheetStacking } from '../lib/navigation'
import type { Role } from '../lib/stores'

interface RoleRowProps {
	guildId: string
	role: Role
	memberCounts?: Record<string, number>
	onPress?(): void
}

/** Settings-style role row; @everyone gets the group icon and server count. */
export function RoleRow({
	guildId,
	role,
	memberCounts,
	onPress,
}: RoleRowProps) {
	const { TableRow, Text } = Design
	const count = memberCounts?.[role.id]

	return (
		<TableRow
			icon={roleGlyph(guildId, role)}
			label={
				<Text
					lineClamp={1}
					variant="text-md/semibold"
					color="interactive-text-active"
				>
					{role.name}
				</Text>
			}
			subLabel={
				count === undefined
					? ''
					: `${count} ${count === 1 ? 'Member' : 'Members'}`
			}
			arrow
			onPress={onPress}
		/>
	)
}

interface RoleSheetProps {
	guildId: string
}

export function RolePermissionsSheet({
	guildId,
	roleId,
}: RoleSheetProps & { roleId: string }) {
	const role = getRole(guildId, roleId)
	// Counts load over HTTP, so the title fills in after the sheet opens.
	const memberCounts = useRoleMemberCounts(guildId)
	const members = memberCounts?.[roleId]

	return (
		<PermissionSheet
			title={
				members === undefined
					? (role?.name ?? 'Role')
					: `${role?.name ?? 'Role'} (${members})`
			}
			subtitle={role && role.id === guildId ? '@everyone' : undefined}
		>
			{role ? (
				<PermissionGrid hasPermission={permissionProbe(role.permissions)} />
			) : (
				<EmptyState title="This role is no longer available." />
			)}
		</PermissionSheet>
	)
}

export function RoleListSheet({ guildId }: RoleSheetProps) {
	const roles = getSortedRoles(guildId)

	return (
		<PermissionSheet title="Roles">
			{roles.length ? (
				<RoleList guildId={guildId} roles={roles} stacking="stack" />
			) : (
				<EmptyState title="This server has no roles." />
			)}
		</PermissionSheet>
	)
}

interface RoleListProps {
	guildId: string
	roles: Role[]
	stacking: SheetStacking
}

/** Role rows shared by the pushed page and the role list sheet. */
export function RoleList({ guildId, roles, stacking }: RoleListProps) {
	const { TableRowGroup } = Design
	const memberCounts = useRoleMemberCounts(guildId)

	return (
		<TableRowGroup hasIcons>
			{roles.map(role => (
				<RoleRow
					key={role.id}
					guildId={guildId}
					role={role}
					memberCounts={memberCounts}
					onPress={() =>
						openSheet(
							roleKey(guildId, role.id),
							RolePermissionsSheet,
							{ guildId, roleId: role.id },
							stacking,
						)
					}
				/>
			))}
		</TableRowGroup>
	)
}
