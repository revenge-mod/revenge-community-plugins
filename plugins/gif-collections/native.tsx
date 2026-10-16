/** @jsxImportSource . */
import { AlertActionCreators } from '@revenge-mod/discord/actions'
import { Design } from '@revenge-mod/discord/design'
import { Stores } from '@revenge-mod/discord/flux'
import { lookupModule } from '@revenge-mod/modules/finders'
import { withProps } from '@revenge-mod/modules/finders/filters'
import { Fragment } from 'react'
import type { ComponentType } from 'react'
import type { FlatListProps } from 'react-native'
import type { Collection, NativeGestureModule } from './types'

export function currentAccountId(): string | undefined {
	return (
		Stores.UserStore as typeof Stores.UserStore & {
			getCurrentUser(): { id: string } | undefined
		}
	).getCurrentUser()?.id
}

export function getGestures() {
	const [gestures] = lookupModule(
		withProps<
			NativeGestureModule & {
				FlatList: ComponentType<
					FlatListProps<Collection> & { disallowInterruption: boolean }
				>
			}
		>('Gesture', 'GestureDetector'),
	)
	if (!gestures)
		throw new Error('GIF Collections: native gestures are unavailable')
	return gestures
}

export function showConfirmationAlert(props: {
	title: string
	content: string
	confirmText: string
	cancelText?: string
	confirmColor?: string
	onConfirm(): void
}) {
	const key = 'revenge-next.gif-collections.confirm'
	AlertActionCreators.openAlert(
		key,
		<Design.AlertModal
			title={props.title}
			content={props.content}
			actions={
				<Fragment>
					<Design.AlertActionButton
						text={props.confirmText}
						variant={props.confirmColor === 'red' ? 'destructive' : 'primary'}
						onPress={() => {
							AlertActionCreators.dismissAlert(key)
							props.onConfirm()
						}}
					/>
					<Design.AlertActionButton
						text={props.cancelText ?? 'Cancel'}
						variant="secondary"
						onPress={() => AlertActionCreators.dismissAlert(key)}
					/>
				</Fragment>
			}
		/>,
	)
}
