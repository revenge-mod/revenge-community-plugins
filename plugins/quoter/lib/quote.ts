import { Stores } from '@revenge-mod/discord/flux'
import { lookupModule } from '@revenge-mod/modules/finders'
import { withProps } from '@revenge-mod/modules/finders/filters'
import {
	getEmbeddedReply,
	getQuoteContent,
	getQuoteMedia,
	quoteText,
} from './content'
import type {
	AvatarUtils,
	QuoteAuthor,
	QuoteMedia,
	QuoteMessage,
	QuoterSettings,
} from '../types'

export const CANVAS_CONFIG = {
	width: 1200,
	height: 600,
	quoteAreaWidth: 520,
	quoteAreaX: 640,
	maxContentHeight: 480,
}

const FONT_SIZES = {
	initial: 42,
	minimum: 18,
	decrement: 2,
	lineHeightMultiplier: 1.25,
	authorMultiplier: 0.6,
	usernameMultiplier: 0.45,
	authorMinimum: 22,
	usernameMinimum: 18,
	watermark: 18,
}

const SPACING = {
	authorTop: 60,
	username: 10,
	gradientWidth: 400,
	watermarkPadding: 20,
}

export interface QuotePayload {
	media: QuoteMedia[]
	reply?: {
		media: QuoteMedia[]
		text: string
		displayName: string
		avatarUrl: string
		color: string
		timestamp: string
	}
	quote: string
	displayName: string
	username: string
	authorColor: string
	isBot: boolean
	timestamp: string
	avatarUrl: string
	grayscale: boolean
	showWatermark: boolean
	watermark: string
	quoteFont: string
	canvas: typeof CANVAS_CONFIG
	fonts: typeof FONT_SIZES
	spacing: typeof SPACING
	renderId?: string
}

function normalizeText(text: unknown): string {
	if (!text) return ''
	return String(text)
		.replace(/\r\n?/g, '\n')
		.split('\n')
		.map(line => line.replace(/[^\S\n]+/g, ' ').trim())
		.join('\n')
		.trim()
}

function sizeUpgrade(url: string): string {
	if (!url || typeof url !== 'string') return ''
	try {
		const parsed = new URL(url)
		parsed.searchParams.set('size', '512')
		if (
			parsed.hostname === 'cdn.discordapp.com' ||
			parsed.hostname === 'media.discordapp.net'
		) {
			parsed.pathname = parsed.pathname.replace(
				/\.(webp|gif|jpg|jpeg)$/i,
				'.png',
			)
			parsed.searchParams.set('format', 'png')
		}
		return parsed.toString()
	} catch {
		return url
	}
}

export function fixUpQuote(rawQuote: unknown): string {
	let result = String(rawQuote ?? '').replace(/<a?:(\w+):(\d+)>/g, '')
	const mentionMatches = result.match(/<@!?\d+>/g)
	if (!mentionMatches) return normalizeText(result)

	for (const match of mentionMatches) {
		const userId = match.replace(/[<@!>]/g, '')
		const user = (
			Stores.UserStore as unknown as {
				getUser(id: string): QuoteAuthor | undefined
			}
		).getUser(userId)
		if (user?.username) {
			result = result.replace(match, `@${user.username}`)
		}
	}

	return normalizeText(result)
}

export function getReply(message: QuoteMessage): QuoteMessage | undefined {
	const embedded = getEmbeddedReply(message)
	if (embedded) return embedded
	const reference = message.messageReference ?? message.message_reference
	if (!reference) return undefined
	const references = Stores.ReferencedMessageStore as unknown as {
		getMessageByReference(
			reference: NonNullable<QuoteMessage['messageReference']>,
		): { message?: QuoteMessage } | undefined
	}
	const cached = references.getMessageByReference(reference)?.message
	if (cached) return cached
	const id =
		'messageId' in reference
			? (reference.messageId ?? reference.message_id)
			: reference.message_id
	const channel =
		'channelId' in reference
			? (reference.channelId ?? reference.channel_id)
			: reference.channel_id
	const store = Stores.MessageStore as unknown as {
		getMessage(channel: string, id: string): QuoteMessage | undefined
	}
	return typeof id === 'string' && typeof channel === 'string'
		? store.getMessage(channel, id)
		: undefined
}

