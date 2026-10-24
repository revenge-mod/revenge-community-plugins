import Constants from '../constants'
import { incrementApiCall, recordServiceError } from '../lib/debug'
import type { ServiceClient, Track } from '../types'

const USER_AGENTS = [
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
	'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
	'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0',
	'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
]

export abstract class BaseService implements ServiceClient {
	protected retryCount = 0
	protected lastError = 0

	abstract fetchLatestScrobble(): Promise<Track>
	abstract validateCredentials(): Promise<boolean>
	abstract getServiceName(): string

	protected log(..._args: any[]): void {}

	protected logError(..._args: any[]): void {}

	protected async handleError(error: any): Promise<never> {
		this.lastError = error.error || 0

		const errorMessage = this.getErrorMessage(error)
		this.logError(errorMessage)
		recordServiceError(this.getServiceName().toLowerCase() as any, errorMessage)

		throw new Error(`${this.getServiceName()} API Error: ${errorMessage}`)
	}

	protected getErrorMessage(error: any): string {
		if (error.error && Constants.API_ERROR_CODES[error.error]) {
			return Constants.API_ERROR_CODES[error.error]
		}
		return error.message || error.toString() || 'Unknown error'
	}

	protected async makeRequest(
		url: string,
		options: RequestInit = {},
	): Promise<any> {
		try {
			incrementApiCall()

			const response = await fetch(url, {
				...options,
				headers: {
					'User-Agent':
						USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
					...options.headers,
				},
			})

			if (!response.ok) {
				const error = new Error(
					`HTTP ${response.status}: ${response.statusText}`,
				)
				recordServiceError(
					this.getServiceName().toLowerCase() as any,
					error.message,
				)
				throw error
			}

			const data = await response.json()

			if (data.error) {
				await this.handleError(data)
			}

			this.retryCount = 0
			return data
		} catch (error) {
			this.retryCount++
			if (this.retryCount > Constants.MAX_RETRY_ATTEMPTS) {
				this.retryCount = 0
				recordServiceError(
					this.getServiceName().toLowerCase() as any,
					`Max retries exceeded: ${(error as Error).message}`,
				)
				throw error
			}
			await new Promise(resolve => setTimeout(resolve, Constants.RETRY_DELAY))
			return this.makeRequest(url, options)
		}
	}

	protected isDefaultCover(cover?: string): boolean {
		if (!cover) return true
		return Constants.DEFAULT_COVER_HASHES.some(hash => cover.includes(hash))
	}

	protected processAlbumArt(cover?: string): string | null {
		if (!cover || this.isDefaultCover(cover)) {
			return null
		}
		return cover
	}

	public getLastError(): number {
		return this.lastError
	}

	public resetRetryCount(): void {
		this.retryCount = 0
	}
}
