import type { QuoteMedia, QuoteMessage } from '../types'

function remoteUrl(url?: string): string | undefined {
	if (!url) return undefined
	try {
		const parsed = new URL(url)
		return parsed.protocol === 'https:' || parsed.protocol === 'http:'
			? url
			: undefined
	} catch {
		return undefined
	}
}

export function getQuoteMedia(message: QuoteMessage): QuoteMedia[] {
	const media: QuoteMedia[] = []
	const add = (url: string | undefined, kind: QuoteMedia['kind']) => {
		const valid = remoteUrl(url)
		if (valid && !media.some(item => item.url === valid))
			media.push({ url: valid, kind })
	}
	for (const attachment of message.attachments ?? []) {
		const type = attachment.content_type ?? attachment.contentType ?? ''
		const url = attachment.url ?? attachment.proxy_url ?? attachment.proxyURL
		if (
			type.startsWith('image/') ||
			/\.(png|jpe?g|gif|webp|avif)(?:[?#]|$)/i.test(url ?? '')
		)
			add(url, 'image')
	}
	for (const embed of message.embeds ?? []) {
		if (embed.type === 'gifv' && embed.video) {
			add(
				embed.video.url ?? embed.video.proxy_url ?? embed.video.proxyURL,
				'video',
			)
		} else if (embed.image) {
			add(
				embed.image.proxy_url ?? embed.image.proxyURL ?? embed.image.url,
				'image',
			)
		} else if (embed.type === 'image') {
			add(
				embed.thumbnail?.proxy_url ??
					embed.thumbnail?.proxyURL ??
					embed.thumbnail?.url ??
					embed.url,
				'image',
			)
		}
	}
	return media
}

export function getEmbeddedReply(
	message: QuoteMessage,
): QuoteMessage | undefined {
	if (message.referenced_message) return message.referenced_message
	const reference = message.referencedMessage
	return (
		reference &&
		('message' in reference ? reference.message : (reference as QuoteMessage))
	)
}

export function hasReply(message: QuoteMessage): boolean {
	return !!(
		getEmbeddedReply(message) ||
		message.messageReference ||
		message.message_reference
	)
}

export function quoteText(text: string, marks: boolean): string {
	return marks && text.trim() ? `"${text}"` : text
}

// Discord hides a standalone media link when its attachment/embed is displayed.
export function getQuoteContent(
	message: QuoteMessage,
	media: QuoteMedia[],
): string {
	const text = message.content ?? ''
	if (!media.length) return text
	const identity = (value: string) => {
		try {
			const url = new URL(value)
			if (
				['cdn.discordapp.com', 'media.discordapp.net'].includes(url.hostname) &&
				url.pathname.startsWith('/attachments/')
			)
				return url.pathname
		} catch {}
		return value
	}
	const urls = media.map(item => item.url)
	for (const attachment of message.attachments ?? []) {
		if (getQuoteMedia({ attachments: [attachment] }).length) {
			for (const url of [
				attachment.url,
				attachment.proxy_url,
				attachment.proxyURL,
			])
				if (url) urls.push(url)
		}
	}
	for (const embed of message.embeds ?? []) {
		if (embed.url && getQuoteMedia({ embeds: [embed] }).length)
			urls.push(embed.url)
	}
	return urls.some(url => identity(url) === identity(text.trim())) ? '' : text
}
