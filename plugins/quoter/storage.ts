import { useSyncExternalStore } from 'react'
import type { JsonStorage } from '@revenge-mod/json-storage'
import type { QuoterSettings } from './types'
export const DEFAULT_WATERMARK = 'Made with Revenge Next'
export const defaults: QuoterSettings = {
	grayscale: true,
	quotationMarks: false,
	allowMedia: false,
	allowReplies: false,
	showWatermark: false,
	watermark: DEFAULT_WATERMARK,
}
export let quoterSettings = defaults
let storage: JsonStorage<QuoterSettings>
let active = false
const listeners = new Set<() => void>()
export function configureStorage(instance: JsonStorage<QuoterSettings>) {
	storage = instance
}
export async function loadSettings() {
	const value = storage.cache ?? (await storage.get())
	if (!value) throw new Error('Could not load Quoter settings.')
	quoterSettings = { ...defaults, ...value }
	publish()
}
function publish() {
	for (const listener of listeners) listener()
}
export function setActive(value: boolean) {
	active = value
	publish()
}
function subscribe(listener: () => void) {
	listeners.add(listener)
	return () => {
		listeners.delete(listener)
	}
}
export function useQuoterEnabled() {
	return useSyncExternalStore(subscribe, () => active)
}
function updateSettings(update: Partial<QuoterSettings>) {
	quoterSettings = { ...quoterSettings, ...update }
	void storage.set(quoterSettings, true)
	publish()
}
export function useQuoterSettings() {
	const settings = useSyncExternalStore(subscribe, () => quoterSettings)
	return { ...settings, updateSettings }
}
useQuoterSettings.subscribe = subscribe
