import type {
	ComponentType,
	MemoExoticComponent,
	ReactElement,
	ReactNode,
} from 'react'
import type { Replica } from './sync/replica'

export interface Gif {
	syncId?: string
	tags?: string[]
	id?: string
	title?: string
	url: string
	src: string
	width: number
	height: number
	format: number
}

export interface MediaSource {
	uri?: string
	sourceURI?: string
	embedURI?: string
	videoURI?: string
	isGIFV?: boolean
	width?: number
	height?: number
	contentType?: string
	thumbnail?: { uri?: string }
}

export interface Collection {
	id: string
	name: string
	gifs: Gif[]
}

export interface CollectionStorage {
	onlyShowCollections: boolean
	accounts: Record<string, Collection[]>
	cloud: Record<string, CloudState>
}

export interface CloudState {
	enabled: boolean
	server: string
	replica: Replica
	sessionId?: string
	lastSuccess?: number
	status?: string
}

export interface TreeProps {
	children?: ReactNode
}

export interface HeaderProps {
	collectionTitle?: string
	categoryType: string
	columnWidth: number
	onQueryClear: () => void
	onFavoritesQueryChange: (query: string) => void
}

export interface ResultsProps {
	columns: number
	columnWidth: number
	resultItems: Gif[]
	loading: boolean
	inActionSheet: boolean
	onPressGIF: (gif: Gif, index: number) => void
	selectedGifSrc?: string
	keyboardDismissMode?: 'none' | 'on-drag' | 'interactive'
}

export interface PickerProps {
	onPressGIF: (gif: Gif) => void
	inActionSheet?: boolean
	selectedGifSrc?: string
	keyboardDismissMode?: ResultsProps['keyboardDismissMode']
}

export interface PickerFrameProps {
	headerModule: MemoExoticComponent<ComponentType<HeaderProps>>
	original: ReactElement<TreeProps>
	picker: PickerProps
	results?: ComponentType<ResultsProps>
	categoryModule: { default: ComponentType<CategoryProps> }
}

export interface MainCategoriesProps {
	columns: number
	onSelectCategory: CategoryProps['onSelectCategory']
	favoritesCategory: CategoryProps['item']
	collectionUI?: {
		accountId: string
		columnWidth: number
		select(id: string): void
		category: ComponentType<CategoryProps>
	}
}

export interface NativeCategoryListProps {
	sections: number[]
	insetEnd?: number
	renderItem(section: number, row: number): ReactElement<TreeProps>
}

export interface GridItem extends Collection {
	category?: CategoryProps['item']
}

export interface CategoryProps {
	item: { type: string; name: string; src?: string; format?: number }
	onSelectCategory: (type: string, name: string) => void
	collectionTile?: boolean
	onLongPress?: () => void
}

export interface CategoryTileProps {
	original: ReactElement<CategoryContentProps>
	category: CategoryProps
}

export interface IconProps {
	color?: string
	size?: 'lg' | 'md' | 'sm' | 'xs' | 'xxs'
}

export interface CategoryContentProps extends TreeProps, IconProps {
	accessibilityLabel?: string
	accessibilityHint?: string
	onPress?: () => void
	onLongPress?: () => void
}

export interface CollectionEditorProps {
	accountId: string
	collectionId?: string
	gif?: Gif
}

export interface CollectionPickerProps {
	accountId: string
	gif: Gif
	removing?: boolean
}

export interface CollectionActionButtonProps {
	gif: Gif
	source?: { accountId: string; collectionId: string }
}

export interface CollectionTileProps {
	collection: Collection
	onSelect: () => void
	render: ComponentType<CategoryProps>
}

export interface DragEvent {
	absoluteX: number
	absoluteY: number
}

export interface PanGesture {
	runOnJS(enabled: boolean): this
	activateAfterLongPress(duration: number): this
	shouldCancelWhenOutside(cancel: boolean): this
	onStart(callback: (event: DragEvent) => void): this
	onUpdate(callback: (event: DragEvent) => void): this
	onEnd(callback: (event: DragEvent, success: boolean) => void): this
	onFinalize(callback: (event: DragEvent, success: boolean) => void): this
}

export interface NativeGestureModule {
	Gesture: { Pan(): PanGesture }
	GestureDetector: ComponentType<{ children: ReactNode; gesture: PanGesture }>
}

export interface DragTileProps {
	gestures: NativeGestureModule
	children: ReactNode
	start(event: DragEvent): void
	move(event: DragEvent): void
	finish(commit: boolean): void
}

export interface GridDrag {
	from: number
	to: number
	startX: number
	startY: number
	x: number
	y: number
	offset: number
	moved: boolean
	timer: ReturnType<typeof setInterval>
}

export interface CollectionGridProps {
	items: GridItem[]
	columns: number
	columnWidth: number
	bottomInset?: number
	renderTile(item: GridItem): ReactElement
	onReorder(id: string, targetId: string): void
	onEdit(id: string): void
	footer: ReactElement
}
