/** @jsxImportSource . */
import { getAssetIdByName as findAssetId } from '@revenge-mod/assets'
import { ActionSheetActionCreators } from '@revenge-mod/discord/actions'
import { Design } from '@revenge-mod/discord/design'
import { ReactNativeSafeAreaContext } from '@revenge-mod/externals/react-native-safe-area-context'
import { Fragment, useState } from 'react'
import { View } from 'react-native'
import { getGestures, showConfirmationAlert } from './native'
import {
	addGif,
	moveGif,
	removeGif,
	saveCollection,
	updateCollections,
	useAccountId,
	useCollections,
	useCollectionsEnabled,
} from './storage'
import type { ComponentType } from 'react'
import type { FlatListProps } from 'react-native'
import type {
	Collection,
	CollectionActionButtonProps,
	CollectionEditorProps,
	CollectionPickerProps,
} from './types'

const EDITOR_KEY = 'GifCollectionsCollectionEditor'
const PICKER_KEY = 'GifCollectionsPicker'

export function closeCollectionSheets() {
	ActionSheetActionCreators.hideActionSheet(EDITOR_KEY)
	ActionSheetActionCreators.hideActionSheet(PICKER_KEY)
}

export function showCollectionPicker(props: CollectionPickerProps) {
	ActionSheetActionCreators.openLazy(
		Promise.resolve({ default: CollectionPicker }),
		PICKER_KEY,
		props,
	)
}

export function editCollection(props: CollectionEditorProps) {
	ActionSheetActionCreators.hideActionSheet(PICKER_KEY)
	ActionSheetActionCreators.openLazy(
		Promise.resolve({ default: CollectionEditor }),
		EDITOR_KEY,
		props,
	)
}

function CollectionEditor({
	accountId,
	collectionId,
	gif,
}: CollectionEditorProps) {
	const insets = ReactNativeSafeAreaContext.useSafeAreaInsets()
	const collections = useCollections(accountId)
	const currentAccount = useAccountId()
	const enabled = useCollectionsEnabled()
	const collection = collections.find(item => item.id === collectionId)
	const [name, setName] = useState(collection?.name ?? '')
	const [error, setError] = useState('')
	const unavailable =
		!enabled || accountId !== currentAccount || (!!collectionId && !collection)

	function save() {
		if (unavailable) return

		try {
			saveCollection(accountId, name, collectionId, gif)
			ActionSheetActionCreators.hideActionSheet(EDITOR_KEY)
		} catch (error) {
			setError(
				error instanceof Error ? error.message : 'Could not save collection.',
			)
		}
	}

	return (
		<Design.ActionSheet>
			<Design.Stack
				spacing={16}
				style={{ padding: 16, paddingBottom: 16 + insets.bottom }}
			>
				<Design.Text variant="heading-lg/semibold">
					{collection ? 'Edit category' : 'New category'}
				</Design.Text>
				<Design.TextInput
					label="Name"
					value={name}
					maxLength={60}
					onChange={value => {
						setName(value)
						setError('')
					}}
				/>
				{error ? (
					<Design.Text color="text-feedback-critical">{error}</Design.Text>
				) : null}
				<Design.Button
					text="Save"
					disabled={unavailable || !name.trim()}
					onPress={save}
				/>
				{collection && (
					<Design.Button
						text="Delete category"
						variant="destructive"
						disabled={unavailable}
						onPress={() =>
							showConfirmationAlert({
								title: `Delete “${collection.name}”?`,
								content:
									'All GIFs saved here will be removed from the collection. This cannot be undone, are you sure?',
								confirmText: 'Delete',
								confirmColor: 'red',
								cancelText: 'Cancel',
								onConfirm: () => {
									updateCollections(accountId, items =>
										items.filter(item => item.id !== collectionId),
									)
									ActionSheetActionCreators.hideActionSheet(EDITOR_KEY)
								},
							})
						}
					/>
				)}
			</Design.Stack>
		</Design.ActionSheet>
	)
}

