import { Design } from '@revenge-mod/discord/design'
import { StyleSheet } from 'react-native'
import { getGroupIcon, getRoleIcon } from '../lib/client'
import { formatPermissionName, permissionCategories } from '../lib/permissions'
import { isEveryoneRole } from '../lib/roles'
import type { ReactNode } from 'react'
import type { PermissionCategory } from '../lib/permissions'
import type { Role } from '../lib/stores'

interface EmptyStateProps {
	title: string
	subtitle?: string
}

export function EmptyState({ title, subtitle }: EmptyStateProps) {
	const { Stack, Text } = Design
	return (
		<Stack spacing={8} style={styles.empty}>
			<Text
				variant="heading-xl/semibold"
				color="mobile-text-heading-primary"
				style={styles.centered}
			>
				{title}
			</Text>
			{subtitle ? (
				<Text
					variant="text-sm/normal"
					color="text-default"
					style={styles.centered}
				>
					{subtitle}
				</Text>
			) : null}
		</Stack>
	)
}

const styles = StyleSheet.create({
	empty: {
		alignItems: 'center',
		marginTop: 64,
		paddingHorizontal: 16,
	},
	centered: {
		textAlign: 'center',
	},
})

/** Role glyph: @everyone gets the small group icon, other roles the colored shield. */
export function roleGlyph(guildId: string, role: Role | undefined) {
	if (role && isEveryoneRole(guildId, role.id)) {
		const Group = getGroupIcon()
		return Group ? <Group size="sm" color="text-muted" /> : undefined
	}

	const Shield = getRoleIcon()
	return Shield ? (
		<Shield size="lg" color={role?.colorString ?? undefined} />
	) : undefined
}

interface PermissionGridProps {
	hasPermission(name: string): boolean
	categories?: PermissionCategory[]
}

/** Permission bitfield as read-only client checkbox groups. */
export function PermissionGrid({
	hasPermission,
	categories = permissionCategories(),
}: PermissionGridProps) {
	const { TableCheckboxRow, TableRowGroup } = Design

	return (
		<>
			{categories.map(category => (
				<TableRowGroup key={category.label} title={category.label}>
					{category.permissions.map(entry => (
						<TableCheckboxRow
							key={entry.name}
							label={formatPermissionName(entry)}
							value={entry.name}
							checked={hasPermission(entry.name)}
							disabled
						/>
					))}
				</TableRowGroup>
			))}
		</>
	)
}

interface PermissionSheetProps {
	title: string
	subtitle?: string
	children?: ReactNode
}

/** Shared sheet shell; the ActionSheet brings its own scroll container. */
export function PermissionSheet({
	title,
	subtitle,
	children,
}: PermissionSheetProps) {
	const { ActionSheet, BottomSheetTitleHeader } = Design
	return (
		<ActionSheet>
			<BottomSheetTitleHeader title={title} subtitle={subtitle} />
			{children}
		</ActionSheet>
	)
}
