import { getAssetIdByName as findAssetId } from '@revenge-mod/assets'
import { ActionSheetActionCreators } from '@revenge-mod/discord/actions'
import { Design } from '@revenge-mod/discord/design'
import { getModules } from '@revenge-mod/modules/finders'
import {
	createFilterGenerator,
	FilterScopes,
	withName,
} from '@revenge-mod/modules/finders/filters'
import { instead } from '@revenge-mod/patcher'
import { cloneElement, isValidElement, useEffect, useRef } from 'react'
import { View } from 'react-native'
import {
	providerLabels,
	providers,
	selectedProviders,
	storage,
	useGifProvidersSettings,
	useProvidersEnabled,
} from './storage'
import type { ReactElement } from 'react'
import type {
	GifItemProps,
	ProviderPillProps,
	ProviderSelectProps,
} from './types'

const SHEET_KEY = 'GifProvidersSelect'
let refreshPicker: ((category: string) => void) | undefined

function ProviderPill({ provider }: ProviderPillProps) {
	const enabled = useProvidersEnabled()
	if (!enabled) return null

	return (
		<View
			pointerEvents="none"
			style={{
				position: 'absolute',
				bottom: 14,
				left: 10,
				borderRadius: 10,
				paddingHorizontal: 7,
				paddingVertical: 2,
				backgroundColor: 'rgba(0, 0, 0, 0.65)',
			}}
		>
			<Design.Text variant="text-xs/semibold" style={{ color: '#fff' }}>
				{providerLabels[provider]}
			</Design.Text>
		</View>
	)
}

function ProviderSheet() {
	const { providers: saved } = useGifProvidersSettings()
	const selected = selectedProviders(saved)

	return (
		<Design.ActionSheet>
			<Design.Stack spacing={16} style={{ padding: 16 }}>
				<Design.TableRowGroup title="GIF providers">
					{providers.map(provider => (
						<Design.TableCheckboxRow
							key={provider}
							label={providerLabels[provider]}
							value={provider}
							checked={selected.includes(provider)}
							disabled={selected.length === 1 && selected[0] === provider}
							onPress={() => {
								const next = selected.includes(provider)
									? selected.filter(item => item !== provider)
									: [...selected, provider]
								if (next.length) void storage.set({ providers: next })
							}}
						/>
					))}
				</Design.TableRowGroup>
				<Design.Button
					text="Done"
					onPress={() => ActionSheetActionCreators.hideActionSheet(SHEET_KEY)}
				/>
			</Design.Stack>
		</Design.ActionSheet>
	)
}

export function ProviderSelect({ compact = false }: ProviderSelectProps) {
	const saved = useGifProvidersSettings().providers
	const selected = selectedProviders(saved)
	const names = selected.map(provider => providerLabels[provider]).join(', ')

	if (compact) {
		return (
			<Design.Button
				text={selected.length === 1 ? names : `${selected.length} providers`}
				size="md"
				variant="secondary"
				grow={false}
				icon={findAssetId('ChevronSmallDownIcon')}
				iconPosition="end"
				onPress={() =>
					ActionSheetActionCreators.openLazy(
						Promise.resolve({ default: ProviderSheet }),
						SHEET_KEY,
						{},
					)
				}
			/>
		)
	}

	return (
		<Design.TableRow
			label="GIF providers"
			subLabel={names}
			trailing={
				<Design.TableRow.Icon source={findAssetId('ChevronSmallDownIcon')} />
			}
			onPress={() =>
				ActionSheetActionCreators.openLazy(
					Promise.resolve({ default: ProviderSheet }),
					SHEET_KEY,
					{},
				)
			}
		/>
	)
}

function PickerControls({
	header,
	category,
}: {
	header: ReactElement
	category: string
}) {
	const saved = useGifProvidersSettings().providers
	const enabled = useProvidersEnabled()
	const selection = selectedProviders(saved).join(',')
	const previous = useRef(selection)

	useEffect(() => {
		if (enabled && previous.current !== selection) refreshPicker?.(category)
		previous.current = selection
	}, [selection, enabled, category])

	const search = header
	if (!enabled || category !== 'Search') return search

	return (
		<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
			<View style={{ flex: 1, minWidth: 0 }}>{search}</View>
			<ProviderSelect compact />
		</View>
	)
}

export function patchPicker(
	refresh: (category: string) => void,
	report: (error: unknown) => void,
) {
	refreshPicker = refresh
	let stopped = false
	const patches: (() => void)[] = []
	const memoName = createFilterGenerator<[string]>(
		([name], _, value) =>
			value != null && typeof value === 'object' && value.type?.name === name,
		([name]) => `palmdevs.tenor-gif-search.memo(${name})`,
		FilterScopes.Initialized,
	)
	patches.push(
		getModules(memoName('GIFPickerHeader'), target => {
			if (stopped) return
			try {
				patches.push(
					instead(target, 'type', function (args, original) {
						const result = Reflect.apply(original, this, args)
						return isValidElement(result) ? (
							<PickerControls header={result} category={args[0].categoryType} />
						) : (
							result
						)
					}),
				)
			} catch (error) {
				report(error)
			}
		}),
	)
	patches.push(
		getModules(
			withName('GIFPickerItemView'),
			target => {
				if (stopped) return
				try {
					patches.push(
						instead(
							target as { default: (props: GifItemProps) => React.ReactNode },
							'default',
							function (args, original) {
								const result = Reflect.apply(original, this, args)
								const props = args[0] as GifItemProps
								const provider = providers.find(provider =>
									props.item?.id?.startsWith(`${provider}:`),
								)
								if (
									!provider ||
									!isValidElement<{ children?: React.ReactNode }>(result)
								)
									return result
								return cloneElement(
									result,
									{},
									result.props.children,
									<ProviderPill key="provider" provider={provider} />,
								)
							},
						),
					)
				} catch (error) {
					report(error)
				}
			},
			{ returnNamespace: true },
		),
	)
	return () => {
		stopped = true
		refreshPicker = undefined
		ActionSheetActionCreators.hideActionSheet(SHEET_KEY)
		patches.reverse().forEach(unpatch => unpatch())
	}
}
