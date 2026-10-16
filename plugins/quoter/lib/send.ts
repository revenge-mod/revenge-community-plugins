import { FileModule as NativeFileModule } from '@revenge-mod/discord/native'
import { lookupModule } from '@revenge-mod/modules/finders'
import { withProps } from '@revenge-mod/modules/finders/filters'
import type { RenderedQuote } from '../types'

interface ParsedDataUrl {
	body: string
	isBase64: boolean
	mime: string
}

function parseDataUrl(dataUrl: string): ParsedDataUrl | null {
	if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return null
	const commaIndex = dataUrl.indexOf(',')
	if (commaIndex < 0) return null

	const meta = dataUrl.slice(5, commaIndex)
	const body = dataUrl.slice(commaIndex + 1)
	const isBase64 = meta.includes(';base64')
	const mime = (meta.split(';')[0] || 'image/png').trim() || 'image/png'

	return { body, isBase64, mime }
}

function getApiBase(): string {
	try {
		let base = lookupModule(
			withProps<{ getAPIBaseURL(): string; del: unknown }>(
				'getAPIBaseURL',
				'del',
			),
		)[0]?.getAPIBaseURL?.()
		if (typeof base === 'string') {
			if (base.startsWith('//')) base = `https:${base}`
			// Only trust values that already include the API path segment —
			// a bare origin would send the message POST to the wrong route.
			if (base.startsWith('http') && base.includes('/api/')) return base
		}
	} catch {}
	return 'https://discord.com/api/v9'
}

/** Writes PNG/GIF output to app cache and uploads it directly to Discord. */
export async function sendQuoteAttachment(
	channelId: string,
	image: RenderedQuote,
	filename: string,
): Promise<void> {
	const parsed = parseDataUrl(image.dataUrl)
	if (
		!parsed?.isBase64 ||
		!parsed.body ||
		!['image/png', 'image/gif'].includes(parsed.mime)
	) {
		throw new Error('Invalid rendered quote image.')
	}

	const extension = parsed.mime === 'image/gif' ? 'gif' : 'png'
	filename = filename.replace(/\.(png|gif)$/i, `.${extension}`)
	const tempPath = `revenge-next/quoter/${Date.now()}-${Math.random().toString(16).slice(2)}.${extension}`
	const filePath = await NativeFileModule.writeFile(
		'cache',
		tempPath,
		parsed.body,
		'base64',
	)
	const uri = String(filePath).startsWith('file://')
		? String(filePath)
		: `file://${filePath}`

	try {
		const token = lookupModule(
			withProps<{ getToken(): string }>('getToken'),
		)[0]?.getToken?.()
		if (!token) throw new Error('Unable to resolve authorization token.')

		const form = new FormData()
		form.append(
			'payload_json',
			JSON.stringify({
				content: '',
				channel_id: channelId,
				type: 0,
				sticker_ids: [],
				attachments: [{ id: '0', filename }],
				nonce: Date.now().toString(),
			}),
		)
		form.append('files[0]', {
			uri,
			type: parsed.mime,
			name: filename,
		} as unknown as Blob)

		// Generous cap for a multipart image upload on slow mobile networks;
		// without it a stalled send would never surface a toast.
		const controller = new AbortController()
		const timer = setTimeout(() => controller.abort(), 60_000)

		let response: Response
		try {
			response = await fetch(`${getApiBase()}/channels/${channelId}/messages`, {
				method: 'POST',
				headers: { Authorization: token },
				body: form,
				signal: controller.signal,
			})
		} catch (error) {
			const aborted =
				(error instanceof Error ? error.name : undefined) === 'AbortError'
			throw aborted ? new Error('Upload timed out.') : error
		} finally {
			clearTimeout(timer)
		}

		if (!response.ok) {
			const text = await response.text().catch(() => '')
			console.error('[Quoter] REST upload failed:', response.status, text)
			throw new Error(`Discord API returned ${response.status}`)
		}
	} finally {
		// Upload has settled; a cleanup failure must not make a delivered quote look unsent.
		try {
			await NativeFileModule.removeFile('cache', tempPath)
		} catch (error) {
			console.warn('[Quoter] Could not remove cached quote', error)
		}
	}
}
