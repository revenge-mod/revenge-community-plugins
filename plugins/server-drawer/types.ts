import type {
	ComponentProps,
	ComponentType,
	ReactElement,
	ReactNode,
} from 'react'
import type {
	Animated,
	LayoutRectangle,
	StyleProp,
	ViewProps,
	ViewStyle,
} from 'react-native'
import type { NativeContextMenu } from './native'

export interface BadgeState {
	readonly mentionCount: number
	readonly unread: boolean
}

export interface DrawerGuild extends BadgeState {
	readonly kind: 'guild'
	readonly id: string
	readonly name: string
	readonly avatarUri?: string
	readonly animatedAvatarUri?: string
	readonly folderId?: string
}

export interface DrawerFolder extends BadgeState {
	readonly kind: 'folder'
	readonly id: string
	readonly name: string | undefined
	readonly color: number | undefined
	readonly children: readonly DrawerGuild[]
}

export type DrawerNode = DrawerGuild | DrawerFolder

export type DrawerLayout = 'grid' | 'list'

export type DrawerView = 'dms' | 'servers'

export interface ServerDrawerPreferences {
	readonly dmOrder: readonly string[]
	readonly layout: DrawerLayout
	readonly pullToMarkRead: boolean
}

export interface DirectMessage extends BadgeState {
	readonly kind?: undefined
	readonly id: string
	readonly name: string
	readonly avatarUri?: string
	readonly animatedAvatarUri?: string
}

export interface ServerDrawerSnapshot {
	readonly nodes: readonly DrawerNode[]
	readonly directMessages: readonly DirectMessage[]
	readonly selectedGuildId?: string
	readonly selectedPrivateChannelId?: string
}

export type DragPoint = Readonly<Pick<LayoutRectangle, 'x' | 'y'>>

export type DrawerItem = DrawerNode | DirectMessage

export interface ReorderState extends ReorderGeometry {
	source: DrawerItem
	items: readonly DrawerItem[]
	from: number
	target: number
	start: DragPoint
	point: DragPoint
	mergeSince?: number
	mergeReady?: boolean
	moved?: boolean
	outside?: boolean
	openMenu?: () => void
}

export interface NativeGestureModule {
	Gesture: { Pan(): NativePanGesture }
	GestureDetector: ComponentType<{
		children: ReactNode
		gesture: NativePanGesture
	}>
}

export interface NativePanGesture {
	activateAfterLongPress(duration: number): this
	shouldCancelWhenOutside(cancel: boolean): this
	runOnJS(enabled: boolean): this
	activeOffsetX(offset: readonly [number, number]): this
	activeOffsetY(offset: number | readonly [number, number]): this
	enabled(enabled: boolean): this
	failOffsetX(offset: readonly [number, number]): this
	failOffsetY(offset: number | readonly [number, number]): this
	onStart(callback: (event: NativePanEvent) => void): this
	onUpdate(callback: (event: NativePanEvent) => void): this
	onEnd(callback: (event: NativePanEvent, success: boolean) => void): this
	onFinalize(callback: (event: NativePanEvent, success: boolean) => void): this
}

export interface NativeGuildFolder {
	folderId?: string | number
	folderName?: string
	folderColor?: number
	guildIds: string[]
}

export interface NativeUser {
	avatar?: string
	globalName?: string
	username: string
	getAvatarURL(guildId: undefined, size: number, animated: boolean): string
}

export interface ReadStore {
	getMentionCount(id: string): number
	hasUnread(id: string): boolean
}

export type MarkGuildsAsRead = (guildIds: string[], source: string) => void

export interface ReadActions {
	bulkAck(
		channels: {
			channelId: string
			readStateType: number
			messageId: string | undefined
		}[],
	): void
}

export type PanelElement = ReactElement<Record<string, unknown>>

export type PanelComponent = (props: PanelElement['props']) => NativePanel

export interface ServerDrawerSurfaceProps {
	bottomInset: number
	onWidthChange(width: number): void
}

export interface MenuItem {
	action(): unknown
	label: string
}

export type NativeMenuAnchor = Parameters<
	ComponentProps<NativeContextMenu>['children']
>[0]

