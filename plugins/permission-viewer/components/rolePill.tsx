import { Design } from '@revenge-mod/discord/design'
import { Clipboard } from '@revenge-mod/externals/react-native-clipboard'
import { View } from 'react-native'
import {
	copyRoleIcon,
	getCopyColorIcon,
	getCopyIdIcon,
	getCopyImageIcon,
	getCopyNameIcon,
	getMemberIcon,
	getPermissionsIcon,
	hapticMenuOpen,
} from '../lib/client'
import { openSheet, roleKey } from '../lib/navigation'
import { reportError } from '../lib/report'
import { openRoleMembers, roleMembersResolutionError } from '../lib/roleMembers'
import { roleColorText } from '../lib/roles'
import { RolePermissionsSheet } from './roleScreens'
import type { ComponentProps, FC } from 'react'
import type { GeneratedIcon } from '../lib/client'
import type { Role } from '../lib/stores'

export type RoleItemComponent = FC<{
	role: Role
	guildId?: string
	color?: string
	onPress?(): void
	onLongPress?(): void
}>

export interface RoleItemWithMenuProps {
	/** Client's own pill. */
	Pill: RoleItemComponent
	role: Role
	guildId?: string
	/** Onboarding sets this; pills are decoration there. */
	disableInteraction?: boolean
}

/** Copy name, color, icon, id; permissions only when the guild is known. */
function pillItems(role: Role, guildId: string | undefined) {
	const items: {
		label: string
		IconComponent?: GeneratedIcon
		action(): void
	}[] = [
		{
			label: 'Copy Name',
			IconComponent: getCopyNameIcon(),
			action: () => Clipboard.setString(role.name),
		},
	]

	const color = roleColorText(role)
	if (color) {
		items.push({
			label: 'Copy Role Color',
			IconComponent: getCopyColorIcon(),
			action: () => Clipboard.setString(color),
		})
	}

	if (role.icon) {
		items.push({
			label: 'Copy Icon',
			IconComponent: getCopyImageIcon(),
			action: () => {
				copyRoleIcon(role).catch(error => {
					reportError(error)
				})
			},
		})
	}

	items.push({
		label: 'Copy ID',
		IconComponent: getCopyIdIcon(),
		action: () => Clipboard.setString(role.id),
	})

	if (guildId) {
		items.push({
			label: 'View Permissions',
			IconComponent: getPermissionsIcon(),
			action: () =>
				openSheet(
					roleKey(guildId, role.id),
					RolePermissionsSheet,
					{
						guildId,
						roleId: role.id,
					},
					'stack',
				),
		})

		items.push({
			label: 'View Members',
			IconComponent: getMemberIcon(),
			action: () => {
				if (!openRoleMembers(guildId, role.id)) {
					reportError(
						`Role members failed for ${role.id}: ${roleMembersResolutionError() || 'role not loaded'}`,
					)
				}
			},
		})
	}

	return items
}

/**
 * Client pill with a tap menu. Plain view, not pressable, so the menu gesture wins.
 * `pointerEvents="box-only"` blocks the pill's own press; `collapsable={false}` keeps the anchor measurable.
 */
export function RoleItemWithMenu({
	Pill,
	role,
	guildId,
	disableInteraction,
}: RoleItemWithMenuProps) {
	// A pill without a role would throw inside the client's screen.
	if (!role) return null

	// Onboarding draws pills as decoration, so no menu.
	if (disableInteraction) return <Pill role={role} guildId={guildId} />

	// triggerOnTap and onOpen work but are missing from ContextMenuProps.
	const { ContextMenu: Menu } = Design as {
		ContextMenu: FC<
			ComponentProps<typeof Design.ContextMenu> & {
				triggerOnTap?: boolean
				onOpen?(): void
			}
		>
	}

	return (
		<Menu
			title={role.name}
			items={pillItems(role, guildId)}
			triggerOnTap
			onOpen={hapticMenuOpen}
		>
			{({ ref }) => (
				<View ref={ref as never} collapsable={false} pointerEvents="box-only">
					<Pill role={role} guildId={guildId} />
				</View>
			)}
		</Menu>
	)
}
