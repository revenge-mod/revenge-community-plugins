import { Design } from '@revenge-mod/discord/design'
import { RootNavigationRef } from '@revenge-mod/discord/modules/main_tabs_v2'
import { getModuleWithImportedPath } from '@revenge-mod/discord/utils/modules/finders'
import { lookupModule } from '@revenge-mod/modules/finders'
import { withProps } from '@revenge-mod/modules/finders/filters'
import { instead } from '@revenge-mod/patcher'
import { lookupGeneratedIconComponent } from '@revenge-mod/utils/discord'
import type * as React from 'react'

type Notifications = {
	type(props: { hasNameplate?: boolean }): React.ReactNode
}

export default plugin({
	start({ cleanup, plugin }) {
		if (plugin.startedLate) {
			plugin.requireReload()
			return
		}
		cleanup(
			getModuleWithImportedPath<{ default: Notifications }>(
				'modules/main_tabs_v2/native/you_bar/YouBarNotificationsButton.tsx',
				module => {
					const [guilds] = lookupModule(
						withProps<{ transitionToGuild(id: string): void }>(
							'transitionToGuild',
						),
					)
					const StarIcon = lookupGeneratedIconComponent('StarIcon')
					const SettingsIcon = lookupGeneratedIconComponent('SettingsIcon')
					// Discord 351 accepts icon elements; the API declaration only lists asset IDs.
					const IconButton = Design.IconButton as React.ComponentType<
						Omit<React.ComponentProps<typeof Design.IconButton>, 'icon'> & {
							icon: React.ReactNode
						}
					>
					if (
						typeof module.default?.type !== 'function' ||
						!guilds ||
						!StarIcon ||
						!SettingsIcon
					) {
						plugin.reportError('Native shortcuts are unavailable.')
						return
					}
					cleanup(
						instead(module.default, 'type', function (args, original) {
							const notification = Reflect.apply(original, this, args)
							if (notification == null) return notification
							const variant = args[0].hasNameplate
								? 'secondary-overlay'
								: 'tertiary'
							return (
								<>
									<IconButton
										size="sm"
										variant={variant}
										icon={
											<StarIcon size="xs" style={{ width: 18, height: 18 }} />
										}
										accessibilityLabel="Favorites"
										onPress={() => guilds.transitionToGuild('@favorites')}
									/>
									{notification}
									<IconButton
										size="sm"
										variant={variant}
										icon={
											<SettingsIcon
												size="xs"
												style={{ width: 18, height: 18 }}
											/>
										}
										accessibilityLabel="Settings"
										onPress={() =>
											RootNavigationRef.getRootNavigationRef().navigate(
												'settings',
											)
										}
									/>
								</>
							)
						}),
					)
				},
			),
		)
	},
	stop({ plugin }) {
		plugin.requireReload()
	},
})
