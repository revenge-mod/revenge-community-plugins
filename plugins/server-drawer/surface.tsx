/** @jsxImportSource . */
import { getAssetIdByName } from '@revenge-mod/assets'
import { ReactNativeSafeAreaContext } from '@revenge-mod/externals/react-native-safe-area-context'
import { FlashList as Shopify } from '@revenge-mod/externals/shopify'
import { lookupModule } from '@revenge-mod/modules/finders'
import {
	withDependencies,
	withName,
	withProps,
} from '@revenge-mod/modules/finders/filters'
import {
	Fragment,
	memo,
	startTransition,
	useEffect,
	useMemo,
	useReducer,
	useRef,
	useState,
} from 'react'
import * as Native from 'react-native'
import { createDragMotion } from './drag'
import { reportActionFailure } from './index'
import { createDrawerMotion } from './motion'
import { getNative, withStoreDependencies } from './native'
import { DefaultSettings } from './settings'
import type { JsonStorage } from '@revenge-mod/json-storage'

const clamp = (value: number, min: number, max: number) =>
	Math.min(max, Math.max(min, value))

import {
	computeGuildDockSpecs,
	DOCK_ITEM_GAP,
	DOCK_PADDING,
	filteredItems,
	moveToSlot,
	orderedDms,
} from './data'
import type * as t from './types'

export const DOCK_REST_OFFSET = 6

