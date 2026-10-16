/** @jsxImportSource . */
import { lookupModule } from '@revenge-mod/modules/finders'
import { withProps } from '@revenge-mod/modules/finders/filters'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Animated } from 'react-native'
import type * as t from './types'

export function createDragMotion(
	{ Gesture, GestureDetector }: t.NativeGestureModule,
	longPressMs: number,
) {
	const [timings] = lookupModule(
		withProps<{
			timingStandard: { duration: number }
			timingFast: { duration: number }
		}>('timingStandard', 'timingFast'),
	)
	if (!timings)
		throw new Error('Server Drawer: native animation timings are unavailable')
	const { timingStandard } = timings

	function usePreview(width: number, grid: boolean) {
		const [x] = useState(() => new Animated.Value(0))
		const [y] = useState(() => new Animated.Value(0))
		const [scale] = useState(() => new Animated.Value(1))
		const style = useMemo(
			() => ({
				transform: [
					{ translateX: grid ? Animated.subtract(x, width / 2) : 0 },
					{ translateY: Animated.subtract(y, grid ? 48 : 41) },
					{ scale },
				],
			}),
			[x, y, scale, width, grid],
		)

		useEffect(() => () => scale.stopAnimation(), [scale])

		return { x, y, scale, style }
	}

	function DragTarget(properties: t.DragTargetProps) {
		const callbacks = useRef(properties)
		callbacks.current = properties
		const { x, y, scale } = properties.preview
		const position = useRef<Animated.ValueXY | null>(null)
		if (properties.offset && !position.current)
			position.current = new Animated.ValueXY()
		const offset = position.current
		const style = useMemo(
			() =>
				offset ? { transform: offset.getTranslateTransform() } : undefined,
			[offset],
		)
		const previousOffset = useRef(properties.offset)

		useEffect(() => {
			if (
				previousOffset.current?.x === properties.offset?.x &&
				previousOffset.current?.y === properties.offset?.y
			)
				return
			previousOffset.current = properties.offset
			if (!offset) return
			const animation = Animated.timing(offset, {
				duration: timingStandard?.duration ?? 300,
				toValue: properties.offset ?? { x: 0, y: 0 },
				useNativeDriver: true,
			})
			animation.start()

			return () => animation.stop()
		}, [offset, properties.offset?.x, properties.offset?.y])

		const gesture = useMemo(
			() =>
				Gesture.Pan()
					.runOnJS(true)
					.activateAfterLongPress(longPressMs)
					.shouldCancelWhenOutside(false)
					.onStart(event => {
						x.setValue(event.absoluteX)
						y.setValue(event.absoluteY)
						scale.stopAnimation()
						Animated.timing(scale, {
							...timingStandard,
							toValue: 1.05,
							useNativeDriver: true,
						}).start()
						callbacks.current.onStart({
							x: event.absoluteX,
							y: event.absoluteY,
						})
					})
					.onUpdate(event => {
						x.setValue(event.absoluteX)
						y.setValue(event.absoluteY)
						callbacks.current.onMove({ x: event.absoluteX, y: event.absoluteY })
					})
					.onEnd((event, success) => {
						if (success)
							callbacks.current.onDrop({
								x: event.absoluteX,
								y: event.absoluteY,
							})
					})
					.onFinalize((_event, success) => {
						scale.stopAnimation()
						scale.setValue(1)
						if (!success) callbacks.current.onCancel()
					}),
			[x, y, scale],
		)

		return (
			<GestureDetector gesture={gesture}>
				<Animated.View collapsable={false} style={style}>
					{properties.children}
				</Animated.View>
			</GestureDetector>
		)
	}

	return { DragTarget, usePreview }
}
