import { Tokens } from '@revenge-mod/discord/common/tokens'
import { Design } from '@revenge-mod/discord/design'
import { Stores, withStoreName } from '@revenge-mod/discord/flux'
import { lookupModule } from '@revenge-mod/modules/finders'
import {
	withDependencies,
	withProps,
} from '@revenge-mod/modules/finders/filters'
import type { DiscordModules } from '@revenge-mod/discord/types'
import type { ComponentProps, ComponentType } from 'react'
import type * as t from './types'

export type NativeContextMenu = ReturnType<typeof getNative>['ContextMenu']
export function getNative() {
	const { createStyles } = Design
	const ContextMenu = Design.ContextMenu as ComponentType<
		Omit<ComponentProps<typeof Design.ContextMenu>, 'children'> & {
			disableGesture?: boolean
			children(
				props: Omit<
					Parameters<ComponentProps<typeof Design.ContextMenu>['children']>[0],
					'onLongPress'
				> & { onLongPress?: () => void },
			): import('react').ReactNode
		}
	>
	const rawColors: Record<string, string> = Tokens.default.unsafe_rawColors
	const semanticColors: Record<string, string> = Tokens.default.colors

	const [FluxUtils] = lookupModule(
		withProps<{
			useStateFromStores<T>(
				stores: DiscordModules.Flux.Store[],
				factory: () => T,
				deps?: readonly unknown[],
			): T
		}>('useStateFromStores'),
	)
	const [{ useToken }] = lookupModule(
		withProps<{ useToken(color: string): string }>('useToken'),
	) as [{ useToken(color: string): string }, number]
	const [contextMenu] = lookupModule(
		withProps<{
			ContextMenuStore: { getState(): { menu?: { items: t.MenuItem[] } } }
			hideContextMenu(): void
		}>('ContextMenuStore', 'hideContextMenu'),
	)

	interface Channel {
		type: number
		name?: string
		icon?: string
		recipients?: string[]
	}
	type Store<T> = DiscordModules.Flux.Store<T>
	const {
		ChannelStore,
		GuildReadStateStore,
		GuildStore,
		PrivateChannelSortStore,
		ReadStateStore,
		SelectedChannelStore,
		SelectedGuildStore,
		SortedGuildStore,
		UserGuildSettingsStore,
		UserStore,
	} = Stores as {
		ChannelStore: Store<{ getChannel(id: string): Channel | undefined }>
		GuildReadStateStore: Store<t.ReadStore>
		GuildStore: Store<{
			getGuild(id: string): { name: string; icon?: string } | undefined
		}>
		PrivateChannelSortStore: Store<{ getPrivateChannelIds(): string[] }>
		ReadStateStore: Store<
			t.ReadStore & { lastMessageId(id: string): string | undefined }
		>
		SelectedChannelStore: Store<{ getChannelId(): string | undefined }>
		SelectedGuildStore: Store<{ getGuildId(): string | undefined }>
		SortedGuildStore: Store<{
			getGuildFolders(): t.NativeGuildFolder[]
			getGuildFolderById(id: number): t.NativeGuildFolder | undefined
		}>
		UserGuildSettingsStore: Store<object>
		UserStore: Store<{ getUser(id: string): t.NativeUser | undefined }>
	}

	return {
		createStyles,
		ContextMenu,
		rawColors,
		semanticColors,
		FluxUtils,
		useToken,
		contextMenu,
		ChannelStore,
		GuildReadStateStore,
		GuildStore,
		PrivateChannelSortStore,
		ReadStateStore,
		SelectedChannelStore,
		SelectedGuildStore,
		SortedGuildStore,
		UserGuildSettingsStore,
		UserStore,
	}
}
// Lazy native actions need store fingerprints before their exports can be inspected.
export function withStoreDependencies(...names: string[]) {
	const ids = names.map(name => {
		const [, id] = lookupModule(withStoreName(name))
		if (id === undefined)
			throw new Error(`Server Drawer: ${name} is unavailable`)
		return id
	})
	return withDependencies(withDependencies.unordered(ids))
}
