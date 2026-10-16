/** @jsxImportSource . */
import { getModules, lookupModule } from '@revenge-mod/modules/finders'
import {
	createFilterGenerator,
	FilterScopes,
	withName,
	withProps,
} from '@revenge-mod/modules/finders/filters'
import { instead } from '@revenge-mod/patcher'
import { Children, cloneElement, isValidElement } from 'react'
import { startCloud } from './cloud'
import { MediaCollectionMenu, mediaToGif } from './media'
import {
	CategoryTile,
	collectionHeader,
	MainCategories,
	PickerFrame,
} from './picker'
import Settings from './Settings'
import { CollectionActionButton, closeCollectionSheets } from './sheets'
import { collectionSources, startStorage } from './storage'
import type { Filter } from '@revenge-mod/modules/finders/filters'
import type { ComponentType, MemoExoticComponent, ReactNode } from 'react'
import type {
	CategoryContentProps,
	CategoryProps,
	CollectionStorage,
	Gif,
	HeaderProps,
	MainCategoriesProps,
	MediaSource,
	NativeCategoryListProps,
	PickerProps,
	ResultsProps,
	TreeProps,
} from './types'

export default plugin<{ jsonStorage: CollectionStorage }>({
	jsonStorage: {
		default: { accounts: {}, cloud: {}, onlyShowCollections: false },
	},
	SettingsComponent: Settings,
	async start({ cleanup, jsonStorage, plugin }) {
		const abort = new AbortController()
		cleanup(() => abort.abort())
		cleanup(closeCollectionSheets)
		if (plugin.startedLate) plugin.requireReload()
		try {
			await startStorage(
				jsonStorage,
				error => plugin.reportError(error),
				abort.signal,
			)
		} catch (error) {
			plugin.reportError(error)
			return
		}
		if (abort.signal.aborted) return
		cleanup(startCloud())
		const memoName = createFilterGenerator<[string]>(
			([name], _, value) =>
				value != null && typeof value === 'object' && value.type?.name === name,
			([name]) => `revenge-next.gif-collections.memo(${name})`,
			FilterScopes.Initialized,
		)
		function watch(
			filter: Filter,
			install: (module: Record<string, unknown>) => void,
			namespace = true,
		) {
			cleanup(
				getModules(
					filter,
					module => {
						if (abort.signal.aborted) return
						try {
							install(module as Record<string, unknown>)
						} catch (error) {
							plugin.reportError(error)
						}
					},
					{ returnNamespace: namespace },
				),
			)
		}
		function patch<P>(
			target: Record<string, unknown>,
			key: string,
			transform: (props: P, result: ReactNode) => ReactNode,
		) {
			if (typeof target[key] !== 'function')
				throw new Error(`GIF Collections: missing native ${key}`)
			cleanup(
				instead(
					target as Record<string, (...args: unknown[]) => ReactNode>,
					key,
					function (args, original) {
						const result = Reflect.apply(original, this, args)
						return abort.signal.aborted
							? result
							: transform(args[0] as P, result)
					},
				),
			)
		}
		watch(
			memoName('GIFPickerHeader'),
			header =>
				patch<HeaderProps>(header, 'type', (props, result) =>
					props.collectionTitle && isValidElement<TreeProps>(result)
						? collectionHeader(result, props)
						: result,
				),
			false,
		)
		watch(withName('GIFPickerCategoryView'), category =>
			patch<CategoryProps>(category, 'default', (props, result) =>
				isValidElement<CategoryContentProps>(result) && props.collectionTile ? (
					<CategoryTile original={result} category={props} />
				) : (
					result
				),
			),
		)
		watch(
			memoName('GIFPickerCategoriesPage'),
			page =>
				patch<MainCategoriesProps>(page, 'type', (props, result) =>
					props.collectionUI &&
					isValidElement<NativeCategoryListProps>(result) &&
					Array.isArray(result.props.sections) &&
					typeof result.props.renderItem === 'function' ? (
						<MainCategories original={result} page={props} />
					) : (
						result
					),
				),
			false,
		)
		watch(
			memoName('GIFPicker'),
			picker =>
				patch<PickerProps>(picker, 'type', (props, result) => {
					if (
						!isValidElement<TreeProps>(result) ||
						typeof props.onPressGIF !== 'function'
					)
						return result
					const [results] = lookupModule(
						withName<ComponentType<ResultsProps>>('GIFPickerResultsList'),
						{ initialize: false },
					)
					const [category] = lookupModule(withName('GIFPickerCategoryView'), {
						returnNamespace: true,
						initialize: false,
					})
					const [header] = lookupModule(memoName('GIFPickerHeader'), {
						initialize: false,
					})
					if (!category || !header) return result
					return (
						<PickerFrame
							original={result}
							picker={props}
							results={results}
							categoryModule={
								category as { default: ComponentType<CategoryProps> }
							}
							headerModule={
								header as MemoExoticComponent<ComponentType<HeaderProps>>
							}
						/>
					)
				}),
			false,
		)
		watch(withName('GIFPickerItemActionSheet'), sheet =>
			patch<{ item: Gif }>(sheet, 'default', ({ item }, result) => {
				if (
					!isValidElement(result) ||
					!item?.url ||
					!item.src ||
					!(item.width > 0 && item.height > 0)
				)
					return result
				const [buttons] = lookupModule(withProps('ButtonGroup'), {
					initialize: false,
				})
				if (!buttons) return result
				const gif: Gif = {
					id: item.id,
					title: item.title,
					url: item.url,
					src: item.src,
					width: item.width,
					height: item.height,
					format: item.format,
				}
				const action = (
					<CollectionActionButton
						key="gifcollections"
						gif={gif}
						source={collectionSources.get(item)}
					/>
				)
				const append = (node: ReactNode): ReactNode => {
					if (!isValidElement<TreeProps>(node)) return node
					if (node.type === buttons.ButtonGroup)
						return cloneElement(node, {}, node.props.children, action)
					return cloneElement(
						node,
						{},
						Children.map(node.props.children, append),
					)
				}
				return append(result)
			}),
		)
		watch(withName('MediaShareActionSheet'), media =>
			patch<{ source: MediaSource }>(media, 'default', (props, result) => {
				if (!props.source || !isValidElement<TreeProps>(result)) return result
				const gif = mediaToGif(props.source)
				return gif ? (
					<MediaCollectionMenu original={result} gif={gif} />
				) : (
					result
				)
			}),
		)
	},
})
