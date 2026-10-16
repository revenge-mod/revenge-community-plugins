import type * as t from './types'
export const DOCK_PADDING = 40
export const DOCK_ITEM_GAP = 10

// Preserve the dock's 48px target and five-to-seven slot sizing rule.
export function computeGuildDockSpecs(availableWidth: number) {
	const dockWidth = Math.max(
		80,
		Math.min(
			454,
			(Number.isFinite(availableWidth) ? Math.max(0, availableWidth) : 0) - 16,
		),
	)
	const scaleFor = (count: number) =>
		(dockWidth - DOCK_ITEM_GAP * (count - 1) - DOCK_PADDING) / (48 * count)

	const itemCount = [6, 7].reduce(
		(best, count) =>
			Math.abs(1 - scaleFor(count)) < Math.abs(1 - scaleFor(best))
				? count
				: best,
		5,
	)
	const itemSize = Math.max(1, Math.round(48 * scaleFor(itemCount)))

	return {
		dockHeight: itemSize + 32,
		dockWidth,
		itemCountNoExtras: itemCount - 2,
		itemSize,
	}
}

export function orderedDms(
	items: readonly t.DirectMessage[],
	order: unknown,
): readonly t.DirectMessage[] {
	const remaining = new Map(items.map(item => [item.id, item]))

	return [...(Array.isArray(order) ? order : []), ...remaining.keys()].flatMap(
		id => {
			const item = remaining.get(id)
			remaining.delete(id)

			return item ? [item] : []
		},
	)
}

export function filteredItems(
	items: readonly t.DrawerItem[],
	filter: 'all' | 'unread',
	query: string,
): readonly t.DrawerItem[] {
	const search = query.trim().toLocaleLowerCase()
	if (!search && filter === 'all') return items

	const matches = (item: t.DrawerGuild | t.DirectMessage) =>
		(!search || item.name.toLocaleLowerCase().includes(search)) &&
		(filter === 'all' || item.unread)

	return items.flatMap<t.DrawerItem>(item => {
		if (item.kind !== 'folder') return matches(item) ? [item] : []
		const children = item.children.filter(matches)

		return search ? children : children.length ? [{ ...item, children }] : []
	})
}
// Discord's move action inserts before its target; the drawer previews the target's slot.
export function moveToSlot(
	moveBefore: (source: string | number, target: string | number) => void,
	siblings: readonly (string | number)[],
	source: string | number,
	target: string | number,
) {
	const from = siblings.indexOf(source)
	const forward = from >= 0 && from < siblings.indexOf(target)
	moveBefore(source, target)
	if (forward) moveBefore(target, source)
}
