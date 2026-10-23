import { getModuleWithImportedPath } from '@revenge-mod/discord/utils/modules/finders'
import { instead } from '@revenge-mod/patcher'
import { createElement } from 'react'
import { RoleItemWithMenu } from '../components/rolePill'
import { replaceProfileRolesList } from './profileRoles'
import { reportError } from './report'
import type { ReactNode } from 'react'
import type { RoleItemComponent } from '../components/rolePill'

/**
 * Replaces the client's `RoleItem` export by import path.
 * The card's `default` is replaced too; its roles list is a local closure.
 */
const ROLE_PILL_PATH = 'modules/user_profile/native/UserProfileRolesCard.tsx'

type ProfileCardProps = { guildId: string; style?: unknown }
type ProfileCard = (props: ProfileCardProps) => ReactNode

type RoleItemModule = {
	RoleItem: RoleItemComponent
	default: ProfileCard
}

let roleItem: RoleItemComponent | undefined

export function getRoleItem() {
	return roleItem
}

export function resolveRoleItem(cleanup: (...fns: (() => any)[]) => void) {
	cleanup(
		getModuleWithImportedPath<{ RoleItem?: RoleItemComponent }>(
			ROLE_PILL_PATH,
			(module, id) => {
				if (typeof module.RoleItem !== 'function') {
					reportError(
						`${ROLE_PILL_PATH} resolved as module ${id} without a RoleItem export, the role pill menu cannot be installed.`,
					)
					return
				}

				const target = module as RoleItemModule

				// Capture the raw pill before replacing the export.
				const rawPill = target.RoleItem

				// Hook runs in client render; return the wrapped element.
				cleanup(
					instead(target, 'RoleItem', (args, original) =>
						createElement(RoleItemWithMenu, {
							...args[0],
							Pill: original,
						}),
					),
				)
				roleItem = target.RoleItem

				// Hook the card's output; React renders the real card, hooks intact.
				cleanup(
					instead(target, 'default', (args, original) => {
						const tree = original(...args)

						// Runs during render, so it must not throw.
						try {
							return replaceProfileRolesList(tree, rawPill)
						} catch (error) {
							reportError(error)
							return tree
						}
					}),
				)
			},
		),
	)
}
