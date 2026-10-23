import {
	onSettingsModulesLoaded,
	registerSettingsItem,
} from '@revenge-mod/discord/modules/settings'
import { GuildRolesPage } from '../pages/GuildRolesPage'
import { readHandoff } from './navigation'
import { getSortedRoles } from './stores'

/** Push-only route; `parent: null` keeps it out of settings. `useTitle` is required. */
export const RoleListRoute = 'PermissionViewerRoles'

function useRoleListTitle() {
	const { guildId } = readHandoff()
	if (!guildId) return 'Roles'
	return `Roles (${getSortedRoles(guildId).length})`
}

export function registerRoutes(cleanup: (fn: () => void) => void) {
	cleanup(
		onSettingsModulesLoaded(() =>
			cleanup(
				registerSettingsItem(RoleListRoute, {
					parent: null,
					type: 'route',
					useTitle: useRoleListTitle,
					screen: {
						route: RoleListRoute,
						getComponent: () => GuildRolesPage,
					},
				}),
			),
		),
	)
}