function CollectionPicker({
	accountId,
	gif,
	removing = false,
}: CollectionPickerProps) {
	// Let the dropdown own its scroll gesture instead of the surrounding sheet.
	const { FlatList: CollectionList } = getGestures() as {
		FlatList: ComponentType<
			FlatListProps<Collection> & { disallowInterruption: boolean }
		>
	}
	const insets = ReactNativeSafeAreaContext.useSafeAreaInsets()
	const storedCollections = useCollections(accountId)
	const collections = removing
		? storedCollections.filter(collection =>
				collection.gifs.some(item => item.url === gif.url),
			)
		: storedCollections
	const currentAccount = useAccountId()
	const enabled = useCollectionsEnabled()
	const unavailable = !enabled || accountId !== currentAccount
	const [selectedId, setSelectedId] = useState<string | null>(() =>
		removing && collections.length === 1 ? collections[0].id : null,
	)
	const [expanded, setExpanded] = useState(false)
	const selected = collections.find(collection => collection.id === selectedId)
	const index = selected?.gifs.findIndex(item => item.url === gif.url) ?? -1

	return (
		<Design.ActionSheet>
			<Design.Stack
				spacing={16}
				style={{ padding: 16, paddingBottom: 16 + insets.bottom }}
			>
				<Design.Text variant="heading-lg/semibold">
					{removing ? 'Remove from category' : 'Add to category'}
				</Design.Text>
				<Design.Stack spacing={4}>
					<Design.Button
						text={selected?.name ?? 'Select a category'}
						variant="secondary"
						icon={findAssetId('ChevronSmallDownIcon')}
						iconPosition="end"
						disabled={unavailable}
						onPress={() => setExpanded(value => !value)}
					/>
					{expanded && (
						<View style={{ borderRadius: 12, overflow: 'hidden' }}>
							<CollectionList
								disallowInterruption
								style={{ maxHeight: 220 }}
								data={collections}
								keyExtractor={collection => collection.id}
								keyboardShouldPersistTaps="handled"
								nestedScrollEnabled
								renderItem={({ item }) => (
									<Design.TableRow
										label={item.name}
										disabled={unavailable}
										onPress={() => {
											setSelectedId(item.id)
											setExpanded(false)
										}}
									/>
								)}
								ListFooterComponent={
									removing ? null : (
										<Design.TableRow
											label="New category"
											disabled={unavailable}
											onPress={() => editCollection({ accountId, gif })}
										/>
									)
								}
							/>
						</View>
					)}
				</Design.Stack>
				<Design.Button
					text={
						removing
							? 'Remove from category'
							: index === -1
								? 'Add to category'
								: 'Already in category'
					}
					variant={removing ? 'destructive' : 'primary'}
					disabled={
						unavailable || !selected || (removing ? index === -1 : index !== -1)
					}
					onPress={() => {
						if (!selected) return
						if (removing) removeGif(accountId, selected.id, gif)
						else addGif(accountId, selected.id, gif)
						ActionSheetActionCreators.hideActionSheet(PICKER_KEY)
					}}
				/>
				{!removing && selected && index !== -1 && (
					<Fragment>
						<Design.Button
							text="Remove from category"
							variant="destructive"
							disabled={unavailable}
							onPress={() => removeGif(accountId, selected.id, gif)}
						/>
						{selected.gifs.length > 1 && (
							<Design.Stack direction="horizontal" spacing={8}>
								<Design.Button
									text="Move earlier"
									variant="secondary"
									size="sm"
									disabled={unavailable || index === 0}
									onPress={() => moveGif(accountId, selected.id, gif.url, -1)}
								/>
								<Design.Button
									text="Move later"
									variant="secondary"
									size="sm"
									disabled={unavailable || index === selected.gifs.length - 1}
									onPress={() => moveGif(accountId, selected.id, gif.url, 1)}
								/>
							</Design.Stack>
						)}
					</Fragment>
				)}
				<Design.Button
					text="Done"
					variant="secondary"
					onPress={() => ActionSheetActionCreators.hideActionSheet(PICKER_KEY)}
				/>
			</Design.Stack>
		</Design.ActionSheet>
	)
}

export function CollectionActionButton({
	gif,
	source,
}: CollectionActionButtonProps) {
	const accountId = useAccountId()
	const enabled = useCollectionsEnabled()
	if (!enabled || !accountId || (source && source.accountId !== accountId))
		return null

	return (
		<Design.Button
			text={source ? 'Remove from category' : 'Add to category'}
			variant={source ? 'destructive' : 'secondary'}
			onPress={() => {
				ActionSheetActionCreators.hideActionSheet('GIFPickerItemActionSheet')
				if (source) removeGif(accountId, source.collectionId, gif)
				else showCollectionPicker({ accountId, gif })
			}}
		/>
	)
}
