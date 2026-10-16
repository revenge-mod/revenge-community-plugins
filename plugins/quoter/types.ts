import type { ComponentType, ReactNode } from 'react'

export interface QuoterSettings {
	quotationMarks: boolean
	allowMedia: boolean
	allowReplies: boolean
	grayscale: boolean
	showWatermark: boolean
	watermark: string
}
export interface QuoteAuthor {
	id?: string
	colorString?: string
	bot?: boolean
	avatar?: string
	username?: string
	globalName?: string
	global_name?: string
	getAvatarURL?(): string
}
export interface QuoteMedia {
	url: string
	kind: 'image' | 'video'
}
export interface MessageAttachment {
	url?: string
	proxy_url?: string
	proxyURL?: string
	content_type?: string
	contentType?: string
	filename?: string
	width?: number
	height?: number
}
export interface MessageEmbed {
	type?: string
	url?: string
	image?: MessageAttachment
	thumbnail?: MessageAttachment
	video?: MessageAttachment
}
export interface QuoteMessage {
	id?: string
	nick?: string
	colorString?: string
	attachments?: MessageAttachment[]
	embeds?: MessageEmbed[]
	referenced_message?: QuoteMessage | null
	referencedMessage?: { message?: QuoteMessage } | QuoteMessage
	messageReference?: {
		message_id?: string
		channel_id?: string
		messageId?: string
		channelId?: string
	}
	message_reference?: { message_id?: string; channel_id?: string }

	timestamp?: string | Date | { toDate(): Date }
	content?: string
	author?: QuoteAuthor
	channel_id?: string
	channelId?: string
	channel?: { id: string }
}
export interface AvatarUtils {
	getUserAvatarURL(user: QuoteAuthor, animated: boolean): string
}
export interface RenderedQuote {
	dataUrl: string
	width: number
	height: number
}
export interface WebViewProps {
	source: { html: string; baseUrl: string }
	javaScriptEnabled: boolean
	onMessage(event: { nativeEvent: { data: string } }): void
	onError?(): void
	style: object
}
export interface WebViewModule {
	WebView: ComponentType<WebViewProps>
}
export interface TreeProps {
	children?: ReactNode
	hasIcons?: boolean
	label?: string
	message?: string
	icon?: ReactNode
}