export function createServerDrawer(
	jsonStorage: JsonStorage<t.ServerDrawerPreferences>,
	signal: AbortSignal,
) {
	const { FlashList } = Shopify
	const {
		ChannelStore,
		ContextMenu,
		contextMenu,
		createStyles,
		FluxUtils,
		GuildReadStateStore,
		GuildStore,
		PrivateChannelSortStore,
		ReadStateStore,
		rawColors,
		SelectedChannelStore,
		SelectedGuildStore,
		SortedGuildStore,
		semanticColors,
		UserGuildSettingsStore,
		UserStore,
		useToken,
	} = getNative()
	const BORDER_WIDTH = 1
	const ICON_SIZE = 52
	const ITEM_WIDTH = ICON_SIZE + 12
	const ITEM_GAP = 12
	const SIDE_PADDING = 16

	const FLOATING_YOU_BAR = Native.Platform.OS === 'ios'
	const YOU_BAR_JOIN_DEPTH = FLOATING_YOU_BAR ? 0 : 24

	const FLOATING_PANEL_STYLE: Native.ViewStyle | undefined = FLOATING_YOU_BAR
		? {
				borderBottomLeftRadius: 24,
				borderBottomRightRadius: 24,
				borderBottomWidth: BORDER_WIDTH,
				boxShadow: `0px -6px 24px ${'rgba(0, 0, 0, 0.28)'}`,
			}
		: undefined

	const FLOATING_FOLDER_STYLE: Native.ViewStyle | undefined = FLOATING_YOU_BAR
		? { boxShadow: `0px 12px 32px ${'rgba(0, 0, 0, 0.4)'}` }
		: undefined

	const LONG_PRESS_MS = 500
	const CENTER = { alignItems: 'center', justifyContent: 'center' } as const
	const ROW = { alignItems: 'center', flexDirection: 'row' } as const
	const EMPTY_SNAPSHOT: t.ServerDrawerSnapshot = Object.freeze({
		nodes: [],
		directMessages: [],
	})

	const useStyles = createStyles({
		mentionBadge: {
			...CENTER,
			backgroundColor: semanticColors.STATUS_DANGER,
			borderColor: semanticColors.BACKGROUND_BASE_LOWEST,
			borderRadius: 10,
			borderWidth: 2,
			paddingHorizontal: 4,
			position: 'absolute',
		},
		unreadBadge: {
			backgroundColor: semanticColors.TEXT_DEFAULT,
			borderColor: semanticColors.BACKGROUND_BASE_LOWEST,
			borderRadius: 7,
			borderWidth: 2,
			position: 'absolute',
		},
		compactSelection: {
			borderColor: semanticColors.TEXT_MUTED,
			borderWidth: 3,
			bottom: -3,
			left: -3,
			position: 'absolute',
			right: -3,
			top: -3,
		},
		listItem: {
			alignItems: 'center',
			borderRadius: 12,
			flexDirection: 'row',
			gap: 14,
			minHeight: 68,
			paddingHorizontal: 10,
			width: '100%',
		},
		gridItem: { alignItems: 'center', minHeight: 82, width: ITEM_WIDTH },
		selectionRing: { ...CENTER, borderWidth: 3, height: 62, width: 62 },
		gridLabel: { fontSize: 11, marginTop: 4, textAlign: 'center', width: 68 },
		previewFrame: {
			alignItems: 'center',
			backgroundColor: semanticColors.BACKGROUND_SECONDARY_ALT,
			borderColor: semanticColors.BORDER_SUBTLE,
			borderWidth: 1,
			elevation: 18,
			shadowColor: rawColors.BLACK,
			shadowOffset: { height: 8, width: 0 },
			shadowRadius: 12,
		},
		listPreview: {
			borderRadius: 14,
			flexDirection: 'row',
			gap: 14,
			height: 68,
			paddingHorizontal: 10,
			shadowOpacity: 0.35,
		},
		gridPreview: {
			borderRadius: 20,
			minHeight: 82,
			paddingTop: 5,
			shadowOpacity: 0.4,
			width: ITEM_WIDTH,
		},
		folderInput: {
			color: semanticColors.TEXT_DEFAULT,
			fontSize: 20,
			padding: 4,
			borderBottomWidth: 1,
			borderColor: semanticColors.TEXT_BRAND,
		},
		folderTitle: {
			color: semanticColors.TEXT_DEFAULT,
			fontSize: 20,
			fontWeight: '700',
		},
		dmButton: {
			...CENTER,
			backgroundColor: semanticColors.BACKGROUND_SECONDARY_ALT,
			borderRadius: 16,
		},
		dockDivider: {
			alignSelf: 'center',
			backgroundColor: semanticColors.BORDER_SUBTLE,
			marginHorizontal: -5.5,
			width: 1,
		},
		dockRow: {
			...ROW,
			gap: DOCK_ITEM_GAP,
			paddingHorizontal: DOCK_PADDING / 2,
		},
		emptyContainer: { ...CENTER, minHeight: 180, padding: 24 },
		emptyText: {
			color: semanticColors.TEXT_DEFAULT,
			fontSize: 17,
			fontWeight: '600',
			textAlign: 'center',
		},
		header: { ...ROW, minHeight: 50, paddingHorizontal: 12 },
		viewTabs: {
			backgroundColor: semanticColors.BACKGROUND_BASE_LOWER,
			borderRadius: 10,
			flex: 1,
			flexDirection: 'row',
			padding: 3,
		},
		viewTab: {
			...CENTER,
			borderRadius: 8,
			flex: 1,
			minHeight: 36,
			paddingHorizontal: 5,
		},
		searchRow: { gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
		searchInput: {
			backgroundColor: semanticColors.BACKGROUND_BASE_LOWER,
			color: semanticColors.TEXT_DEFAULT,
			minHeight: 42,
			paddingHorizontal: 12,
			borderRadius: 8,
		},
		filterTabs: {
			backgroundColor: semanticColors.BACKGROUND_BASE_LOWER,
			borderRadius: 9,
			flexDirection: 'row',
			padding: 3,
		},
		filterTab: { ...CENTER, borderRadius: 7, flex: 1, minHeight: 36 },
		handle: { ...CENTER, height: 16, width: '100%' },
		handleBar: {
			backgroundColor: semanticColors.TEXT_MUTED,
			borderRadius: 3,
			height: 5,
			opacity: 0.5,
			width: 38,
		},
		exitTarget: {
			...CENTER,
			width: 56,
			height: 56,
			position: 'absolute',
			zIndex: 110,
			elevation: 65,
		},
		folderBackdrop: {
			alignItems: 'center',
			bottom: 0,
			justifyContent: 'center',
			left: 0,
			position: 'absolute',
			right: 0,
			top: 0,
			zIndex: 60,
		},
		folderPanel: {
			alignItems: 'center',
			backgroundColor: semanticColors.BACKGROUND_SECONDARY_ALT,
			borderRadius: 40,
			elevation: 45,
			overflow: 'hidden',
		},
		folderPage: {
			alignContent: 'flex-start',
			...ROW,
			flexWrap: 'wrap',
			gap: 8,
			paddingBottom: 28,
			paddingHorizontal: 10,
			paddingTop: 52,
		},
		folderHeading: { position: 'absolute', top: 8, left: 20, right: 20 },
		pageDots: {
			alignItems: 'center',
			bottom: 8,
			flexDirection: 'row',
			gap: 5,
			justifyContent: 'center',
			position: 'absolute',
		},
		pageDot: {
			borderRadius: 3,
			height: 7,
			marginHorizontal: 4,
			marginVertical: 10,
			width: 7,
		},
		dragPreview: { elevation: 60, position: 'absolute', top: 0, zIndex: 100 },
		drawerBackdrop: {
			bottom: 0,
			left: 0,
			position: 'absolute',
			right: 0,
			top: 0,
			zIndex: 0,
		},
		drawerPanel: {
			backgroundColor: semanticColors.BACKGROUND_BASE_LOWEST,
			borderColor: semanticColors.BORDER_SUBTLE,
			borderTopLeftRadius: 24,
			borderTopRightRadius: 24,
			borderWidth: BORDER_WIDTH,
			borderBottomWidth: 0,
			elevation: 0,
			overflow: 'hidden',
			position: 'absolute',
			zIndex: 0,
		},
		compactFace: {
			backgroundColor: semanticColors.BACKGROUND_BASE_LOWEST,
			position: 'absolute',
			top: 16,
			left: 0,
			right: 0,
			zIndex: 2,
		},
		expandedFace: {
			backgroundColor: semanticColors.BACKGROUND_BASE_LOWEST,
			position: 'absolute',
			left: 0,
			right: 0,
			top: 16,
			zIndex: 1,
		},
	})

	function getDrawerGeometry(
		width: number,
		height: number,
		layout: t.DrawerLayout,
	) {
		const dockSpecs = computeGuildDockSpecs(width - 16)
		const grid = layout === 'grid'
		const contentWidth = dockSpecs.dockWidth - SIDE_PADDING * 2
		const columns = grid
			? Math.max(
					3,
					Math.floor((contentWidth + ITEM_GAP) / (ITEM_WIDTH + ITEM_GAP)),
				)
			: 1
		const columnStep = grid
			? Math.max(
					ITEM_WIDTH + ITEM_GAP,
					(contentWidth - ITEM_WIDTH) / (columns - 1),
				)
			: ITEM_WIDTH
		const previewWidth = grid
			? ITEM_WIDTH
			: Math.max(1, dockSpecs.dockWidth - 20)

		return {
			dockSpecs,
			grid,
			columns,
			columnStep,
			previewWidth,
			// FlashList owns equal-width cells; offset their contents to preserve the drag column step.
			columnOffset: grid
				? columnStep - (contentWidth - BORDER_WIDTH * 2) / columns
				: 0,
			drawerHeight: Math.max(dockSpecs.dockHeight, height - 32),
			panelLeft: Math.max(0, Math.round((width - dockSpecs.dockWidth) / 2)),
		}
	}

	function Icon({
		name,
		color,
		size = 24,
		label,
		onPress,
		buttonSize = 44,
	}: t.IconProps) {
		const image = (
			<Native.Image
				source={getAssetIdByName(name)}
				style={{ width: size, height: size, tintColor: color }}
			/>
		)

		return label ? (
			<Native.Pressable
				accessibilityLabel={label}
				accessibilityRole="button"
				onPress={onPress}
				style={{ ...CENTER, height: buttonSize, width: buttonSize }}
			>
				{image}
			</Native.Pressable>
		) : (
			image
		)
	}

	const initials = (name: string) =>
		name
			.trim()
			.split(/\s+/u)
			.slice(0, 2)
			.map(piece => piece[0])
			.join('')
			.toUpperCase() || '?'

	function createController() {
		const [iconUtils] = lookupModule(
			withProps<{
				getGuildIconURL(props: {
					id: string
					icon: string
					size: number
					canAnimate: boolean
				}): string
				getChannelIconURL(props: {
					id: string
					icon: string
					size: number
				}): string
			}>('getGuildIconURL', 'getChannelIconURL'),
		)
		const [actions] = lookupModule(
			withProps<{
				moveById(source: string | number, target: string | number): void
				createGuildFolderLocal(ids: string[], name: undefined): void
				editGuildFolderLocal(
					id: string | number | undefined,
					ids: string[],
					name?: string,
				): void
			}>('moveById', 'createGuildFolderLocal', 'editGuildFolderLocal').and(
				withStoreDependencies(
					'ExpandedGuildFolderStore',
					'SelectedGuildStore',
					'GuildStore',
				),
			),
		)
		const [folderSettings] = lookupModule(
			withProps<{
				saveGuildFolders(folders: t.NativeGuildFolder[]): Promise<void>
			}>('saveGuildFolders').and(
				withStoreDependencies(
					'ClientThemesBackgroundStore',
					'SelectivelySyncedUserSettingsStore',
					'ThemeStore',
				),
			),
		)
		const [channelNavigation, channelNavigationId] = lookupModule(
			withProps<{ transitionToChannel(id: string, options: object): void }>(
				'transitionToChannel',
			)
				.and(withStoreDependencies('ChannelStore'))
				.and(
					withDependencies(
						withDependencies.partial([
							null,
							null,
							withDependencies.relative(1),
							withDependencies.relative(2),
						]),
					),
				),
		)
		if (channelNavigationId === undefined)
			throw new Error('Server Drawer: native channel navigation is unavailable')
		const [guildBarNavigation] = lookupModule(
			withName<(id: string) => void>(
				'transitionGuildsBarToGuildOrOpenSelectedChannel',
			)
				.and(
					withStoreDependencies('SelectedChannelStore', 'SelectedGuildStore'),
				)
				.and(
					withDependencies(withDependencies.unordered([channelNavigationId])),
				),
		)

		const nativeActions = [
			actions?.moveById,
			actions?.createGuildFolderLocal,
			actions?.editGuildFolderLocal,
			guildBarNavigation,
			channelNavigation?.transitionToChannel,
			folderSettings?.saveGuildFolders,
		]
		if (
			!iconUtils ||
			!actions ||
			!folderSettings ||
			!channelNavigation ||
			!guildBarNavigation ||
			nativeActions.some(action => typeof action !== 'function')
		)
			throw new Error(
				'ServerDrawer: a native guild, navigation or account sync action is unavailable',
			)

		const persistFolders = async () => {
			try {
				// Local actions update the tree; the native saver queues the account settings update.
				await folderSettings.saveGuildFolders(
					SortedGuildStore.getGuildFolders().map(
						(entry: t.NativeGuildFolder) => ({
							...entry,
							guildIds: [...entry.guildIds],
						}),
					),
				)
			} catch (error) {
				reportActionFailure('sync folder changes to your account', error)
			}
		}

		const mutate = (action: () => void) => {
			action()
			persistFolders()
		}

		const folder = (id: string): t.NativeGuildFolder | undefined =>
			SortedGuildStore.getGuildFolderById(Number(id))

		const editFolder = (
			current: t.NativeGuildFolder,
			guildIds = current.guildIds,
			name = current.folderName,
		) =>
			mutate(() =>
				actions.editGuildFolderLocal(current.folderId, guildIds, name),
			)

		const guildExists = (id: string) => !!GuildStore.getGuild(id)

		const badge = (store: t.ReadStore, id: string): t.BadgeState => ({
			mentionCount: store.getMentionCount(id),
			unread: store.hasUnread(id),
		})

		const guildNode = (id: string, folderId?: string): t.DrawerGuild[] => {
			const guild = GuildStore.getGuild(id)
			if (!guild?.name?.trim()) return []
			const state = badge(GuildReadStateStore, id)

			return [
				{
					id,
					kind: 'guild',
					name: guild.name,
					folderId,
					avatarUri: guild.icon
						? iconUtils.getGuildIconURL({
								id,
								icon: guild.icon,
								size: 128,
								canAnimate: false,
							})
						: undefined,
					animatedAvatarUri: guild.icon?.startsWith('a_')
						? iconUtils.getGuildIconURL({
								id,
								icon: guild.icon,
								size: 128,
								canAnimate: true,
							})
						: undefined,
					...state,
					unread: state.unread || state.mentionCount > 0,
				},
			]
		}

		const privateChannel = (id: string) => {
			const channel = ChannelStore.getChannel(id)

			return !channel || (channel.type !== 1 && channel.type !== 3)
				? undefined
				: channel
		}

		// The drawer subscribes to nine high-traffic stores, so the snapshot is re-evaluated on
		// every dispatch any of them make. Fingerprint the state the dock actually displays and
		// reuse the cached tree while it is unchanged, so useStateFromStores keeps seeing one
		// reference and unrelated traffic stops re-rendering every dock item.
		const userKey = (id: string) => {
			const user = UserStore.getUser(id)

			return user
				? `${id}.${user.avatar ?? ''}.${user.globalName || user.username}`
				: id
		}

		const guildKey = (id: string) => {
			const guild = GuildStore.getGuild(id)
			if (!guild?.name?.trim()) return ''
			const state = badge(GuildReadStateStore, id)

			return `${id}.${guild.name}.${guild.icon ?? ''}.${state.mentionCount}.${state.unread ? 1 : 0}`
		}

		const snapshotKey = () =>
			[
				SelectedGuildStore.getGuildId() ?? '',
				SelectedChannelStore.getChannelId() ?? '',
				...SortedGuildStore.getGuildFolders().map(
					(folder: t.NativeGuildFolder) =>
						`${folder.folderId ?? ''}.${folder.folderName ?? ''}.${folder.folderColor ?? ''}.${folder.guildIds.map(guildKey).join(',')}`,
				),
				...PrivateChannelSortStore.getPrivateChannelIds().map((id: string) => {
					const channel = privateChannel(id)
					if (!channel) return ''
					const state = badge(ReadStateStore, id)

					return `${id}.${channel.name ?? ''}.${channel.icon ?? ''}.${(channel.recipients ?? []).map(userKey).join(',')}.${state.mentionCount}.${state.unread ? 1 : 0}`
				}),
			].join('\u0000')

		const buildSnapshot = (): t.ServerDrawerSnapshot => {
			const nodes: t.DrawerNode[] =
				SortedGuildStore.getGuildFolders().flatMap<t.DrawerNode>(
					(folder: t.NativeGuildFolder) => {
						const id =
							folder.folderId == null ? undefined : String(folder.folderId)
						const children = folder.guildIds.flatMap(guild =>
							guildNode(guild, id),
						)
						if (id === undefined) return children

						return [
							{
								id,
								kind: 'folder',
								children,
								name: folder.folderName?.trim() || undefined,
								color: folder.folderColor,
								mentionCount: children.reduce(
									(total, guild) => total + guild.mentionCount,
									0,
								),
								unread: children.some(guild => guild.unread),
							},
						]
					},
				)

			const directMessages: t.DirectMessage[] =
				PrivateChannelSortStore.getPrivateChannelIds().flatMap((id: string) => {
					const channel = privateChannel(id)
					if (!channel) return []

					const users: t.NativeUser[] = (channel.recipients ?? [])
						.map((recipient: string) => UserStore.getUser(recipient))
						.filter((user: t.NativeUser | undefined) => user !== undefined)
					const avatarUri =
						channel.type === 1
							? users[0]?.getAvatarURL?.(undefined, 128, false)
							: channel.icon
								? iconUtils.getChannelIconURL({
										id,
										icon: channel.icon,
										size: 128,
									})
								: undefined

					const animatedAvatarUri =
						channel.type === 1 && users[0]?.avatar?.startsWith('a_')
							? users[0].getAvatarURL(undefined, 128, true)
							: undefined

					return [
						{
							id,
							avatarUri,
							animatedAvatarUri,
							...badge(ReadStateStore, id),
							name:
								channel.name ||
								users
									.map(user => user.globalName || user.username)
									.join(', ') ||
								'Direct Message',
						},
					]
				})

			return {
				nodes,
				directMessages,
				selectedGuildId: SelectedGuildStore.getGuildId(),
				selectedPrivateChannelId: SelectedChannelStore.getChannelId(),
			}
		}

		let cached: t.ServerDrawerSnapshot | undefined
		let cachedKey: string | undefined

		return {
			markAllRead() {
				const [markGuildsAsRead] = lookupModule(
					withName<t.MarkGuildsAsRead>('markGuildsAsRead').and(
						withStoreDependencies(
							'GuildOnboardingPromptsStore',
							'ActiveJoinedThreadsStore',
							'ReadStateStore',
						),
					),
				)
				const [readActions] = lookupModule(
					withProps<t.ReadActions & { ackChannel: unknown }>(
						'bulkAck',
						'ackChannel',
					).and(
						withStoreDependencies(
							'ActiveJoinedThreadsStore',
							'ChannelStore',
							'GuildCategoryStore',
						),
					),
				)
				const [readTypes] = lookupModule(
					withProps<{ ReadStateTypes: { CHANNEL: number } }>('ReadStateTypes'),
				)
				const ReadStateTypes = readTypes?.ReadStateTypes

				if (
					typeof markGuildsAsRead !== 'function' ||
					typeof readActions?.bulkAck !== 'function' ||
					typeof ReadStateTypes?.CHANNEL !== 'number' ||
					typeof ReadStateStore.lastMessageId !== 'function'
				) {
					throw new Error(
						'ServerDrawer: native mark read actions are unavailable',
					)
				}

				const channels = PrivateChannelSortStore.getPrivateChannelIds().map(
					(channelId: string) => ({
						channelId,
						readStateType: ReadStateTypes.CHANNEL,
						messageId: ReadStateStore.lastMessageId(channelId),
					}),
				)
				markGuildsAsRead(
					SortedGuildStore.getGuildFolders().flatMap(
						(folder: t.NativeGuildFolder) => folder.guildIds,
					),
					'ServerDrawer',
				)
				if (channels.length) readActions.bulkAck(channels)
			},

			snapshot(): t.ServerDrawerSnapshot {
				const key = snapshotKey()
				if (cached && key === cachedKey) return cached
				cachedKey = key

				return (cached = buildSnapshot())
			},

			// Native actions return void; false means the item or route is no longer available.
			selectGuild: (id: string): void | false =>
				guildExists(id) ? guildBarNavigation(id) : false,

			selectPrivateChannel: (id: string): void | false =>
				ChannelStore.getChannel(id)
					? channelNavigation.transitionToChannel(id, {})
					: false,

			commitDrop(
				sourceId: string,
				targetId: string,
				mode: 'move' | 'merge' | 'exit',
			) {
				const target = folder(targetId)
				// An exit edits full native membership; omitted members become standalone servers.
				if (mode === 'exit')
					return (
						!!target?.guildIds.includes(sourceId) &&
						editFolder(
							target,
							target.guildIds.filter(id => id !== sourceId),
						)
					)
				const source = mode === 'move' ? folder(sourceId) : undefined
				if (
					sourceId === targetId ||
					(!source && !guildExists(sourceId)) ||
					(!target && !guildExists(targetId))
				)
					return false

				if (mode === 'move')
					return mutate(() => {
						const folders = SortedGuildStore.getGuildFolders()
						const siblings =
							folders.find(
								entry =>
									entry.folderId !== undefined &&
									entry.guildIds.includes(sourceId),
							)?.guildIds ??
							folders.map(entry => entry.folderId ?? entry.guildIds[0])
						moveToSlot(
							(from, to) => actions.moveById(from, to),
							siblings,
							source?.folderId ?? sourceId,
							target?.folderId ?? targetId,
						)
					})
				return target
					? !target.guildIds.includes(sourceId) &&
							editFolder(target, [...target.guildIds, sourceId])
					: mutate(() =>
							actions.createGuildFolderLocal([targetId, sourceId], undefined),
						)
			},

			renameFolder(id: string, name: string) {
				const current = folder(id)

				return !!current && editFolder(current, undefined, name.trim())
			},

			openCreateGuild() {
				const [, navigationId] = lookupModule(
					withProps('pushLazy', 'popWithKey'),
				)
				if (navigationId === undefined)
					throw new Error('Server Drawer: modal navigation is unavailable')
				const [actions] = lookupModule(
					withProps<{ openCreateGuildModal(): void }>(
						'openCreateGuildModal',
					).and(
						withDependencies(
							withDependencies.partial([
								null,
								navigationId,
								withDependencies.relative(1),
							]),
						),
					),
				)
				if (!actions)
					throw new Error('Server Drawer: create server action is unavailable')
				actions.openCreateGuildModal()
			},

			openCreateDm(): void | false {
				const [navigation] = lookupModule(
					withProps<{
						getRootNavigationRef(): {
							current?: { navigate(route: string, params: object): void }
						}
					}>('getRootNavigationRef'),
				)
				const navigator = navigation?.getRootNavigationRef()?.current
				// Use the same nested route as Discord's Messages header, including on first use.
				return navigator
					? navigator.navigate('friends', {
							screen: 'new-message',
							params: { sourcePage: 'NEW_MESSAGE_COMPOSER' },
						})
					: false
			},

			animateNext: (duration?: number) =>
				Native.LayoutAnimation.configureNext({
					duration: duration ?? 110,
					update: { type: Native.LayoutAnimation.Types.easeInEaseOut },
				}),
		}
	}

	function createGuildMenu(signal: AbortSignal, folder = false) {
		const getItems = folder
			? lookupModule(
					withProps<{
						getGuildFolderMenuItems(id: string | number): t.MenuItem[]
					}>('getGuildFolderMenuItems').and(
						withStoreDependencies('SortedGuildStore'),
					),
				)[0]?.getGuildFolderMenuItems
			: lookupModule(
					withName<(id: string | number) => t.MenuItem[]>(
						'getGuildsBarGuildMenuItems',
					),
				)[0]
		if (typeof getItems !== 'function')
			throw new Error('ServerDrawer: native guild menu is unavailable')

		const wrap = (item: t.MenuItem): t.MenuItem => ({
			...item,
			async action() {
				try {
					await item.action()
				} catch (error) {
					reportActionFailure('complete this server action', error)
				}
			},
		})

		return function GuildMenu({ guild, children }: t.GuildMenuProps) {
			// Discord stores folder IDs as numbers; guild snowflakes remain strings.
			const id = folder ? Number(guild.id) : guild.id

			// The native builder allocates a fresh list on every call, so subscribe to its labels
			// rather than the list itself: a primitive key keeps the wrapped items stable, which
			// keeps both the menu and the abort listener below off the dispatch path.
			const labels = FluxUtils!.useStateFromStores(
				[GuildStore, UserGuildSettingsStore],
				() =>
					getItems(id)
						.map((item: t.MenuItem) => item.label)
						.join('\u0000'),
				[guild.id],
			)
			const items: t.MenuItem[] = useMemo(
				() => getItems(id).map(wrap),
				[guild.id, labels],
			)
			useEffect(() => {
				const close = () => {
					if (contextMenu!.ContextMenuStore.getState().menu?.items === items)
						contextMenu!.hideContextMenu()
				}
				signal.addEventListener('abort', close)

				return () => {
					signal.removeEventListener('abort', close)
					close()
				}
			}, [items])

			return (
				<ContextMenu
					items={items}
					title={guild.name}
					triggerOnLongPress
					disableGesture
				>
					{children}
				</ContextMenu>
			)
		}
	}

	function createServerDrawerSurface(
		controller: ReturnType<typeof createController>,
		signal: AbortSignal,
		jsonStorage: JsonStorage<t.ServerDrawerPreferences>,
	) {
		const GuildMenu = createGuildMenu(signal)
		const FolderMenu = createGuildMenu(signal, true)
		const { useSafeAreaInsets } = ReactNativeSafeAreaContext
		const [backPress] = lookupModule(
			withProps<{ useNavigatorBackPressHandler(handler: () => boolean): void }>(
				'useNavigatorBackPressHandler',
			),
		)
		if (!backPress)
			throw new Error('Server Drawer: native back handler is unavailable')
		const { useNavigatorBackPressHandler } = backPress
		const [gestures] = lookupModule(
			withProps<t.NativeGestureModule>('Gesture', 'GestureDetector'),
		)
		if (!gestures)
			throw new Error('Server Drawer: native gestures are unavailable')
		const { Gesture, GestureDetector } = gestures
		const {
			touchSlop,
			AnimatedView,
			AnimatedPressable,
			useDrawerMotion,
			usePageMotion,
			useFolderPageMotion,
			useFolderOverlayMotion,
		} = createDrawerMotion(Gesture)
		const { Image, Pressable, ScrollView, Text, View, TextInput } = Native

		const { DragTarget, usePreview } = createDragMotion(
			{ Gesture, GestureDetector },
			LONG_PRESS_MS,
		)

		const DrawerCell = memo((props: t.DrawerCellProps) =>
			props.render.current(props),
		)

		function Badge({ state, compact }: t.BadgeProps) {
			const styles = useStyles()

			if (state.mentionCount)
				return (
					<View
						style={[
							styles.mentionBadge,
							{
								bottom: compact ? -3 : -4,
								minHeight: compact ? 18 : 20,
								minWidth: compact ? 18 : 20,
								right: compact ? -4 : -5,
							},
						]}
					>
						<Text
							style={{
								color: rawColors.WHITE,
								fontSize: compact ? 9 : 10,
								fontWeight: '800',
							}}
						>
							{state.mentionCount > 99 ? '99+' : state.mentionCount}
						</Text>
					</View>
				)

			return state.unread ? (
				<View
					style={[
						styles.unreadBadge,
						{
							bottom: compact ? -2 : -3,
							height: compact ? 13 : 14,
							right: compact ? -2 : -3,
							width: compact ? 13 : 14,
						},
					]}
				/>
			) : null
		}

		const Artwork = memo(function Artwork({
			item,
			size,
			badged,
			compact,
			selected,
			animate,
		}: t.ArtworkProps) {
			const styles = useStyles()
			const background: string = useToken(semanticColors.BACKGROUND_BASE_LOWER)
			const foreground: string = useToken(semanticColors.TEXT_DEFAULT)
			const folderBackground: string = useToken(
				semanticColors.GUILD_FOLDER_BACKGROUND,
			)
			const folder = item.kind === 'folder'
			const uri = folder ? undefined : item.avatarUri
			const source = useMemo(
				() => (typeof uri === 'number' ? uri : { uri }),
				[uri],
			)
			const animatedUri =
				!folder && animate && item.animatedAvatarUri !== uri
					? item.animatedAvatarUri
					: undefined
			const animatedSource = useMemo(
				() => ({ uri: animatedUri }),
				[animatedUri],
			)
			const radius = !item.kind
				? size / 2
				: size >= 44
					? 16
					: folder
						? 9
						: Math.max(5, Math.round(size * 0.28))
			let fill = item.kind === 'guild' ? rawColors.BRAND_500 : background
			if (folder)
				fill =
					item.color === undefined
						? folderBackground
						: `#${item.color.toString(16).padStart(6, '0')}`

			return (
				<View
					style={{
						...CENTER,
						position: 'relative',
						height: size,
						width: size,
						borderRadius: radius,
						backgroundColor: uri ? undefined : fill,
					}}
				>
					{folder ? (
						item.children.slice(0, 4).map((guild, index) => (
							<View
								key={guild.id}
								style={{
									[index % 2 ? 'right' : 'left']: 6,
									[index < 2 ? 'top' : 'bottom']: 6,
									position: 'absolute',
								}}
							>
								<Artwork item={guild} size={Math.floor(size * 0.34)} />
							</View>
						))
					) : uri ? (
						<Fragment>
							<Image
								accessibilityIgnoresInvertColors
								resizeMode="cover"
								source={source}
								fadeDuration={0}
								style={{ borderRadius: radius, height: size, width: size }}
							/>
							{animatedUri && (
								<Image
									accessibilityIgnoresInvertColors
									resizeMode="cover"
									source={animatedSource}
									fadeDuration={0}
									style={{
										position: 'absolute',
										borderRadius: radius,
										height: size,
										width: size,
									}}
								/>
							)}
						</Fragment>
					) : (
						<Text
							numberOfLines={1}
							style={{
								color: item.kind ? rawColors.WHITE : foreground,
								fontSize: Math.max(10, Math.round(size * 0.34)),
								fontWeight: '700',
							}}
						>
							{initials(item.name)}
						</Text>
					)}
					{selected ? (
						<View
							pointerEvents="none"
							style={[styles.compactSelection, { borderRadius: size / 3 + 3 }]}
						/>
					) : null}
					{badged ? <Badge state={item} compact={compact} /> : null}
				</View>
			)
		})

		function Item({
			item,
			layout = 'grid',
			selectedId,
			dragging,
			merging,
			onPress,
			menu,
			compactSize,
			previewWidth,
			animate,
		}: t.ItemProps) {
			const styles = useStyles()
			const touch = useRef<t.DragPoint | undefined>(undefined)
			const moved = useRef(false)
			const press = {
				onTouchStart: ({
					nativeEvent: event,
				}: Native.GestureResponderEvent) => {
					touch.current = { x: event.pageX, y: event.pageY }
					moved.current = false
				},
				onTouchMove: ({ nativeEvent: event }: Native.GestureResponderEvent) => {
					if (
						touch.current &&
						Math.hypot(
							event.pageX - touch.current.x,
							event.pageY - touch.current.y,
						) > touchSlop
					)
						moved.current = true
				},
				onTouchCancel: () => {
					moved.current = false
				},
				onPress: () => {
					// A short swipe should not open whatever was under your finger.
					const activate = !moved.current
					moved.current = false
					if (activate) onPress?.()
				},
			}
			const foreground: string = useToken(semanticColors.TEXT_DEFAULT)
			const brand: string = useToken(semanticColors.TEXT_BRAND)
			const muted: string = useToken(semanticColors.TEXT_MUTED)
			const folder = item.kind === 'folder'
			const selected = !folder && item.id === selectedId
			const label = item.name ?? (compactSize ? 'Server folder' : 'Folder')
			const accessibilityLabel =
				label +
				(item.mentionCount > 0
					? `, ${item.mentionCount} mentions`
					: item.unread
						? ', unread'
						: '')
			const artwork = (
				<Artwork
					item={item}
					animate={animate}
					size={compactSize ?? ICON_SIZE}
					badged
					compact={!!compactSize}
					selected={!!compactSize && selected}
				/>
			)

			if (compactSize)
				return (
					<Pressable
						{...menu}
						{...press}
						accessibilityRole="button"
						accessibilityLabel={folder ? label : accessibilityLabel}
						accessibilityState={folder ? undefined : { selected }}
						accessibilityHint={
							folder ? undefined : 'Long press for server actions'
						}
						delayLongPress={folder ? undefined : LONG_PRESS_MS}
						style={{ height: compactSize, width: compactSize }}
					>
						{artwork}
					</Pressable>
				)

			const list = layout === 'list'
			const highlighted = selected || merging
			const content = (
				<Fragment>
					{list || previewWidth ? (
						artwork
					) : (
						<View
							style={[
								styles.selectionRing,
								{
									borderColor: highlighted ? brand : 'transparent',
									borderRadius: item.kind ? 20 : 31,
								},
							]}
						>
							{artwork}
						</View>
					)}
					<Text
						ellipsizeMode={list ? undefined : 'tail'}
						numberOfLines={1}
						style={[
							list ? { flex: 1, fontSize: 16 } : styles.gridLabel,
							{
								color: selected ? brand : foreground,
								fontWeight: selected || previewWidth ? '700' : '500',
							},
							previewWidth && !list ? { width: 60 } : undefined,
						]}
					>
						{label}
					</Text>
					{!previewWidth && list && folder ? (
						<Icon name="ChevronSmallRightIcon" color={muted} size={22} />
					) : null}
				</Fragment>
			)

			if (previewWidth)
				return (
					<View
						style={[
							styles.previewFrame,
							list
								? [styles.listPreview, { width: previewWidth }]
								: styles.gridPreview,
						]}
					>
						{content}
					</View>
				)

			return (
				<Pressable
					ref={menu?.ref}
					accessibilityActions={menu?.accessibilityActions}
					onAccessibilityAction={menu?.onAccessibilityAction}
					accessibilityLabel={accessibilityLabel}
					accessibilityRole="button"
					accessibilityState={{ selected }}
					cancelable={!dragging}
					delayLongPress={LONG_PRESS_MS}
					{...press}
					pressRetentionOffset={{
						bottom: 4096,
						left: 4096,
						right: 4096,
						top: 4096,
					}}
					style={[
						list ? styles.listItem : styles.gridItem,
						{ opacity: dragging ? 0.08 : 1 },
						list
							? { backgroundColor: highlighted ? `${brand}24` : 'transparent' }
							: undefined,
					]}
				>
					{content}
				</Pressable>
			)
		}

		function FolderTitle({ folder, style }: t.FolderTitleProps) {
			const styles = useStyles()
			const TEXT_DEFAULT: string = useToken(semanticColors.TEXT_DEFAULT)
			const [editing, setEditing] = useState<'idle' | 'editing' | 'error'>(
				'idle',
			)

			if (editing !== 'idle')
				return (
					<View style={style}>
						<TextInput
							accessibilityLabel="Folder name"
							autoFocus
							selectTextOnFocus
							maxLength={100}
							defaultValue={folder.name ?? ''}
							returnKeyType="done"
							style={styles.folderInput}
							onEndEditing={({ nativeEvent: { text } }) => {
								try {
									if (
										text.trim() !== (folder.name ?? '') &&
										controller.renameFolder(folder.id, text) === false
									)
										throw new Error('Folder is no longer available')
									setEditing('idle')
								} catch {
									setEditing('error')
								}
							}}
						/>
						{editing === 'error' ? (
							<Text style={{ color: TEXT_DEFAULT, fontSize: 12 }}>
								Could not rename folder. Try again.
							</Text>
						) : null}
					</View>
				)

			return (
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={`Rename folder: ${folder.name ?? 'Folder'}`}
					onPress={() => setEditing('editing')}
					style={style}
				>
					<Text numberOfLines={1} style={styles.folderTitle}>
						{folder.name || 'Folder'}
					</Text>
				</Pressable>
			)
		}

		function Tabs<Value extends string>({
			options,
			value,
			onChange,
			filter = false,
		}: t.TabsProps<Value>) {
			const styles = useStyles()
			const background: string = useToken(
				semanticColors.BACKGROUND_SECONDARY_ALT,
			)
			const foreground: string = useToken(semanticColors.TEXT_DEFAULT)
			const muted: string = useToken(semanticColors.TEXT_MUTED)

			return (
				<View
					accessibilityRole="tablist"
					style={filter ? styles.filterTabs : styles.viewTabs}
				>
					{options.map(([id, label, accessibilityLabel = label]) => (
						<Pressable
							key={id}
							accessibilityLabel={accessibilityLabel}
							accessibilityRole="tab"
							accessibilityState={{ selected: value === id }}
							onPress={() => onChange(id)}
							style={[
								filter ? styles.filterTab : styles.viewTab,
								{ backgroundColor: value === id ? background : 'transparent' },
							]}
						>
							<Text
								numberOfLines={filter ? undefined : 1}
								style={{
									color: value === id ? foreground : muted,
									fontSize: filter ? 14 : 13,
									fontWeight: value === id ? '700' : '500',
								}}
							>
								{label}
							</Text>
						</Pressable>
					))}
				</View>
			)
		}

		function useDrawerData() {
			const stored = jsonStorage.use() ?? DefaultSettings
			const layout: t.DrawerLayout = stored.layout === 'list' ? 'list' : 'grid'

			const snapshot: t.ServerDrawerSnapshot = FluxUtils!.useStateFromStores(
				[
					ChannelStore,
					GuildReadStateStore,
					GuildStore,
					PrivateChannelSortStore,
					ReadStateStore,
					SelectedChannelStore,
					SelectedGuildStore,
					SortedGuildStore,
					UserStore,
				],
				() => (signal.aborted ? EMPTY_SNAPSHOT : controller.snapshot()),
			)

			const directMessages = useMemo(
				() => orderedDms(snapshot.directMessages, stored.dmOrder),
				[snapshot.directMessages, stored.dmOrder],
			)

			const directMessageBadge = useMemo(
				() =>
					directMessages.reduce<t.BadgeState>(
						(total, channel) => ({
							mentionCount: total.mentionCount + channel.mentionCount,
							unread: total.unread || channel.unread,
						}),
						{ mentionCount: 0, unread: false },
					),
				[directMessages],
			)

			return {
				...snapshot,
				layout,
				directMessages,
				directMessageBadge,
				pullToMarkRead: stored.pullToMarkRead,
			}
		}

		function useReorder(directMessages: readonly t.DirectMessage[]) {
			const [, refresh] = useReducer(value => value + 1, 0)
			const reorder = useRef<t.ReorderState | undefined>(undefined)
			const mergeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
				undefined,
			)
			const exitTarget = useRef<Native.View | null>(null)

			useEffect(() => () => clearTimeout(mergeTimer.current), [])
			const exitBounds = useRef<Native.LayoutRectangle | undefined>(undefined)

			const measureExit = () => {
				const target = exitTarget.current
				exitBounds.current = undefined
				target?.measureInWindow((x, y, width, height) => {
					if (exitTarget.current === target)
						exitBounds.current = { x, y, width, height }
				})
			}

			const begin = (
				source: t.DrawerItem,
				point: t.DragPoint,
				items: readonly t.DrawerItem[],
				geometry: t.ReorderGeometry,
				openMenu?: () => void,
			) => {
				const from = items.indexOf(source)
				if (from < 0) return
				measureExit()
				clearTimeout(mergeTimer.current)
				reorder.current = {
					...geometry,
					source,
					items,
					from,
					target: from,
					start: point,
					point,
					openMenu,
				}
				refresh()
			}

			const move = ({ x, y }: t.DragPoint) => {
				const active = reorder.current
				if (!active) return

				const {
					source,
					from,
					columns,
					columnStep,
					rowStep,
					target: previousTarget,
					mergeSince,
					outside,
				} = active
				const dx = x - active.start.x,
					dy = y - active.start.y
				const grid = active.layout === 'grid'

				active.point = { x, y }
				active.moved ||= Math.hypot(dx, dy) > 10

				active.outside =
					source.kind === 'guild' &&
					!!source.folderId &&
					!!exitTarget.current &&
					hitsDropTarget(active.point, exitBounds.current)
				active.target = active.outside
					? from
					: clamp(
							from +
								Math.round(dy / rowStep) * columns +
								(grid ? Math.round(dx / columnStep) : 0),
							0,
							active.items.length - 1,
						)

				const target = active.items[active.target]
				const row =
					Math.floor(active.target / columns) - Math.floor(from / columns)
				const column = (active.target % columns) - (from % columns)
				const centered =
					Math.abs(dy - row * rowStep) < (grid ? 22 : 20) &&
					(!grid || Math.abs(dx - column * columnStep) < 22)
				const merge =
					source.kind === 'guild' &&
					target.kind &&
					from !== active.target &&
					centered &&
					(target.kind === 'folder'
						? source.folderId !== target.id
						: !source.folderId || source.folderId !== target.folderId)
				active.mergeSince = merge
					? previousTarget === active.target
						? (mergeSince ?? Date.now())
						: Date.now()
					: undefined
				if (mergeSince !== active.mergeSince) {
					clearTimeout(mergeTimer.current)
					active.mergeReady = false
					if (active.mergeSince !== undefined)
						mergeTimer.current = setTimeout(() => {
							if (reorder.current !== active) return
							active.mergeReady = true
							refresh()
						}, 450)
				}

				if (
					outside !== active.outside ||
					!!mergeSince !== !!active.mergeSince ||
					previousTarget !== active.target
				)
					refresh()
			}

			const cancel = () => {
				if (!reorder.current) return
				clearTimeout(mergeTimer.current)
				reorder.current = undefined
				controller.animateNext(110)
				refresh()
			}

			const finish = (showMenu = false) => {
				const active = reorder.current
				if (!active) return
				cancel()

				const { source, items, target, from, outside, moved, mergeSince } =
					active
				if (showMenu && !moved) return active.openMenu?.()

				try {
					if (!source.kind) {
						const dmOrder = directMessages.map(item => item.id)
						const sourceIndex = dmOrder.indexOf(source.id),
							targetIndex = dmOrder.indexOf(items[target].id)
						if (from === target || sourceIndex < 0 || targetIndex < 0) return
						dmOrder.splice(targetIndex, 0, ...dmOrder.splice(sourceIndex, 1))
						jsonStorage.set({ dmOrder })
					} else {
						const merge =
							mergeSince !== undefined && Date.now() - mergeSince >= 450
						const exit = outside && source.kind === 'guild' && source.folderId
						if (!exit && from === target) return
						if (
							controller.commitDrop(
								source.id,
								exit || items[target].id,
								exit ? 'exit' : merge ? 'merge' : 'move',
							) === false
						)
							throw new Error('Drop target is no longer available')
					}
				} catch (error) {
					reportActionFailure('move this item', error)
				}
			}

			const offset = (id: string): t.DragPoint | undefined => {
				const active = reorder.current
				if (!active || active.outside || active.mergeReady) return
				const index = active.items.findIndex(item => item.id === id)
				const { from, target, columns, columnStep, rowStep } = active
				if (index < 0 || index === from) return
				const slot =
					from < target && index > from && index <= target
						? index - 1
						: target < from && index >= target && index < from
							? index + 1
							: index

				return {
					x: ((slot % columns) - (index % columns)) * columnStep,
					y:
						(Math.floor(slot / columns) - Math.floor(index / columns)) *
						rowStep,
				}
			}

			return {
				reorder,
				exitTarget,
				measureExit,
				begin,
				finish,
				offset,
				handlers: {
					onMove: move,
					onCancel: cancel,
					onDrop: (point: t.DragPoint) => {
						move(point)
						finish(true)
					},
				},
			}
		}

		function FolderOverlay({
			folder,
			width,
			height,
			closeFolder,
			renderItem,
			gesture,
			closing,
			backdropStyle,
			panelStyle,
		}: t.FolderOverlayProps) {
			const styles = useStyles()
			const TEXT_DEFAULT: string = useToken(semanticColors.TEXT_DEFAULT)
			const TEXT_MUTED: string = useToken(semanticColors.TEXT_MUTED)
			const [folderPage, setFolderPage] = useState(0)
			const folderPager = useRef<Native.ScrollView | null>(null)

			const folderHeight = clamp(height - 64, 240, 360)
			const pageSize = 3 * Math.max(1, Math.floor((folderHeight - 78) / 90))
			const pages = Array.from(
				{ length: Math.ceil(folder.children.length / pageSize) },
				(_, index) =>
					folder.children.slice(index * pageSize, (index + 1) * pageSize),
			)
			const folderSize = clamp(width - 32, 240, 320)

			return (
				<GestureDetector gesture={gesture}>
					<AnimatedPressable
						accessibilityLabel="Close server folder"
						accessibilityRole="button"
						collapsable={false}
						pointerEvents={closing ? 'none' : 'auto'}
						onAccessibilityEscape={closeFolder}
						onPress={closeFolder}
						style={[
							styles.folderBackdrop,
							backdropStyle,
							{ backgroundColor: 'rgba(0, 0, 0, 0.82)' },
						]}
					>
						<AnimatedPressable
							accessibilityLabel={folder.name ?? 'Unnamed folder'}
							onPress={event => event.stopPropagation()}
							accessibilityRole="summary"
							style={[
								styles.folderPanel,
								FLOATING_FOLDER_STYLE,
								panelStyle,
								{ height: folderHeight, width: folderSize },
							]}
						>
							<ScrollView
								horizontal
								pagingEnabled
								ref={folderPager}
								showsHorizontalScrollIndicator={false}
								style={{ height: folderHeight, width: folderSize }}
								onMomentumScrollEnd={(
									event: Native.NativeSyntheticEvent<Native.NativeScrollEvent>,
								) =>
									setFolderPage(
										clamp(
											Math.round(
												event.nativeEvent.contentOffset.x / folderSize,
											),
											0,
											Math.max(0, pages.length - 1),
										),
									)
								}
							>
								{pages.map((page, pageIndex) => (
									<View
										key={`folder-page-${pageIndex}`}
										style={[
											styles.folderPage,
											{ height: folderHeight, width: folderSize },
										]}
									>
										{page.map(renderItem)}
									</View>
								))}
							</ScrollView>
							<FolderTitle
								key={folder.id}
								folder={folder}
								style={styles.folderHeading}
							/>
							{pages.length > 1 ? (
								<View pointerEvents="box-none" style={styles.pageDots}>
									{pages.map((_page, index) => (
										<Pressable
											key={`folder-dot-${index}`}
											accessibilityRole="button"
											accessibilityLabel={`Folder page ${index + 1}`}
											accessibilityState={{ selected: index === folderPage }}
											onPress={() => {
												setFolderPage(index)
												folderPager.current?.scrollTo({
													animated: true,
													x: index * folderSize,
													y: 0,
												})
											}}
											style={[
												styles.pageDot,
												{
													backgroundColor:
														index === folderPage ? TEXT_DEFAULT : TEXT_MUTED,
												},
											]}
										/>
									))}
								</View>
							) : null}
						</AnimatedPressable>
					</AnimatedPressable>
				</GestureDetector>
			)
		}

		return function ServerDrawerSurface({
			bottomInset,
			onWidthChange,
		}: t.ServerDrawerSurfaceProps) {
			const styles = useStyles()
			const TEXT_MUTED: string = useToken(semanticColors.TEXT_MUTED)
			const TEXT_DEFAULT: string = useToken(semanticColors.TEXT_DEFAULT)
			const TEXT_BRAND: string = useToken(semanticColors.TEXT_BRAND)
			const [ui, setUiState] = useState<t.DrawerState>({
				expanded: false,
				view: 'servers',
				filter: 'all',
				query: '',
			})
			const setUi = (next: Partial<t.DrawerState>) =>
				setUiState(previous => ({ ...previous, ...next }))
			const { expanded, view, filter, query, folderId, folderOverlayId } = ui
			const closeFolder = () => setUi({ folderOverlayId: undefined })
			const changeFolder = (folderId?: string) =>
				startTransition(() =>
					setUi({
						folderId,
						...(folderId ? { retainedFolderId: folderId } : {}),
					}),
				)

			const [{ height: viewportHeight, width: viewportWidth }, setViewport] =
				useState<Pick<Native.LayoutRectangle, 'width' | 'height'>>(() =>
					Native.Dimensions.get('window'),
				)

			const [listAtTop, setListAtTop] = useState(true)
			const data = useDrawerData()
			const [foreground, setForeground] = useState(
				Native.AppState.currentState === 'active',
			)

			useEffect(() => {
				const subscription = Native.AppState.addEventListener('change', state =>
					setForeground(state === 'active'),
				)

				return () => subscription.remove()
			}, [])

			const {
				dockSpecs,
				drawerHeight,
				panelLeft,
				grid,
				columns,
				columnStep,
				previewWidth,
				columnOffset,
			} = getDrawerGeometry(
				viewportWidth,
				viewportHeight - bottomInset - useSafeAreaInsets().top,
				data.layout,
			)

			const folderMotion = useFolderOverlayMotion(folderOverlayId)
			const folderPageStyle = useFolderPageMotion(folderId)
			const drawerFolder = data.nodes.find(
				(node): node is t.DrawerFolder =>
					node.kind === 'folder' && node.id === folderId,
			)
			const retainedFolder = data.nodes.find(
				(node): node is t.DrawerFolder =>
					node.kind === 'folder' && node.id === ui.retainedFolderId,
			)
			const overlayFolder = data.nodes.find(
				(node): node is t.DrawerFolder =>
					node.kind === 'folder' && node.id === folderMotion.folderId,
			)
			const visible = filteredItems(
				view === 'servers'
					? (drawerFolder?.children ?? data.nodes)
					: data.directMessages,
				filter,
				query,
			)
			const drag = useReorder(data.directMessages)
			const preview = usePreview(previewWidth, grid)
			const active = drag.reorder.current
			const markAllRead = () => {
				if (
					signal.aborted ||
					!(jsonStorage.cache ?? DefaultSettings).pullToMarkRead
				)
					return
				try {
					controller.markAllRead()
				} catch (error) {
					reportActionFailure('mark all as read', error)
				}
			}
			const resize = useDrawerMotion(
				expanded,
				dockSpecs.dockHeight - DOCK_REST_OFFSET,
				drawerHeight,
				listAtTop,
				!!active,
				setDrawerOpen,
				data.pullToMarkRead && !folderOverlayId ? markAllRead : undefined,
			)

			useEffect(() => {
				if (folderId && !drawerFolder) setUi({ folderId: undefined })
				if (folderOverlayId && !overlayFolder)
					setUi({ folderOverlayId: undefined })
			}, [drawerFolder, folderId, folderOverlayId, overlayFolder])

			useEffect(() => {
				setListAtTop(true)
			}, [filter, folderId, data.layout, query])

			// Discord owns focus, current-callback tracking and subscription cleanup.
			useNavigatorBackPressHandler(() => {
				if (signal.aborted || (!expanded && !folderId && !folderOverlayId))
					return false
				if (folderOverlayId) closeFolder()
				else if (folderId) changeFolder()
				else setDrawerOpen(false, false)

				return true
			})

			function setDrawerOpen(open: boolean, reset = true) {
				setUi({
					expanded: open,
					...(!open && reset ? { folderId: undefined, query: '' } : {}),
				})
				if (!open && reset) setListAtTop(true)
			}

			const open = (
				operation: string,
				action: () => void | boolean,
				close = true,
			) => {
				try {
					if (action() !== false && close) setDrawerOpen(false)
				} catch (error) {
					reportActionFailure(operation, error)
				}
			}

			const selectItem = (item: t.DrawerGuild | t.DirectMessage) => {
				if (item.kind) closeFolder()
				open(
					'open this item',
					() =>
						item.kind
							? controller.selectGuild(item.id)
							: controller.selectPrivateChannel(item.id),
					expanded,
				)
			}

			function changeView(next: t.DrawerView, open = false): void {
				if (view === next && !open) return
				drag.finish()
				setUi({
					folderId: undefined,
					folderOverlayId: undefined,
					query: '',
					view: next,
					...(open ? { filter: 'all' } : {}),
				})
				if (open) setDrawerOpen(true)
			}

			const renderCell = ({
				item,
				inFolder,
				compactSize,
				items,
				animate,
			}: t.DrawerCellProps) => {
				const render = (menu?: t.NativeMenuAnchor) => {
					const content = (
						<Item
							item={item}
							menu={menu}
							animate={animate}
							compactSize={compactSize}
							layout={inFolder ? 'grid' : data.layout}
							dragging={active?.source.id === item.id}
							merging={
								!inFolder &&
								active?.mergeReady === true &&
								active.items[active.target].id === item.id
							}
							selectedId={
								item.kind ? data.selectedGuildId : data.selectedPrivateChannelId
							}
							onPress={() => {
								if (item.kind !== 'folder') return selectItem(item)
								if (compactSize) setUi({ folderOverlayId: item.id })
								else changeFolder(item.id)
							}}
						/>
					)

					return compactSize ? (
						content
					) : (
						<DragTarget
							preview={preview}
							offset={drag.offset(item.id)}
							{...drag.handlers}
							onStart={point =>
								drag.begin(
									item,
									point,
									inFolder ? overlayFolder!.children : items,
									{
										columns: inFolder ? 3 : columns,
										columnStep: inFolder ? ITEM_WIDTH + 8 : columnStep,
										layout: inFolder ? 'grid' : data.layout,
										rowStep: inFolder ? 90 : grid ? 82 + ITEM_GAP : 72,
									},
									menu?.onLongPress,
								)
							}
						>
							{content}
						</DragTarget>
					)
				}

				const Menu = item.kind === 'folder' ? FolderMenu : GuildMenu
				const key = compactSize || inFolder ? item.id : undefined
				return item.kind ? (
					<Menu key={key} guild={item}>
						{render}
					</Menu>
				) : (
					<Fragment key={key}>{render()}</Fragment>
				)
			}

			const cellRenderer = useRef(renderCell)
			cellRenderer.current = renderCell
			const renderItem = (
				item: t.DrawerItem,
				inFolder = false,
				compactSize?: number,
				page: t.DrawerView = view,
				items = visible,
				visiblePage = true,
			) => {
				const offset = drag.offset(item.id)
				const animated =
					item.kind !== 'folder' &&
					!!item.animatedAvatarUri &&
					item.animatedAvatarUri !== item.avatarUri

				return (
					<DrawerCell
						key={compactSize || inFolder ? item.id : undefined}
						render={cellRenderer}
						item={item}
						inFolder={inFolder}
						compactSize={compactSize}
						page={page}
						items={items}
						animate={
							animated &&
							visiblePage &&
							!compactSize &&
							((expanded && page === view) || !!folderOverlayId) &&
							foreground
						}
						expanded={expanded}
						layout={data.layout}
						width={viewportWidth}
						selected={
							item.id ===
							(item.kind ? data.selectedGuildId : data.selectedPrivateChannelId)
						}
						dragging={active?.source.id === item.id}
						merging={
							!inFolder &&
							active?.mergeReady === true &&
							active.items[active.target].id === item.id
						}
						offsetX={offset?.x}
						offsetY={offset?.y}
					/>
				)
			}

			const pageWidth = dockSpecs.dockWidth
			const pages = usePageMotion(
				view,
				pageWidth,
				expanded && !active && !folderOverlayId,
				changeView,
			)

			const renderPage = (page: t.DrawerView) => {
				const servers = page === 'servers'
				const viewLabel = servers ? 'servers' : 'direct messages'
				const folders =
					servers && retainedFolder ? [undefined, retainedFolder] : [undefined]

				return (
					<AnimatedView
						key={page}
						style={{ width: pageWidth, height: '100%' }}
						accessibilityElementsHidden={page !== view}
						importantForAccessibility={
							page === view ? 'auto' : 'no-hide-descendants'
						}
					>
						<View style={styles.searchRow}>
							<TextInput
								accessibilityLabel={`Search ${viewLabel}`}
								placeholder={`Search ${viewLabel}`}
								placeholderTextColor={TEXT_MUTED}
								value={query}
								onChangeText={value => setUi({ query: value })}
								returnKeyType="search"
								style={styles.searchInput}
							/>
							<Tabs<'all' | 'unread'>
								filter
								value={filter}
								onChange={value => setUi({ filter: value })}
								options={[
									['all', 'All', `All ${viewLabel}`],
									['unread', 'Unreads', `Unread ${viewLabel}`],
								]}
							/>
						</View>
						<View style={{ flex: 1 }}>
							{folders.map(folder => {
								const hidden = folder
									? folder.id !== folderId
									: servers && !!drawerFolder
								const items = filteredItems(
									servers
										? (folder?.children ?? data.nodes)
										: data.directMessages,
									filter,
									page === view ? query : '',
								)

								const motion = servers
									? folderPageStyle[folder ? 'folderStyle' : 'rootStyle']
									: undefined

								return (
									<AnimatedView
										key={folder?.id ?? 'root'}
										pointerEvents={hidden ? 'none' : 'auto'}
										accessibilityElementsHidden={hidden}
										importantForAccessibility={
											hidden ? 'no-hide-descendants' : 'auto'
										}
										style={[Native.StyleSheet.absoluteFill, motion]}
									>
										<FlashList
											data={items}
											numColumns={columns}
											ListEmptyComponent={
												<View style={styles.emptyContainer}>
													<Text style={styles.emptyText}>
														{query.trim()
															? `No ${viewLabel} match your search`
															: filter === 'unread'
																? "You're all caught up"
																: `No ${viewLabel} to show`}
													</Text>
												</View>
											}
											contentContainerStyle={{
												paddingBottom: 40,
												paddingHorizontal: grid ? SIDE_PADDING : 10,
												paddingTop: grid ? 14 : 10,
											}}
											key={`${page}-${data.layout}-${columns}`}
											maintainVisibleContentPosition={{ disabled: true }}
											getItemType={(item: t.DrawerItem) => item.kind ?? 'dm'}
											keyExtractor={(item: t.DrawerItem) =>
												`${page}:${item.id}`
											}
											onScroll={({
												nativeEvent: { contentOffset },
											}: Native.NativeSyntheticEvent<Native.NativeScrollEvent>) => {
												if (hidden || page !== view) return
												const atTop = contentOffset.y <= 0
												setListAtTop(previous =>
													previous === atTop ? previous : atTop,
												)
											}}
											renderItem={({
												item,
												index,
											}: Pick<
												Native.ListRenderItemInfo<t.DrawerItem>,
												'item' | 'index'
											>) => (
												<View
													style={{
														marginLeft: (index % columns) * columnOffset,
														width: grid ? ITEM_WIDTH : '100%',
														paddingBottom:
															Math.floor(index / columns) <
															Math.floor((items.length - 1) / columns)
																? grid
																	? ITEM_GAP
																	: 4
																: 0,
													}}
												>
													{renderItem(
														item,
														false,
														undefined,
														page,
														items,
														!hidden,
													)}
												</View>
											)}
											scrollEventThrottle={16}
											scrollEnabled={!active}
											showsVerticalScrollIndicator={false}
											style={{ flex: 1 }}
										/>
									</AnimatedView>
								)
							})}
						</View>
					</AnimatedView>
				)
			}

			return signal.aborted ? null : (
				<View
					onLayout={({ nativeEvent: { layout } }: Native.LayoutChangeEvent) => {
						if (layout.width > 0 && layout.height > 0) setViewport(layout)
						if (layout.width > 0) onWidthChange(layout.width)
					}}
					pointerEvents="box-none"
					style={styles.drawerBackdrop}
				>
					{overlayFolder && (
						<FolderOverlay
							key={overlayFolder.id}
							folder={overlayFolder}
							width={viewportWidth}
							height={viewportHeight - bottomInset}
							closeFolder={closeFolder}
							renderItem={guild => renderItem(guild, true)}
							gesture={resize.overlayGesture}
							closing={!folderOverlayId}
							backdropStyle={folderMotion.backdropStyle}
							panelStyle={folderMotion.panelStyle}
						/>
					)}
					<View
						pointerEvents="box-none"
						style={{
							position: 'absolute',
							overflow: 'hidden',
							bottom: bottomInset - YOU_BAR_JOIN_DEPTH,
							height: viewportHeight - bottomInset + YOU_BAR_JOIN_DEPTH,
							left: panelLeft,
							width: dockSpecs.dockWidth,
						}}
					>
						<GestureDetector gesture={resize.gesture}>
							<AnimatedView
								collapsable={false}
								accessibilityLabel={
									expanded
										? view === 'servers'
											? 'All servers drawer'
											: 'Direct messages drawer'
										: 'Server dock'
								}
								accessibilityViewIsModal={expanded}
								importantForAccessibility={expanded ? 'yes' : 'auto'}
								style={[
									styles.drawerPanel,
									FLOATING_PANEL_STYLE,
									{
										bottom: 0,
										height: drawerHeight + YOU_BAR_JOIN_DEPTH,
										width: dockSpecs.dockWidth,
									},
									resize.panelStyle,
								]}
							>
								<View style={{ height: drawerHeight, overflow: 'hidden' }}>
									<Pressable
										accessibilityRole="button"
										accessibilityState={{ expanded: expanded }}
										accessibilityActions={[
											{
												label: expanded ? 'Collapse' : 'Expand',
												name: 'activate',
											},
										]}
										accessibilityLabel={
											expanded
												? 'Collapse server drawer'
												: 'Expand server drawer'
										}
										hitSlop={{ bottom: 14, left: 14, right: 14, top: 14 }}
										onAccessibilityAction={() => setDrawerOpen(!expanded)}
										onPress={() => setDrawerOpen(!expanded)}
										style={styles.handle}
									>
										<View style={styles.handleBar} />
									</Pressable>
									<AnimatedView
										pointerEvents={expanded ? 'none' : 'auto'}
										accessibilityElementsHidden={expanded}
										importantForAccessibility={
											expanded ? 'no-hide-descendants' : 'auto'
										}
										style={[styles.compactFace, resize.compactStyle]}
									>
										<View
											style={[styles.dockRow, { height: dockSpecs.itemSize }]}
										>
											{Array.from(
												{ length: dockSpecs.itemCountNoExtras },
												(_, index) => {
													const node = data.nodes[index]
													if (
														!node ||
														(node.kind === 'folder' && !node.children.length)
													)
														return (
															<View
																key={`spacer-${index}`}
																accessibilityElementsHidden
																importantForAccessibility="no-hide-descendants"
																style={{
																	height: dockSpecs.itemSize,
																	opacity: 0,
																	width: dockSpecs.itemSize,
																}}
															/>
														)

													return renderItem(node, false, dockSpecs.itemSize)
												},
											)}
											<View
												style={[
													styles.dockDivider,
													{ height: Math.round(dockSpecs.itemSize * 0.7) },
												]}
											/>
											<Pressable
												accessibilityRole="button"
												onPress={() => changeView('dms', true)}
												accessibilityLabel={`Direct Messages${
													data.directMessageBadge.mentionCount > 0
														? `, ${data.directMessageBadge.mentionCount} mentions`
														: data.directMessageBadge.unread
															? ', unread'
															: ''
												}`}
												style={[
													styles.dmButton,
													{
														height: dockSpecs.itemSize,
														width: dockSpecs.itemSize,
													},
												]}
											>
												<Icon name="ChatIcon" color={TEXT_DEFAULT} />
												<Badge state={data.directMessageBadge} compact />
											</Pressable>
											<Icon
												label="View all servers"
												onPress={() => setDrawerOpen(true)}
												name="GridSquareIcon"
												color={TEXT_DEFAULT}
												buttonSize={dockSpecs.itemSize}
												size={
													Math.max(
														10,
														Math.floor((dockSpecs.itemSize * 0.8 - 5) / 2),
													) *
														2 +
													5
												}
											/>
										</View>
									</AnimatedView>
									{/* Keep the static list ready so opening does not mount it during the gesture. */}
									<AnimatedView
										pointerEvents={expanded ? 'auto' : 'none'}
										accessibilityElementsHidden={!expanded}
										importantForAccessibility={
											expanded ? 'auto' : 'no-hide-descendants'
										}
										style={[styles.expandedFace, resize.expandedStyle]}
									>
										<View style={{ height: drawerHeight - 16 }}>
											<View style={styles.header}>
												{drawerFolder ? (
													<Fragment>
														<Icon
															label="Back to all servers"
															onPress={() => changeFolder()}
															name="ArrowSmallLeftIcon"
															color={TEXT_DEFAULT}
															size={30}
														/>
														<FolderTitle
															key={drawerFolder.id}
															folder={drawerFolder}
															style={{ flex: 1, paddingVertical: 8 }}
														/>
													</Fragment>
												) : (
													<Tabs
														options={[
															['servers', 'Servers'],
															['dms', 'Direct Messages'],
														]}
														value={view}
														onChange={changeView}
													/>
												)}
												<Icon
													label={`Switch to ${grid ? 'list' : 'grid'} view`}
													onPress={() =>
														jsonStorage.set({ layout: grid ? 'list' : 'grid' })
													}
													name={grid ? 'ListViewIcon' : 'GridSquareIcon'}
													color={TEXT_MUTED}
												/>
												<Icon
													label={
														view === 'servers'
															? 'Create a server'
															: 'Start a direct message'
													}
													onPress={() =>
														open(
															'open creation',
															view === 'servers'
																? controller.openCreateGuild
																: controller.openCreateDm,
														)
													}
													name="PlusLargeIcon"
													color={TEXT_MUTED}
												/>
											</View>
											<GestureDetector gesture={pages.gesture}>
												<View
													collapsable={false}
													style={{ flex: 1, overflow: 'hidden' }}
												>
													<AnimatedView
														style={[
															{
																width: pageWidth * 2,
																height: '100%',
																flexDirection: 'row',
															},
															pages.style,
														]}
													>
														{renderPage('servers')}
														{renderPage('dms')}
													</AnimatedView>
												</View>
											</GestureDetector>
										</View>
									</AnimatedView>
								</View>
							</AnimatedView>
						</GestureDetector>
					</View>
					{active ? (
						<AnimatedView
							accessibilityLabel={`Dragging ${active.source.name ?? 'Folder'}`}
							accessibilityRole="summary"
							pointerEvents="none"
							style={[
								styles.dragPreview,
								{ left: grid ? 0 : panelLeft + 10, width: previewWidth },
								preview.style,
							]}
						>
							<Item
								item={active.source}
								layout={data.layout}
								previewWidth={previewWidth}
								animate={expanded && foreground}
							/>
						</AnimatedView>
					) : null}
					{active?.source.kind === 'guild' &&
						active.source.folderId &&
						(drawerFolder || overlayFolder) && (
							<View
								ref={drag.exitTarget}
								collapsable={false}
								onLayout={drag.measureExit}
								pointerEvents="none"
								accessible
								accessibilityRole="image"
								accessibilityLabel="Move server out of folder"
								accessibilityHint="Drag a server onto this arrow and release to make it standalone"
								style={[
									styles.exitTarget,
									{ left: viewportWidth / 2 - 28, bottom: bottomInset + 24 },
								]}
							>
								<View
									style={{
										height: 42,
										justifyContent: 'center',
										transform: [{ scale: active?.outside ? 1.15 : 1 }],
									}}
								>
									<Icon
										name="UndoIcon"
										color={active?.outside ? TEXT_BRAND : TEXT_DEFAULT}
										size={36}
									/>
								</View>
							</View>
						)}
				</View>
			)
		}
	}

	function hitsDropTarget(
		point: t.DragPoint,
		bounds: Native.LayoutRectangle | undefined,
	): boolean {
		if (
			!bounds ||
			![
				point.x,
				point.y,
				bounds.x,
				bounds.y,
				bounds.width,
				bounds.height,
			].every(Number.isFinite) ||
			bounds.width <= 0 ||
			bounds.height <= 0
		)
			return false

		return (
			point.x >= bounds.x - 8 &&
			point.x <= bounds.x + bounds.width + 8 &&
			point.y >= bounds.y - 8 &&
			point.y <= bounds.y + bounds.height + 8
		)
	}

	return createServerDrawerSurface(createController(), signal, jsonStorage)
}
