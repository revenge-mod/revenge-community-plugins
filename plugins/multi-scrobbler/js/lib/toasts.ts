import type { PluginApi } from '@revenge-mod/plugins/types'
import type { MultiScrobblerStorage } from '../types'

type ScopedApi = PluginApi<{ jsonStorage: MultiScrobblerStorage }>
type ToastsApi = NonNullable<ScopedApi['toasts']>
type ToastVariant = NonNullable<
	Extract<Parameters<ToastsApi['show']>[0], object>['variant']
>

/**
 * The api object is stable but `toasts` is filled in by toast-api's
 * `decorate`, which can land after this plugin's `start` runs. Holding the
 * value instead of the api would freeze `undefined` into the stash and every
 * later call would no-op, so every call reads it through the api.
 */
let api: ScopedApi | undefined

export function setToastApi(container: ScopedApi): void {
	api = container
}

/**
 * Show a toast through toast-api. Returns its id, the handle for
 * `settleToast`. A repeat of content already on screen is dropped and the id
 * of the one showing comes back.
 */
export function showToast(
	content: string,
	variant: ToastVariant,
): string | undefined {
	return api?.toasts?.show({ content, variant })
}

/**
 * Swap an in-flight toast for its result: same toast, new content and
 * variant. Does nothing when there is no id to settle.
 */
export function settleToast(
	id: string | undefined,
	content: string,
	variant: ToastVariant,
): void {
	if (id === undefined) return
	api?.toasts?.update(id, { content, variant })
}
