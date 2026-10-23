import { getModules } from '@revenge-mod/modules/finders'
import { withName } from '@revenge-mod/modules/finders/filters'
import { after, before } from '@revenge-mod/patcher'
import { findInReactFiber } from '@revenge-mod/utils/react'
import { UserPermissionsSheet } from '../components/memberScreens'
import { openSheet, userKey } from '../lib/navigation'
import { reportError } from '../lib/report'
import type { FC, ReactElement } from 'react'
import type { Channel, User } from '../lib/stores'

const ITEM_LABEL = 'Permissions'

const MENU_NAMES = ['UserProfileOverflowMenu', 'BotUserProfileOverflowMenu']

interface DisplayProfile {
	guildId?: string
}

interface MenuProps {
	user?: User
	channel?: Channel
	guildId?: string
	displayProfile?: DisplayProfile
}

interface MenuNamespace {
	default: FC<MenuProps>
}

interface ContextMenuItem {
	label: string
	action(): void
}

/**
 * Menu groups live on `items`, not children. Item joins the first group, before the destructive block.
 * Bots have no guild, so it comes from the channel the profile opened in.
 */
function addItem(menu: unknown, guildId: string, userId: string) {
	const holder = findInReactFiber(menu as ReactElement, node =>
		Array.isArray((node as { props?: { items?: unknown } })?.props?.items),
	) as ReactElement<{ items: ContextMenuItem[][] }> | undefined

	const groups = holder?.props.items
	if (!groups?.length) return false

	const first = groups[0]
	if (!Array.isArray(first)) return false
	if (first.some(item => item?.label === ITEM_LABEL)) return true

	first.push({
		label: ITEM_LABEL,
		action: () =>
			openSheet(
				userKey(guildId, userId),
				UserPermissionsSheet,
				{
					guildId,
					userId,
				},
				'stack',
			),
	})

	return true
}

function hookMenu(cleanup: (...fns: (() => any)[]) => void, name: string) {
	function apply(module: unknown) {
		const namespace = module as MenuNamespace
		if (typeof namespace?.default !== 'function') {
			reportError(`${name} is not a component, that profile menu is off.`)
			return
		}

		let lastProps: MenuProps | undefined

		// Capture props for the after hook; React still renders the component.
		cleanup(
			before(namespace, 'default', args => {
				lastProps = args?.[0]
				return args
			}),
		)
		cleanup(
			after(namespace, 'default', (menu: any) => {
				const props = lastProps
				lastProps = undefined

				const guildId =
					props?.guildId ??
					props?.displayProfile?.guildId ??
					props?.channel?.guild_id
				const userId = props?.user?.id
				if (typeof guildId !== 'string' || typeof userId !== 'string')
					return menu

				// Runs during render, so it must not throw.
				try {
					addItem(menu, guildId, userId)
				} catch (error) {
					reportError(error)
				}

				return menu
			}),
		)
	}

	cleanup(
		getModules(withName<FC<MenuProps>>(name), apply, {
			returnNamespace: true,
		}),
	)
}

export default function patchUserProfileMenu(
	cleanup: (...fns: (() => any)[]) => void,
) {
	for (const name of MENU_NAMES) hookMenu(cleanup, name)
}
