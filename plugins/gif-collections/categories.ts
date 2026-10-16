import type { CategoryProps, Collection, GridItem } from './types'

export function mainPickerItems(
	favourites: CategoryProps['item'],
	collections: Collection[],
	native: CategoryProps['item'][],
	onlyCollections: boolean,
): GridItem[] {
	const categoryItem = (
		category: CategoryProps['item'],
		index: number,
	): GridItem => ({
		id: `native-${index}`,
		name: category.name,
		gifs: [],
		category,
	})
	return [
		categoryItem(favourites, 0),
		...collections,
		...(!onlyCollections
			? native
					.filter(item => item.type !== 'Favorites')
					.map((item, index) => categoryItem(item, index + 1))
			: []),
	]
}
