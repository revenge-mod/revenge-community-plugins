/** @jsxImportSource . */
import { Design } from '@revenge-mod/discord/design'
import { lookupGeneratedIconComponent } from '@revenge-mod/utils/discord'
import { findInTree } from '@revenge-mod/utils/tree'
import {
	Children,
	cloneElement,
	isValidElement,
	useMemo,
	useState,
} from 'react'
import { View } from 'react-native'
import { mainPickerItems } from './categories'
import CollectionGrid from './grid'
import { editCollection } from './sheets'
import {
	collectionSources,
	reorderCollection,
	useAccountId,
	useCollectionStore,
	useCollections,
	useCollectionsEnabled,
} from './storage'
import type {
	ComponentProps,
	ComponentType,
	ReactElement,
	ReactNode,
} from 'react'
import type {
	CategoryContentProps,
	CategoryProps,
	CategoryTileProps,
	HeaderProps,
	MainCategoriesProps,
	NativeCategoryListProps,
	PickerFrameProps,
	TreeProps,
} from './types'

export function collectionHeader(
	original: ReactElement<TreeProps>,
	props: HeaderProps,
): ReactNode {
	const replace = (node: ReactNode): ReactNode => {
		if (!isValidElement<CategoryContentProps>(node)) return node
		if (node.props.onPress === props.onQueryClear) {
			return cloneElement(
				node,
				{},
				Children.map(node.props.children, child =>
					isValidElement<TreeProps>(child) &&
					typeof child.props.children === 'string'
						? cloneElement(child, {}, props.collectionTitle)
						: child,
				),
			)
		}
		return cloneElement(node, {}, Children.map(node.props.children, replace))
	}

	return replace(original)
}

export function CategoryTile({ original, category }: CategoryTileProps) {
	const enabled = useCollectionsEnabled()
	return enabled && category.collectionTile
		? cloneElement(original, {
				onLongPress: category.onLongPress,
				accessibilityHint:
					'Hold and drag to reorder. Hold and release to edit.',
			})
		: original
}

export function MainCategories({
	original,
	page,
}: {
	original: ReactElement<NativeCategoryListProps>
	page: MainCategoriesProps
}) {
	const enabled = useCollectionsEnabled()
	const ui = page.collectionUI!
	const collections = useCollections(ui.accountId)
	const onlyCollections = useCollectionStore(state => state.onlyShowCollections)
	const nativeCategories = useMemo(() => {
		const categories: CategoryProps['item'][] = []
		original.props.sections.forEach((rows, section) => {
			for (let row = 0; row < rows; row++) {
				const tree = original.props.renderItem(section, row)
				Children.forEach(tree.props.children, child => {
					if (isValidElement<CategoryProps>(child) && child.props.item)
						categories.push(child.props.item)
				})
			}
		})
		return categories
	}, [original.props.sections, original.props.renderItem])
	const items = useMemo(
		() =>
			mainPickerItems(
				page.favoritesCategory,
				collections,
				nativeCategories,
				onlyCollections,
			),
		[page.favoritesCategory, collections, nativeCategories, onlyCollections],
	)
	if (!enabled) return original
	const Category = ui.category
	return (
		<View style={{ flex: 1 }}>
			<CollectionGrid
				key={`${page.columns}:${ui.columnWidth}`}
				items={items}
				columns={page.columns}
				columnWidth={ui.columnWidth}
				bottomInset={original.props.insetEnd}
				onReorder={(id, target) => reorderCollection(ui.accountId, id, target)}
				onEdit={id =>
					editCollection({ accountId: ui.accountId, collectionId: id })
				}
				footer={
					<Design.Text variant="text-sm/medium" style={{ padding: 16 }}>
						{collections.length
							? 'Hold and drag a category to reorder. Hold and release to rename or delete.'
							: 'Create a category, then long-press a GIF and choose Add to category.'}
					</Design.Text>
				}
				renderTile={item =>
					item.category ? (
						<Category
							item={item.category}
							onSelectCategory={page.onSelectCategory}
						/>
					) : (
						<Category
							collectionTile
							item={{
								type: 'Category',
								name: item.name,
								src: item.gifs[0]?.src,
								format: item.gifs[0]?.format ?? 1,
							}}
							onSelectCategory={() => {
								ui.select(item.id)
								page.onSelectCategory(
									page.favoritesCategory.type,
									page.favoritesCategory.name,
								)
							}}
							onLongPress={() => {}}
						/>
					)
				}
			/>
		</View>
	)
}

