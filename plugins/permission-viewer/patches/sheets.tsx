import { getAssetIdByName } from '@revenge-mod/assets'
import { ActionSheetActionCreators } from '@revenge-mod/discord/actions'
import { Design } from '@revenge-mod/discord/design'
import { after, before } from '@revenge-mod/patcher'
import { findInReactFiber } from '@revenge-mod/utils/react'
import { isValidElement } from 'react'
import { ChannelPermissionsSheet } from '../components/channelScreens'
import { RoleListSheet } from '../components/roleScreens'
import {
	channelKey,
	openScreen,
	openSheet,
	roleListKey,
} from '../lib/navigation'
import { reportError } from '../lib/report'
import { RoleListRoute } from '../lib/routes'
import { getChannel } from '../lib/stores'
import type { ReactElement } from 'react'

/**
 * Both sheets pass through `openLazy`; match on its key rather than a component module.
 * Keys: `GuildActionSheet:<id>`, `ChannelLongPress-<id>`.
 */
const GUILD_SHEET = /^GuildActionSheet:/
const CHANNEL_SHEET = /^ChannelLongPress-/

/**
 * Channel sheet groups rows under the ActionSheet; guild sheet nests them under a plain View.
 * Never match on `Function.name`; names do not survive the build.
 */
type Finder = (tree: unknown) => ReactElement[] | undefined

/** Row group carries `hasIcons`; row carries a string label. */
const isRowGroup = (node: any) =>
	isValidElement(node) && (node as any).props?.hasIcons !== undefined

const childrenOf = (node: any): ReactElement[] | undefined => {
	const children = node?.props?.children
	return Array.isArray(children) ? children : undefined
}

/** A section list: every entry is a row group, never a group's own rows. */
const groupsOf = (node: unknown): ReactElement[] | undefined =>
	Array.isArray(node) && node.length > 0 && node.every(isRowGroup)
		? (node as ReactElement[])
		: undefined

const finders: Finder[] = [
	tree =>
		groupsOf(
			findInReactFiber(
				tree as ReactElement,
				node => groupsOf(node) !== undefined,
			),
		),

	tree =>
		childrenOf(
			findInReactFiber(
				tree as ReactElement,
				node => node?.type?.displayName === 'View',
			),
		),
]

/** Inserts the row; index 1 puts it beside "Mark as read". */
function addRow(tree: unknown, row: ReactElement, index?: number) {
	for (const find of finders) {
		const groups = find(tree)
		if (!groups?.length) continue

		// A re-render reuses the element, so guard against stacking duplicates.
		if (groups.some(group => (group as ReactElement)?.key === row.key))
			return true

		groups.splice(
			index === undefined ? groups.length : Math.min(index, groups.length),
			0,
			row,
		)
		return true
	}

	return false
}

function openRoles(guildId: string) {
	ActionSheetActionCreators.hideActionSheet()

	// Page gives real back navigation; sheet is the fallback.
	if (!openScreen(RoleListRoute, { guildId }))
		openSheet(roleListKey(guildId), RoleListSheet, { guildId }, 'stack')
}

function openChannel(channelId: string) {
	openSheet(
		channelKey(channelId),
		ChannelPermissionsSheet,
		{ channelId },
		'stack',
	)
}

function guildRow(guildId: string) {
	const { ActionSheetRow } = Design

	return (
		<ActionSheetRow.Group key="permission-viewer-guild" hasIcons>
			<ActionSheetRow
				label="Role Permissions"
				onPress={() => openRoles(guildId)}
			/>
		</ActionSheetRow.Group>
	)
}

function channelRow(channelId: string) {
	const { ActionSheetRow } = Design

	return (
		<ActionSheetRow.Group key="permission-viewer-channel" hasIcons>
			<ActionSheetRow
				label="Channel Permissions"
				icon={<ActionSheetRow.Icon source={getAssetIdByName('ShieldIcon')} />}
				onPress={() => openChannel(channelId)}
			/>
		</ActionSheetRow.Group>
	)
}

/** Runs during render; must never throw or the sheet dies. */
function attachRow(
	tree: unknown,
	makeRow: () => ReactElement,
	label: string,
	index?: number,
) {
	try {
		if (addRow(tree, makeRow(), index)) {
			return
		}
		reportError(`no row list found in the ${label} sheet.`)
	} catch (error) {
		reportError(error)
	}
}

/** Detaches the hook as soon as it fires, so it only edits one render. */
function afterOnce<T>(target: any, prop: string, fn: (value: T) => T) {
	let unpatch = () => {}
	unpatch = after(target, prop, (value: T) => {
		unpatch()
		return fn(value)
	})
	return unpatch
}

const isGuild = (label: string) => label === 'guild'

/** DMs and group DMs share the sheet key but have no channel permissions. */
const isGuildChannel = (channelId: unknown) =>
	typeof channelId === 'string' && Boolean(getChannel(channelId)?.guild_id)

function applyRows(
	module: any,
	props: any,
	label: string,
	cleanup: (...fns: (() => any)[]) => void,
) {
	const makeRow = () =>
		isGuild(label) ? guildRow(props?.guild?.id) : channelRow(props?.channelId)
	const index = isGuild(label) ? 1 : undefined
	const attach = (tree: any) => {
		attachRow(tree, makeRow, label, index)
		return tree
	}

	try {
		// Memo sheets render through `.type`.
		if (typeof module?.default === 'object' && module.default !== null) {
			cleanup(afterOnce(module.default, 'type', attach))
			return
		}

		cleanup(
			afterOnce(module, 'default', (result: any) => {
				if (typeof result?.type === 'function') {
					// Rendered another component; hook its output.
					cleanup(afterOnce(result, 'type', attach))
				} else if (result?.props?.children) {
					attach(result.props.children)
				} else {
					reportError(`the ${label} sheet rendered an unexpected shape.`)
				}

				return result
			}),
		)
	} catch (error) {
		reportError(error)
	}
}

export default function patchActionSheets(
	cleanup: (...fns: (() => any)[]) => void,
) {
	cleanup(
		before(ActionSheetActionCreators, 'openLazy', args => {
			// Runs for every sheet; a throw would block it from opening.
			try {
				const [sheet, key, props] = args
				if (typeof key !== 'string' || !sheet) return args

				const label = GUILD_SHEET.test(key)
					? 'guild'
					: CHANNEL_SHEET.test(key)
						? 'channel'
						: null
				if (!label) {
					return args
				}
				if (!isGuild(label) && !isGuildChannel(props?.channelId)) {
					return args
				}

				Promise.resolve(sheet).then(
					module => applyRows(module, props, label, cleanup),
					error => reportError(error),
				)
			} catch (error) {
				reportError(error)
			}

			return args
		}),
	)
}
