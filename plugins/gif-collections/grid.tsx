/** @jsxImportSource . */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Animated, FlatList, View } from 'react-native'
import { getGestures } from './native'
import type { CollectionGridProps, DragTileProps, GridDrag } from './types'

const ROW_HEIGHT = 90

function DragTile(props: DragTileProps) {
	const latest = useRef(props)
	latest.current = props
	const { Gesture, GestureDetector } = props.gestures
	const gesture = useMemo(
		() =>
			Gesture.Pan()
				.runOnJS(true)
				.activateAfterLongPress(400)
				.shouldCancelWhenOutside(false)
				.onStart(event => latest.current.start(event))
				.onUpdate(event => latest.current.move(event))
				.onEnd((_event, success) => latest.current.finish(success))
				.onFinalize((_event, success) => {
					if (!success) latest.current.finish(false)
				}),
		[Gesture],
	)

	return (
		<GestureDetector gesture={gesture}>
			<View collapsable={false} style={{ flex: 1 }}>
				{props.children}
			</View>
		</GestureDetector>
	)
}

export default function CollectionGrid({
	items,
	columns,
	columnWidth,
	bottomInset,
	renderTile,
	onReorder,
	onEdit,
	footer,
}: CollectionGridProps) {
	const AnimatedView = Animated.View
	const gestures = useMemo(() => getGestures(), [])
	const list = useRef<FlatList>(null)
	const viewport = useRef<View>(null)
	const geometry = useRef({ top: 0, height: 0, offset: 0, content: 0 })
	const drag = useRef<GridDrag | null>(null)
	const [active, setActive] = useState<{ from: number; to: number } | null>(
		null,
	)
	const [position] = useState(() => new Animated.ValueXY())
	const step = columnWidth + 8
	const slot = (index: number) => ({
		x: (index % columns) * step,
		y: Math.floor(index / columns) * ROW_HEIGHT,
	})

	function finish(commit: boolean) {
		const current = drag.current
		if (!current) return
		drag.current = null
		clearInterval(current.timer)
		setActive(null)
		if (!commit) return
		if (!current.moved) onEdit(items[current.from].id)
		else if (current.from !== current.to)
			onReorder(items[current.from].id, items[current.to].id)
	}

	function move() {
		const current = drag.current
		if (!current) return
		const dx = current.x - current.startX
		const dy = current.y - current.startY
		current.moved ||= Math.hypot(dx, dy) > 10
		const origin = slot(current.from)
		position.setValue({ x: origin.x + dx, y: origin.y - current.offset + dy })
		const row = Math.max(
			0,
			Math.round(
				(origin.y + dy + geometry.current.offset - current.offset) / ROW_HEIGHT,
			),
		)
		const column = Math.max(
			0,
			Math.min(columns - 1, Math.round((origin.x + dx) / step)),
		)
		// The native favourites entry stays pinned in the first slot.
		const lastCollection = items.findLastIndex(item => !item.category)
		const to = Math.max(1, Math.min(lastCollection, row * columns + column))
		if (to !== current.to) {
			current.to = to
			setActive({ from: current.from, to })
		}
	}

	useEffect(
		() => () => {
			if (drag.current) clearInterval(drag.current.timer)
			drag.current = null
		},
		[],
	)

	// Cancel if the underlying collection set changes while a gesture is active.
	useEffect(() => {
		finish(false)
	}, [items])

	return (
		<View
			ref={viewport}
			style={{ flex: 1 }}
			onLayout={() =>
				viewport.current?.measureInWindow((_x, top, _width, height) => {
					finish(false)
					Object.assign(geometry.current, { top, height })
				})
			}
		>
			<FlatList
				contentContainerStyle={{ paddingBottom: bottomInset }}
				ref={list}
				data={items}
				extraData={active}
				numColumns={columns}
				columnWrapperStyle={columns > 1 ? { gap: 8 } : undefined}
				keyExtractor={item => item.id}
				keyboardShouldPersistTaps="handled"
				scrollEnabled={!active}
				removeClippedSubviews={!active}
				scrollEventThrottle={16}
				onScroll={event => {
					geometry.current.offset = event.nativeEvent.contentOffset.y
				}}
				onContentSizeChange={(_width, height) => {
					geometry.current.content = height
				}}
				ListFooterComponent={footer}
				renderItem={({ item, index }) => {
					let destination = index
					if (active && index !== active.from) {
						if (index > active.from && index <= active.to) destination--
						else if (index < active.from && index >= active.to) destination++
					}
					const source = slot(index)
					const target = slot(destination)
					const tile = renderTile(item)

					return (
						<View
							style={{
								width: columnWidth,
								height: 82,
								marginBottom: 8,
								opacity: active?.from === index ? 0 : 1,
								transform: [
									{ translateX: target.x - source.x },
									{ translateY: target.y - source.y },
								],
							}}
						>
							{item.category ? (
								tile
							) : (
								<DragTile
									gestures={gestures}
									start={event => {
										finish(false)
										const offset = geometry.current.offset
										position.setValue({ x: source.x, y: source.y - offset })
										drag.current = {
											from: index,
											to: index,
											offset,
											startX: event.absoluteX,
											startY: event.absoluteY,
											x: event.absoluteX,
											y: event.absoluteY,
											moved: false,
											timer: setInterval(() => {
												const current = drag.current
												if (!current?.moved) return
												const { top, height, offset, content } =
													geometry.current
												const speed =
													current.y < top + 48
														? -10
														: current.y > top + height - 48
															? 10
															: 0
												const next = Math.max(
													0,
													Math.min(
														Math.max(0, content - height),
														offset + speed,
													),
												)
												if (next === offset) return
												geometry.current.offset = next
												list.current?.scrollToOffset({
													offset: next,
													animated: false,
												})
												move()
											}, 32),
										}
										setActive({ from: index, to: index })
									}}
									move={event => {
										if (!drag.current) return
										drag.current.x = event.absoluteX
										drag.current.y = event.absoluteY
										move()
									}}
									finish={finish}
								>
									{tile}
								</DragTile>
							)}
						</View>
					)
				}}
			/>
			{active && items[active.from] && (
				<AnimatedView
					pointerEvents="none"
					accessibilityElementsHidden
					importantForAccessibility="no-hide-descendants"
					style={{
						position: 'absolute',
						left: 0,
						top: 0,
						width: columnWidth,
						height: 82,
						elevation: 8,
						transform: [...position.getTranslateTransform(), { scale: 1.04 }],
					}}
				>
					{renderTile(items[active.from])}
				</AnimatedView>
			)}
		</View>
	)
}
