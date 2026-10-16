import { integer, object, page } from './protocol'
import { acknowledge, beginBatch, receive, rejectBatch } from './replica'
import type { Replica } from './replica'

export class SyncError extends Error {
	status: number
	code: string
	retryAfter: number

	constructor(status: number, code: string, message: string, retryAfter = 0) {
		super(message)
		this.status = status
		this.code = code
		this.retryAfter = retryAfter
	}
}

export function serverOrigin(value: string): string {
	const url = new URL(value)
	if (
		url.protocol !== 'https:' ||
		url.username ||
		url.password ||
		url.search ||
		url.hash ||
		url.pathname !== '/'
	)
		throw new Error('Use the HTTPS origin of your sync server.')
	return url.origin
}

export async function request(
	server: string,
	token: string | undefined,
	path: string,
	options: {
		method?: string
		body?: unknown
		signal?: AbortSignal
		headers?: Record<string, string>
	} = {},
): Promise<unknown> {
	const controller = new AbortController()
	const abort = () => controller.abort()
	options.signal?.addEventListener('abort', abort, { once: true })
	if (options.signal?.aborted) controller.abort()
	const timeout = setTimeout(abort, 20000)
	try {
		const response = await fetch(`${serverOrigin(server)}${path}`, {
			method: options.method ?? 'GET',
			signal: controller.signal,
			credentials: 'omit',
			redirect: 'error',
			headers: {
				...(token ? { Authorization: `Bearer ${token}` } : {}),
				...(options.body === undefined
					? {}
					: { 'Content-Type': 'application/json' }),
				...options.headers,
			},
			body:
				options.body === undefined ? undefined : JSON.stringify(options.body),
		})
		let value: unknown
		try {
			value = await response.json()
		} catch {
			throw new SyncError(
				response.status || 503,
				'unavailable',
				'Cloud sync is unavailable. Local collections are safe.',
				900,
			)
		}
		if (!response.ok) {
			const error = object(object(value).error)
			const header = response.headers.get('Retry-After')
			const delay =
				header && /^\d+$/.test(header)
					? Number(header)
					: header
						? Math.max(0, (Date.parse(header) - Date.now()) / 1000)
						: 0
			throw new SyncError(
				response.status,
				String(error.code),
				String(error.message),
				Number.isFinite(delay) ? delay : 0,
			)
		}
		return value
	} finally {
		clearTimeout(timeout)
		options.signal?.removeEventListener('abort', abort)
	}
}

export interface SyncAdapter {
	read(): Replica
	// Persist before resolving, especially the immutable in-flight batch.
	write(update: (current: Replica) => Replica): Promise<void>
	call(
		path: string,
		options?: { method?: string; body?: unknown },
	): Promise<unknown>
	active(): boolean
}

export async function synchronize(adapter: SyncAdapter): Promise<boolean> {
	const ensureActive = () => {
		if (!adapter.active()) throw new Error('Sync cancelled.')
	}
	const upload = async () => {
		ensureActive()
		const { flight } = adapter.read()
		if (!flight) return
		try {
			const result = object(
				await adapter.call('/v1/sync', {
					method: 'POST',
					body: { version: 1, ...flight },
				}),
			)
			ensureActive()
			if (integer(result.sequence) !== flight.sequence)
				throw new Error('Unexpected upload acknowledgement.')
			const revision = integer(result.revision)
			await adapter.write(current => acknowledge(current, revision))
		} catch (error) {
			if (
				error instanceof SyncError &&
				error.status === 409 &&
				error.code !== 'sequence'
			) {
				await adapter.write(rejectBatch)
			}
			throw error
		}
	}
	const download = async () => {
		for (let count = 0; count < 150; count++) {
			ensureActive()
			const result = page(
				await adapter.call(
					`/v1/sync?cursor=${encodeURIComponent(adapter.read().cursor)}`,
				),
			)
			ensureActive()
			await adapter.write(current => receive(current, result))
			if (!result.more) return
		}
		throw new Error('Download paused. Choose Sync Now to continue.')
	}
	// Replay uncertain uploads before downloading; receiving our own successful
	// write first would otherwise look like a conflicting remote edit.
	if (adapter.read().flight) {
		try {
			await upload()
		} catch (error) {
			if (
				error instanceof SyncError &&
				error.status === 409 &&
				error.code !== 'sequence'
			)
				await download()
			throw error
		}
	}
	await download()
	if (adapter.read().conflicts.length)
		throw new SyncError(
			409,
			'conflict',
			'Collections changed on another device. Export your local backup, then review the conflict options.',
		)
	const limits = object(object(await adapter.call('/v1/me')).limits)
	const maximum = Math.min(16, integer(limits.batch))
	const maximumBytes = Math.min(60000, integer(limits.bodyBytes))
	if (!maximum || maximumBytes < 128)
		throw new Error('Invalid server sync limits.')
	for (let count = 0; count < 40 && adapter.read().pending.length; count++) {
		ensureActive()
		await adapter.write(current => beginBatch(current, maximum, maximumBytes))
		try {
			await upload()
		} catch (error) {
			if (
				error instanceof SyncError &&
				error.status === 409 &&
				error.code !== 'sequence'
			)
				await download()
			throw error
		}
	}
	await download()
	return !adapter.read().pending.length
}

export function retryDelay(
	attempt: number,
	retryAfter: number,
	random = Math.random,
): number {
	return Math.max(
		retryAfter * 1000,
		Math.min(900000, 5000 * 2 ** attempt) * (0.75 + random() * 0.5),
	)
}