function getMessageAuthor(message: QuoteMessage) {
	return message?.author ?? {}
}

function getDisplayName(author: QuoteAuthor): string {
	return (
		author?.globalName || author?.global_name || author?.username || 'Unknown'
	)
}

function getAuthorUsername(author: QuoteAuthor): string {
	return (
		String(author?.username || 'unknown')
			.replace(/[^\w.-]/g, '')
			.slice(0, 32) || 'unknown'
	)
}

function getAvatarUrl(author: QuoteAuthor): string {
	try {
		if (typeof author?.getAvatarURL === 'function') {
			return sizeUpgrade(author.getAvatarURL())
		}
	} catch {}

	try {
		const [avatarUtils] = lookupModule(
			withProps<AvatarUtils>('getUserAvatarURL'),
		)
		if (typeof avatarUtils?.getUserAvatarURL === 'function') {
			return sizeUpgrade(avatarUtils.getUserAvatarURL(author, false))
		}
	} catch {}

	if (author?.id && author?.avatar) {
		return `https://cdn.discordapp.com/avatars/${author.id}/${author.avatar}.png?size=512`
	}

	return 'https://cdn.discordapp.com/embed/avatars/0.png?size=512'
}

export function getMessageChannelId(message: QuoteMessage): string | null {
	return (
		message?.channel_id || message?.channelId || message?.channel?.id || null
	)
}

export function buildFileName(message: QuoteMessage): string {
	const content = fixUpQuote(message?.content || '')
	const preview = content.split(' ').filter(Boolean).slice(0, 6).join(' ')
	const safePreview = (preview || 'quote').replace(/[^\w.-]/g, '_').slice(0, 48)
	const username = getAuthorUsername(getMessageAuthor(message))
	return `${safePreview}-${username}.png`
}

function formatTimestamp(message: QuoteMessage): string {
	const value = message.timestamp
	const date =
		value && typeof value === 'object' && 'toDate' in value
			? value.toDate()
			: new Date(value ?? '')
	return Number.isNaN(date.getTime())
		? ''
		: date.toLocaleTimeString([], {
				hour: '2-digit',
				minute: '2-digit',
				hour12: false,
			})
}

export function buildPayload(
	message: QuoteMessage,
	options: QuoterSettings,
	includeReply = false,
): QuotePayload {
	const author = getMessageAuthor(message)
	const reply =
		options.allowReplies && includeReply ? getReply(message) : undefined
	const replyAuthor = reply && getMessageAuthor(reply)
	const replyMedia = reply && options.allowMedia ? getQuoteMedia(reply) : []
	const media = options.allowMedia ? getQuoteMedia(message) : []
	const text = fixUpQuote(getQuoteContent(message, media))
	return {
		media,
		reply:
			reply && replyAuthor
				? {
						media: replyMedia,
						timestamp: formatTimestamp(reply),
						text:
							fixUpQuote(getQuoteContent(reply, replyMedia)) ||
							(replyMedia.length
								? ''
								: getQuoteMedia(reply).length
									? '[Media]'
									: '[Message]'),
						displayName: reply.nick || getDisplayName(replyAuthor),
						avatarUrl: getAvatarUrl(replyAuthor),
						color: /^#[\da-f]{6}$/i.test(
							reply.colorString ?? replyAuthor.colorString ?? '',
						)
							? (reply.colorString ?? replyAuthor.colorString)!
							: '#b5bac1',
					}
				: undefined,
		quote: quoteText(text, options.quotationMarks) || ' ',
		displayName: (message.nick || getDisplayName(author)).slice(0, 64),
		authorColor: /^#[\da-f]{6}$/i.test(message.colorString ?? '')
			? message.colorString!
			: '#f2f3f5',
		isBot: Boolean(author.bot),
		timestamp: formatTimestamp(message),
		username: `@${getAuthorUsername(author)}`,
		avatarUrl: getAvatarUrl(author),
		grayscale: Boolean(options.grayscale),
		showWatermark: Boolean(options.showWatermark),
		watermark: String(options.watermark || '').slice(0, 32),
		quoteFont: 'M PLUS Rounded 1c',
		canvas: CANVAS_CONFIG,
		fonts: FONT_SIZES,
		spacing: SPACING,
	}
}
