/** @jsxImportSource . */
import { ActionSheetActionCreators } from '@revenge-mod/discord/actions'
import { Design } from '@revenge-mod/discord/design'
import { lookupGeneratedIconComponent } from '@revenge-mod/utils/discord'
import { cloneElement, isValidElement } from 'react'
import { showCollectionPicker } from './sheets'
import { useAccountId, useCollections, useCollectionsEnabled } from './storage'
import type { ReactElement } from 'react'
import type { Gif, MediaSource, TreeProps } from './types'

export function mediaToGif(source: MediaSource): Gif | undefined {
	const media = source.videoURI || source.uri || source.sourceURI
	const url = (source.isGIFV && source.embedURI) || source.sourceURI || media
	const { width, height } = source
	if (
		!media ||
		!url ||
		!/^https?:\/\//i.test(media) ||
		!/^https?:\/\//i.test(url) ||
		!width ||
		!height ||
		!Number.isFinite(width) ||
		!Number.isFinite(height) ||
		width <= 0 ||
		height <= 0
	)
		return

	const video =
		!!source.videoURI ||
		source.contentType?.startsWith('video/') ||
		/\.(mp4|webm|mov|m4v|gifv)(?:[?#]|$)/i.test(media)
	let src = media
	if (video) {
		// The picker renders images; keep the send URL separate from the video preview.
		const thumbnail = source.thumbnail?.uri
		const proxy = media.replace(
			'https://cdn.discordapp.com/',
			'https://media.discordapp.net/',
		)
		if (thumbnail && /^https?:\/\//i.test(thumbnail)) src = thumbnail
		else if (
			/^https?:\/\/(?:media\.discordapp\.net|images-ext[^/]*\.discordapp\.net)\//i.test(
				proxy,
			)
		)
			src = `${proxy}${proxy.includes('?') ? '&' : '?'}format=jpeg`
	}
	return { url, src, width, height, format: video ? 2 : 1 }
}

export function MediaCollectionMenu({
	original,
	gif,
}: {
	original: ReactElement<TreeProps>
	gif: Gif
}) {
	const enabled = useCollectionsEnabled()
	const accountId = useAccountId()
	const collections = useCollections(accountId ?? '')
	const saved = collections.some(collection =>
		collection.gifs.some(item => item.url === gif.url),
	)
	const group = original.props.children
	if (
		!enabled ||
		!accountId ||
		!isValidElement<TreeProps>(group) ||
		group.type !== Design.ActionSheetRow.Group
	)
		return original

	const FolderIcon = lookupGeneratedIconComponent('FolderIcon')
	const row = (
		<Design.ActionSheetRow
			key="gifcollections"
			label={saved ? 'Remove from category' : 'Add to category'}
			icon={<Design.ActionSheetRow.Icon IconComponent={FolderIcon} />}
			onPress={() => {
				// The native media actions dismiss the current sheet without a key.
				ActionSheetActionCreators.hideActionSheet()
				showCollectionPicker({ accountId, gif, removing: saved })
			}}
		/>
	)

	return cloneElement(
		original,
		{},
		cloneElement(group, {}, group.props.children, row),
	)
}