export function PickerFrame({
	original,
	picker,
	results: Results,
	categoryModule,
	headerModule: Header,
}: PickerFrameProps) {
	const enabled = useCollectionsEnabled()
	const accountId = useAccountId()
	const collections = useCollections(accountId ?? '')
	const [selected, setSelected] = useState<{
		accountId: string
		id: string
		columns: number
	} | null>(null)
	const [query, setQuery] = useState('')
	const collection =
		selected && selected.accountId === accountId
			? collections.find(item => item.id === selected.id)
			: undefined
	const gifs = useMemo(() => {
		const search = query.trim().toLowerCase()
		return (collection?.gifs ?? [])
			.filter(
				gif =>
					!search ||
					`${gif.title ?? ''} ${gif.url}`.toLowerCase().includes(search),
			)
			.map(gif => {
				const item = { ...gif }
				if (accountId && collection)
					collectionSources.set(item, {
						accountId,
						collectionId: collection.id,
					})
				return item
			})
	}, [accountId, collection, query])
	if (!enabled || !accountId) return original
	const headerElement = findInTree(
		original,
		(node): node is ReactElement<HeaderProps> =>
			typeof node?.props?.onFavoritesQueryChange === 'function',
		{ walkable: new Set(['props', 'children']) },
	)
	if (!headerElement) return original
	const header = headerElement.props
	const categories = findInTree(
		original,
		(node): node is ReactElement<MainCategoriesProps> =>
			!!node?.props?.favoritesCategory &&
			typeof node.props.onSelectCategory === 'function',
		{ walkable: new Set(['props', 'children']) },
	)
	if (collection && Results) {
		const back = () => {
			setSelected(null)
			setQuery('')
			header.onQueryClear()
		}
		return cloneElement(
			original,
			{},
			<View style={{ flex: 1 }}>
				<Design.Stack spacing={12} style={{ paddingVertical: 12 }}>
					<Header
						{...header}
						categoryType="Category"
						collectionTitle={collection.name}
						onQueryClear={back}
					/>
					<Design.TextInput
						placeholder="Search GIFs"
						value={query}
						onChange={setQuery}
					/>
				</Design.Stack>
				{gifs.length ? (
					<Results
						key={`${collection.id}:${query}`}
						columns={selected!.columns}
						columnWidth={header.columnWidth}
						loading={false}
						inActionSheet={picker.inActionSheet ?? true}
						resultItems={gifs}
						onPressGIF={picker.onPressGIF}
						selectedGifSrc={picker.selectedGifSrc}
						keyboardDismissMode={picker.keyboardDismissMode}
					/>
				) : (
					<Design.Text variant="text-sm/medium" style={{ padding: 16 }}>
						{query
							? 'No matching GIFs.'
							: 'No GIFs here yet. Long-press a GIF to organise it.'}
					</Design.Text>
				)}
			</View>,
		)
	}
	const PlusIcon = lookupGeneratedIconComponent('PlusSmallIcon')!
	// Discord accepts icon elements; the public type still declares asset IDs.
	const IconButton = Design.IconButton as ComponentType<
		Omit<ComponentProps<typeof Design.IconButton>, 'icon'> & { icon: ReactNode }
	>
	const replace = (node: ReactNode): ReactNode => {
		if (!isValidElement<TreeProps>(node)) return node
		if (node === headerElement && header.categoryType === 'Search')
			return (
				<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
					<View style={{ flex: 1, minWidth: 0 }}>{node}</View>
					<IconButton
						icon={<PlusIcon size="sm" />}
						size="md"
						variant="secondary"
						accessibilityLabel="New category"
						onPress={() => editCollection({ accountId })}
					/>
				</View>
			)
		if (node === categories)
			return cloneElement(categories, {
				collectionUI: {
					accountId,
					columnWidth: header.columnWidth,
					select: id => {
						setSelected({ accountId, id, columns: categories.props.columns })
						setQuery('')
					},
					category: categoryModule.default,
				},
			})
		return cloneElement(node, {}, Children.map(node.props.children, replace))
	}
	return categories ? replace(original) : original
}
