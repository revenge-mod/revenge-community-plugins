import { Design } from '@revenge-mod/discord/design'
import { useMemo } from 'react'
import {
	getAllowIcon,
	getAvatarSizes,
	getDenyIcon,
	getMemberIcon,
	getPassthroughIcon,
	getUserAvatar,
} from '../lib/client'
import { channelOverwriteKey, openSheet } from '../lib/navigation'
import {
	channelPermissionCategories,
	formatPermissionName,
} from '../lib/permissions'
import {
	isRoleOverwrite,
	overwriteStateOf,
	overwriteSubjectName,
	summarizeOverwrite,
} from '../lib/roles'
import {
	getChannel,
	getOverwrites,
	getRole,
	getSortedRoles,
	getUser,
	useMemberUsers,
} from '../lib/stores'
import { EmptyState, PermissionSheet, roleGlyph } from './common'
import type { OverwriteState } from '../lib/roles'
import type { PermissionOverwrite } from '../lib/stores'

interface ChannelPermissionsSheetProps {
	channelId: string
}

/** Channel overwrites grouped by role hierarchy, then member name. */
export function ChannelPermissionsSheet({
	channelId,
}: ChannelPermissionsSheetProps) {
	const { TableRowGroup } = Design
	const channel = getChannel(channelId)

	// Hydrate member users before early returns: hooks cannot follow a return.
	const memberIds = useMemo(
		() =>
			channel?.guild_id
				? getOverwrites(channel)
						.filter(overwrite => !isRoleOverwrite(overwrite))
						.map(overwrite => overwrite.id)
				: [],
		[channel],
	)
	useMemberUsers(memberIds)

	if (!channel)
		return (
			<PermissionSheet title="Channel">
				<EmptyState title="This channel is no longer available." />
			</PermissionSheet>
		)

	if (!channel.guild_id)
		return (
			<PermissionSheet title={channel.name}>
				<EmptyState
					title="This channel is not in a server."
					subtitle="Direct messages have no permission overwrites."
				/>
			</PermissionSheet>
		)

	const guildId = channel.guild_id
	const overwrites = getOverwrites(channel).filter(overwrite => {
		const { allowed, denied } = summarizeOverwrite(overwrite)
		return allowed > 0 || denied > 0
	})

	if (!overwrites.length)
		return (
			<PermissionSheet title={`#${channel.name}`}>
				<EmptyState
					title="No custom permissions"
					subtitle="This channel inherits the server's roles as they are."
				/>
			</PermissionSheet>
		)

	const open = (overwrite: PermissionOverwrite) =>
		openSheet(
			channelOverwriteKey(channelId, overwrite.id),
			ChannelOverwriteSheet,
			{
				guildId,
				channelId,
				subjectId: overwrite.id,
				type: overwrite.type,
			},
			'stack',
		)

	// Role order is a position lookup, not a sort key.
	const roleOrder = new Map(
		getSortedRoles(guildId).map((role, index) => [role.id, index]),
	)
	const roleOverwrites = overwrites
		.filter(isRoleOverwrite)
		.sort((a, b) => (roleOrder.get(a.id) ?? 0) - (roleOrder.get(b.id) ?? 0))
	const memberOverwrites = overwrites
		.filter(overwrite => !isRoleOverwrite(overwrite))
		.sort((a, b) =>
			overwriteSubjectName(guildId, a).localeCompare(
				overwriteSubjectName(guildId, b),
			),
		)

	return (
		<PermissionSheet title={`#${channel.name}`}>
			{(
				[
					['Roles', roleOverwrites],
					['Members', memberOverwrites],
				] as const
			).map(([title, rows]) =>
				rows.length ? (
					<TableRowGroup key={title} title={title} hasIcons>
						{rows.map(overwrite => (
							<ChannelOverwriteRow
								key={overwrite.id}
								guildId={guildId}
								overwrite={overwrite}
								onPress={() => open(overwrite)}
							/>
						))}
					</TableRowGroup>
				) : null,
			)}
		</PermissionSheet>
	)
}

interface ChannelOverwriteSheetProps {
	guildId: string
	channelId: string
	subjectId: string
	type: 0 | 1
}

/** One subject's channel overwrite, with a glyph per permission state. */
export function ChannelOverwriteSheet({
	guildId,
	channelId,
	subjectId,
	type,
}: ChannelOverwriteSheetProps) {
	const { TableRow, TableRowGroup } = Design
	const channel = getChannel(channelId)
	const overwrite = channel
		? getOverwrites(channel).find(
				candidate => candidate.id === subjectId && candidate.type === type,
			)
		: undefined

	if (!overwrite)
		return (
			<PermissionSheet title="Permissions">
				<EmptyState title="These permissions are no longer available." />
			</PermissionSheet>
		)

	const categories = channelPermissionCategories()

	return (
		<PermissionSheet
			title={overwriteSubjectName(guildId, overwrite)}
			subtitle={type === 0 ? 'Role' : 'Member'}
		>
			{categories.map(category => (
				<TableRowGroup key={category.label} title={category.label}>
					{category.permissions.map(entry => (
						<TableRow
							key={entry.name}
							label={formatPermissionName(entry)}
							trailing={stateGlyph(overwriteStateOf(overwrite, entry.flag))}
						/>
					))}
				</TableRowGroup>
			))}
		</PermissionSheet>
	)
}

/** Glyph for a permission: granted, denied, or inherited. */
const glyphs = {
	allow: [getAllowIcon, 'icon-feedback-positive'],
	deny: [getDenyIcon, 'icon-feedback-critical'],
	passthrough: [getPassthroughIcon, 'interactive-text-default'],
} as const

function stateGlyph(state: OverwriteState) {
	const [getIcon, color] = glyphs[state]
	const Icon = getIcon()
	return Icon ? <Icon size="sm" color={color} /> : undefined
}

interface ChannelOverwriteRowProps {
	guildId: string
	overwrite: PermissionOverwrite
	onPress?(): void
}

/** One subject's channel overwrite: icon, name, and allow/deny counts. */
export function ChannelOverwriteRow({
	guildId,
	overwrite,
	onPress,
}: ChannelOverwriteRowProps) {
	const { TableRow, Text } = Design

	const summary = summarizeOverwrite(overwrite)
	const parts: string[] = []
	if (summary.allowed) parts.push(`${summary.allowed} allowed`)
	if (summary.denied) parts.push(`${summary.denied} denied`)

	return (
		<TableRow
			icon={subjectIcon(guildId, overwrite)}
			label={
				<Text
					lineClamp={1}
					variant="text-md/semibold"
					color="interactive-text-active"
				>
					{overwriteSubjectName(guildId, overwrite)}
				</Text>
			}
			subLabel={parts.join(' · ')}
			arrow
			onPress={onPress}
		/>
	)
}

/** Role shield, @everyone group icon, or member avatar. */
function subjectIcon(guildId: string, overwrite: PermissionOverwrite) {
	if (isRoleOverwrite(overwrite))
		return roleGlyph(guildId, getRole(guildId, overwrite.id))

	const Avatar = getUserAvatar()
	const sizes = getAvatarSizes()
	const user = getUser(overwrite.id)
	if (Avatar && sizes && user)
		return (
			<Avatar
				user={user}
				guildId={guildId}
				size={sizes.REFRESH_MEDIUM_32 ?? sizes.NORMAL}
			/>
		)

	const Fallback = getMemberIcon()
	return Fallback ? <Fallback size="lg" color="text-muted" /> : undefined
}
