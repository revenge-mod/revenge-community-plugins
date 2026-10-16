import { Stores } from '@revenge-mod/discord/flux'
import { lookupModule } from '@revenge-mod/modules/finders'
import { withProps } from '@revenge-mod/modules/finders/filters'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Platform, Pressable } from 'react-native'
import type * as t from './types'

export function createDrawerMotion(Gesture: t.NativeGestureModule['Gesture']) {
	const [panels] = lookupModule(
		withProps<t.DiscordPanelsConfig>(
			'DEFAULT_PANELS_ANIMATION_CONFIG',
			'ANDROID_PANELS_ANIMATION_CONFIG',
		),
	)
	const [springs] = lookupModule(
		withProps<{
			SUBTLE_SPRING: t.MotionSpring
			springStandard: t.MotionSpring
		}>('SUBTLE_SPRING', 'springStandard'),
	)
	const subtleSpring = springs?.SUBTLE_SPRING
	const accessibility =
		Stores.AccessibilityStore as import('@revenge-mod/discord/types').DiscordModules.Flux.Store<t.DrawerAccessibilityStore>
	if (!panels)
		throw new Error('Server Drawer: native panel configuration is unavailable')
	const config =
		Platform.OS === 'android'
			? panels.ANDROID_PANELS_ANIMATION_CONFIG
			: panels.DEFAULT_PANELS_ANIMATION_CONFIG

	if (
		!panels ||
		!subtleSpring ||
		!config ||
		typeof panels.isTimingConfig !== 'function' ||
		typeof Gesture?.Pan !== 'function' ||
		typeof accessibility?.useReducedMotion !== 'boolean'
	) {
		throw new Error('ServerDrawer: native panel animations are unavailable')
	}

	const animate = (
		value: Animated.Value,
		next: number,
		open: boolean,
		complete?: Animated.EndCallback,
	) => {
		const animation = open
			? config.nonSwipeSidePanelOpen
			: config.nonSwipeSidePanelClose

		if (accessibility.useReducedMotion) {
			value.stopAnimation()
			value.setValue(next)
			complete?.({ finished: true })
			return
		}

		if (panels.isTimingConfig(animation)) {
			const easing =
				typeof animation.easing === 'object'
					? animation.easing.factory()
					: animation.easing
			Animated.timing(value, {
				...animation,
				easing,
				toValue: next,
				useNativeDriver: true,
			}).start(complete)
		} else {
			Animated.spring(value, {
				...animation,
				toValue: next,
				useNativeDriver: true,
			}).start(complete)
		}
	}

	const spring = (value: Animated.Value, next: number, velocity = 0) => {
		value.stopAnimation()
		if (accessibility.useReducedMotion) value.setValue(next)
		else
			Animated.spring(value, {
				...subtleSpring,
				velocity,
				toValue: next,
				useNativeDriver: true,
			}).start()
	}

	function useTranslation(next: number) {
		const [translate] = useState(() => new Animated.Value(next))
		const position = useRef(next)
		const target = useRef(next)
		const settle = (value: number, velocity = 0) => {
			target.current = value
			spring(translate, value, velocity)
		}

		useEffect(() => {
			const listener = translate.addListener(({ value }) => {
				position.current = value
			})

			return () => {
				translate.stopAnimation()
				translate.removeListener(listener)
			}
		}, [translate])

		useEffect(() => {
			if (target.current !== next) settle(next)
		}, [next])

		return { translate, position, target, settle }
	}

	function useDrawerMotion(
		expanded: boolean,
		minimum: number,
		maximum: number,
		listAtTop: boolean,
		dragging: boolean,
		onOpen: (open: boolean) => void,
		onMarkRead?: () => void,
	) {
		const distance = maximum - minimum
		const { translate, position, target, settle } = useTranslation(
			expanded ? 0 : distance,
		)
		const origin = useRef(0)
		const callback = useRef(onOpen)
		callback.current = onOpen
		const markRead = useRef(onMarkRead)
		markRead.current = onMarkRead
		const canPull = !expanded && !!onMarkRead
		const flattenDistance = Math.max(1, minimum - 8)

		const gestures = useMemo(() => {
			const configure = () => {
				let active = false
				let pulling: boolean | undefined

				const pan = Gesture.Pan()
					.runOnJS(true)
					.shouldCancelWhenOutside(false)
					.enabled(!dragging && (!expanded || listAtTop))
					.activeOffsetY(
						canPull
							? [-config.touchSlopForPanGesture, config.touchSlopForPanGesture]
							: expanded
								? config.touchSlopForPanGesture
								: -config.touchSlopForPanGesture,
					)

				if (!canPull)
					pan.failOffsetY(
						expanded
							? -config.touchSlopForPanGesture
							: config.touchSlopForPanGesture,
					)

				return pan
					.failOffsetX([
						-config.touchSlopForPanGesture,
						config.touchSlopForPanGesture,
					])
					.onStart(event => {
						active = true
						pulling = canPull ? undefined : false
						translate.stopAnimation()
						origin.current =
							Math.max(0, Math.min(distance, position.current)) -
							event.translationY
					})
					.onUpdate(event => {
						// Native pan activation can report zero translation before the first move.
						if (pulling === undefined && event.translationY !== 0)
							pulling = event.translationY > 0
						position.current = pulling
							? distance +
								Math.min(
									flattenDistance,
									Math.max(0, event.translationY) * 0.75,
								)
							: Math.max(
									0,
									Math.min(distance, origin.current + event.translationY),
								)
						translate.setValue(position.current)
					})
					.onEnd((event, success) => {
						if (!success) return
						if (pulling) {
							const complete = position.current >= distance + flattenDistance
							settle(distance)
							if (complete) markRead.current?.()
							return
						}
						const fling = Math.abs(event.velocityY) > config.minFlingVelocityX
						const open = fling
							? event.velocityY < 0
							: position.current < distance / 2
						settle(open ? 0 : distance, event.velocityY)
						callback.current(open)
					})
					.onFinalize((_event, success) => {
						if (active && !success) settle(target.current)
						active = false
					})
			}

			return { gesture: configure(), overlayGesture: configure() }
		}, [expanded, distance, listAtTop, dragging, canPull, flattenDistance])

		return {
			...gestures,
			panelStyle: { transform: [{ translateY: translate }] },
			compactStyle: {
				opacity: translate.interpolate({
					inputRange: [0, distance],
					outputRange: [0, 1],
					extrapolate: 'clamp',
				}),
			},
			expandedStyle: {
				opacity: translate.interpolate({
					inputRange: [0, distance],
					outputRange: [1, 0],
					extrapolate: 'clamp',
				}),
			},
		}
	}

	function usePageMotion(
		view: t.DrawerView,
		width: number,
		enabled: boolean,
		onView: (view: t.DrawerView) => void,
	) {
		const { translate, position, settle } = useTranslation(
			view === 'servers' ? 0 : -width,
		)
		const callback = useRef(onView)
		callback.current = onView

		const gesture = useMemo(() => {
			let active = false
			let origin = 0
			const finish = (next: number, velocity = 0) => {
				settle(next, velocity)
				callback.current(next === 0 ? 'servers' : 'dms')
			}
			const slop = config.touchSlopForPanGesture

			return Gesture.Pan()
				.runOnJS(true)
				.shouldCancelWhenOutside(false)
				.enabled(enabled)
				.activeOffsetX([-slop, slop])
				.failOffsetY([-slop, slop])
				.onStart(event => {
					active = true
					translate.stopAnimation()
					origin =
						Math.max(-width, Math.min(0, position.current)) - event.translationX
				})
				.onUpdate(event => {
					position.current = Math.max(
						-width,
						Math.min(0, origin + event.translationX),
					)
					translate.setValue(position.current)
				})
				.onEnd((event, success) => {
					if (!success) return
					const dms =
						Math.abs(event.velocityX) > config.minFlingVelocityX
							? event.velocityX < 0
							: position.current <= -width / 2
					finish(dms ? -width : 0, event.velocityX)
				})
				.onFinalize((_event, success) => {
					if (active && !success)
						finish(position.current <= -width / 2 ? -width : 0)
					active = false
				})
		}, [enabled, width])

		return { gesture, style: { transform: [{ translateX: translate }] } }
	}

	function useFolderPageMotion(folderId: string | undefined) {
		const [progress] = useState(() => new Animated.Value(folderId ? 1 : 0))
		const previous = useRef(folderId)

		useEffect(() => {
			if (previous.current === folderId) return
			previous.current = folderId
			spring(progress, folderId ? 1 : 0)

			return () => progress.stopAnimation()
		}, [folderId])

		const interpolate = (outputRange: number[]) =>
			progress.interpolate({
				inputRange: [0, 1],
				outputRange,
				extrapolate: 'clamp',
			})

		return {
			rootStyle: {
				opacity: interpolate([1, 0]),
				transform: [{ translateY: interpolate([0, -24]) }],
			},
			folderStyle: {
				opacity: interpolate([0, 1]),
				transform: [{ translateY: interpolate([24, 0]) }],
			},
		}
	}

	function useFolderOverlayMotion(folderId: string | undefined) {
		const [retainedId, setRetainedId] = useState(folderId)
		const [progress] = useState(() => new Animated.Value(0))

		useEffect(() => {
			let cancelled = false
			if (folderId) setRetainedId(folderId)
			animate(progress, folderId ? 1 : 0, !!folderId, ({ finished }) => {
				if (finished && !cancelled && !folderId) setRetainedId(undefined)
			})

			return () => {
				cancelled = true
				progress.stopAnimation()
			}
		}, [folderId])

		return {
			folderId: folderId ?? retainedId,
			backdropStyle: { opacity: progress },
			panelStyle: {
				transform: [
					{
						translateY: progress.interpolate({
							inputRange: [0, 1],
							outputRange: [24, 0],
							extrapolate: 'clamp',
						}),
					},
				],
			},
		}
	}

	return {
		touchSlop: config.touchSlopForPanGesture,
		AnimatedView: Animated.View,
		AnimatedPressable: Animated.createAnimatedComponent(Pressable),
		useDrawerMotion,
		usePageMotion,
		useFolderPageMotion,
		useFolderOverlayMotion,
	}
}
