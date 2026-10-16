import { lookupModule } from '@revenge-mod/modules/finders'
import {
	withDependencies,
	withName,
	withProps,
} from '@revenge-mod/modules/finders/filters'
import {
	ReactJSXRuntimeModuleId,
	ReactModuleId,
	ReactNativeModuleId,
} from '@revenge-mod/react'
import type { ComponentType } from 'react'

interface ModalNavigation {
	pushModal(options: {
		key: string
		modal: {
			key: string
			modal: ComponentType
			animation: string
			shouldPersistUnderModals: boolean
			props: Record<string, unknown>
			closable: boolean
		}
	}): void
	popModal(key: string): void
}

let cancel: (() => void) | undefined

export function cancelAuthorization() {
	cancel?.()
}

export function authorize(
	clientId: string,
	redirectUri: string,
	state: string,
	complete: (code: string) => Promise<void>,
	fail: (error: unknown) => void,
) {
	cancelAuthorization()
	const [, closeIconId] = lookupModule(withProps('XSmallIcon'))
	if (closeIconId === undefined)
		throw new Error('Discord sign-in is unavailable on this version.')
	// Load only the native authorization screen when the user chooses Sign in.
	const [modal] = lookupModule(
		withDependencies([
			ReactModuleId,
			ReactNativeModuleId,
			ReactJSXRuntimeModuleId,
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			closeIconId,
			null,
			null,
			null,
			null,
			null,
		]).and(withName<ComponentType>('OAuth2AuthorizeModal')),
	)
	const [navigation] = lookupModule(
		withProps<ModalNavigation>('pushModal', 'popModal'),
	)
	if (
		!modal ||
		!navigation ||
		modal.name !== 'OAuth2AuthorizeModal' ||
		typeof navigation.pushModal !== 'function' ||
		typeof navigation.popModal !== 'function'
	)
		throw new Error('Discord sign-in is unavailable on this version.')
	const key = 'gifcollections-authorize'
	let settled = false
	let closed = false
	const close = () => {
		if (closed) return
		closed = true
		navigation.popModal(key)
	}
	const finish = (result?: { location?: string }) => {
		close()
		// Current Discord dismisses first, then delivers the result through
		// dismissOAuthModal. Older versions use callback instead.
		if (settled || !result?.location) return
		settled = true
		cancel = undefined
		try {
			const url = new URL(result.location)
			if (
				`${url.origin}${url.pathname}` !== redirectUri ||
				url.searchParams.get('state') !== state
			)
				throw new Error('Discord returned an unexpected sign-in response.')
			if (url.searchParams.has('error')) return
			const code = url.searchParams.get('code')
			if (!code) throw new Error('Discord did not authorize sign-in.')
			void complete(code).catch(fail)
		} catch (error) {
			fail(error)
		}
	}
	cancel = () => {
		settled = true
		cancel = undefined
		close()
	}
	navigation.pushModal({
		key,
		modal: {
			key,
			modal,
			animation: 'slide-up',
			shouldPersistUnderModals: false,
			props: {
				clientId,
				redirectUri,
				state,
				scopes: ['identify'],
				responseType: 'code',
				permissions: 0n,
				cancelCompletesFlow: false,
				callback: finish,
				dismissOAuthModal: finish,
			},
			closable: true,
		},
	})
}
