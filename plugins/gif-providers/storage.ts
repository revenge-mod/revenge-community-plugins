import { useSyncExternalStore } from 'react'
import type { JsonStorage } from '@revenge-mod/json-storage'

export const GridQualities = ['gif', 'tinygif', 'nanogif'] as const
export type GridQuality = (typeof GridQualities)[number]
export const providerLabels = {
	tenor: 'Tenor',
	giphy: 'Giphy',
	klipy: 'Klipy',
} as const
export type Provider = keyof typeof providerLabels
export const providers = Object.keys(providerLabels) as Provider[]
export interface GifProvidersSettings {
	gridQuality: GridQuality
	providers: Provider[]
}
export const defaults: GifProvidersSettings = {
	gridQuality: 'tinygif',
	providers: ['tenor'],
}
export let storage: JsonStorage<GifProvidersSettings>
let active = false
const listeners = new Set<() => void>()

export function selectedProviders(value?: readonly Provider[]): Provider[] {
	const selected = providers.filter(provider => value?.includes(provider))
	return selected.length ? selected : ['tenor']
}

export function configureStorage(instance: JsonStorage<GifProvidersSettings>) {
	storage = instance
}

export function getSettings(): GifProvidersSettings {
	return { ...defaults, ...storage.cache }
}

// Mounted picker controls can outlive their patches when the plugin stops.
export function setActive(value: boolean) {
	active = value
	for (const listener of listeners) listener()
}

export function useProvidersEnabled() {
	return useSyncExternalStore(subscribe, () => active)
}

function subscribe(listener: () => void) {
	listeners.add(listener)
	return () => {
		listeners.delete(listener)
	}
}

export function useGifProvidersSettings() {
	return { ...defaults, ...storage.use() }
}