export interface GuildMenuProps {
	guild: DrawerNode
	children(props: NativeMenuAnchor): ReactNode
}

export interface DragTargetProps {
	readonly children: ReactNode
	readonly offset?: DragPoint
	readonly preview: Record<'x' | 'y' | 'scale', Animated.Value>
	onCancel(): void
	onDrop(point: DragPoint): void
	onMove(point: DragPoint): void
	onStart(point: DragPoint): void
}

export interface TabsProps<Value extends string> {
	options: readonly (readonly [Value, string, string?])[]
	value: Value
	filter?: boolean
	onChange(value: Value): void
}

export interface ItemProps {
	readonly item: DrawerItem
	readonly layout?: DrawerLayout
	readonly selectedId?: string
	readonly dragging?: boolean
	readonly merging?: boolean
	readonly onPress?: () => void
	readonly menu?: NativeMenuAnchor
	readonly compactSize?: number
	readonly previewWidth?: number
	readonly animate?: boolean
}

export interface ArtworkProps {
	item: DrawerItem
	size: number
	badged?: boolean
	compact?: boolean
	selected?: boolean
	animate?: boolean
}

export interface BadgeProps {
	state: BadgeState
	compact?: boolean
}

export interface FolderTitleProps {
	folder: DrawerFolder
	style: StyleProp<ViewStyle>
}

export interface ElementProps {
	element: PanelElement
}

export interface IconProps {
	name: string
	color: string
	size?: number
	label?: string
	onPress?(): void
	buttonSize?: number
}

export interface ReorderGeometry {
	columns: number
	columnStep: number
	layout: DrawerLayout
	rowStep: number
}

export interface DrawerState {
	expanded: boolean
	view: DrawerView
	filter: 'all' | 'unread'
	query: string
	folderId?: string
	retainedFolderId?: string
	folderOverlayId?: string
}

export interface NativePanEvent {
	absoluteX: number
	absoluteY: number
	translationX: number
	velocityX: number
	translationY: number
	velocityY: number
}

export type NativePanel = ReactElement<{
	children: [ReactNode, ReactElement<ViewProps>, ReactNode?]
}>

export interface FolderOverlayProps {
	folder: DrawerFolder
	width: number
	height: number
	closeFolder(): void
	renderItem(guild: DrawerGuild): ReactNode
	gesture: NativePanGesture
	closing: boolean
	backdropStyle: Animated.WithAnimatedObject<ViewStyle>
	panelStyle: Animated.WithAnimatedObject<ViewStyle>
}

export interface MotionSpring {
	mass: number
	stiffness: number
	damping: number
}

export interface DrawerAccessibilityStore {
	readonly useReducedMotion: boolean
}

export type PanelTiming = Omit<
	Animated.TimingAnimationConfig,
	'toValue' | 'useNativeDriver' | 'easing'
> & {
	easing?:
		| ((value: number) => number)
		| { factory(): (value: number) => number }
}

export type PanelAnimation =
	| PanelTiming
	| Omit<Animated.SpringAnimationConfig, 'toValue' | 'useNativeDriver'>

export interface PanelAnimations {
	swipeSidePanelOpen: PanelAnimation
	swipeSidePanelClose: PanelAnimation
	nonSwipeSidePanelOpen: PanelAnimation
	nonSwipeSidePanelClose: PanelAnimation
	touchSlopForPanGesture: number
	minFlingVelocityX: number
}

export interface DiscordPanelsConfig {
	DEFAULT_PANELS_ANIMATION_CONFIG: PanelAnimations
	ANDROID_PANELS_ANIMATION_CONFIG: PanelAnimations
	isTimingConfig(config: PanelAnimation): config is PanelTiming
}

export interface DrawerCellProps {
	item: DrawerItem
	inFolder: boolean
	compactSize?: number
	page: DrawerView
	items: readonly DrawerItem[]
	animate: boolean
	expanded: boolean
	layout: DrawerLayout
	width: number
	selected: boolean
	dragging: boolean
	merging: boolean
	offsetX?: number
	offsetY?: number
	render: import('react').RefObject<(props: DrawerCellProps) => ReactNode>
}
