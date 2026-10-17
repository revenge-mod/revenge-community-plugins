import Constants from '../constants'
import { getSettings } from '../lib/state'
import { BaseService } from './BaseService'
import type { Track } from '../types'

interface LastFMResponse {
	recenttracks?: {
		track: LastFMTrack[]
	}
	track?: {
		duration: string
	}
	error?: number
	message?: string
}

interface LastFMTrack {
	name: string
	artist: {
		name: string
	}
	album: {
		'#text': string
	}
	image?: {
		size: string
		'#text': string
	}[]
	url: string
	date?: {
		'#text': string
		uts: string
	}
	'@attr'?: {
		nowplaying: boolean
	}
	loved: string
}

export class LastFmService extends BaseService {
	getServiceName(): string {
		return 'Last.fm'
	}

	async validateCredentials(): Promise<boolean> {
		try {
			const settings = getSettings()
			if (!settings.username || !settings.apiKey) {
				throw new Error('Username or API key not set')
			}

			const params = new URLSearchParams({
				method: 'user.getinfo',
				user: settings.username,
				api_key: settings.apiKey,
				format: 'json',
			})

			const url = `${Constants.SERVICES.lastfm.baseUrl}?${params}`
			await this.makeRequest(url)

			this.log('Credentials validation successful')
			return true
		} catch (error) {
			this.logError('Credentials validation failed:', error)
			return false
		}
	}

	async fetchLatestScrobble(): Promise<Track> {
		try {
			const settings = getSettings()
			if (!settings.username || !settings.apiKey) {
				throw new Error('Username or API key not set')
			}

			const params = new URLSearchParams({
				method: 'user.getrecenttracks',
				user: settings.username,
				api_key: settings.apiKey,
				limit: '1',
				extended: '1',
				format: 'json',
			})

			const url = `${Constants.SERVICES.lastfm.baseUrl}?${params}`
			const data: LastFMResponse = await this.makeRequest(url)

			const lastTrack = data?.recenttracks?.track?.[0]
			if (!lastTrack) {
				throw new Error('No tracks found')
			}

			const isNowPlaying = Boolean(lastTrack['@attr']?.nowplaying)
			const trackTimestamp = lastTrack.date?.uts
				? parseInt(lastTrack.date.uts, 10)
				: Math.floor(Date.now() / 1000)

			const resolveField = (v: any, altKey = 'name'): string => {
				if (!v) return ''
				if (typeof v === 'string') return v
				return v['#text'] ?? v[altKey] ?? ''
			}

			let duration: number | undefined
			let endTime: number | null = null

			if (isNowPlaying) {
				try {
					const trackInfoParams = new URLSearchParams({
						method: 'track.getInfo',
						track: lastTrack.name,
						artist: resolveField(lastTrack.artist),
						api_key: settings.apiKey,
						format: 'json',
					})

					const trackInfoUrl = `${Constants.SERVICES.lastfm.baseUrl}?${trackInfoParams}`
					const trackInfo: LastFMResponse = await this.makeRequest(trackInfoUrl)

					if (trackInfo?.track?.duration) {
						duration = parseInt(trackInfo.track.duration, 10)
						if (duration > 0) {
							duration = Math.floor(duration / 1000)
							endTime = trackTimestamp + duration
						}
					}
				} catch (_error) {}
			}

			const albumArt = this.processAlbumArt(
				lastTrack.image?.find(img => img.size === 'large')?.['#text'],
			)

			const track: Track = {
				name: lastTrack.name,
				artist: resolveField(lastTrack.artist),
				album: resolveField(lastTrack.album, 'title'),
				albumArt,
				url: lastTrack.url,
				date: lastTrack.date?.['#text'] ?? 'now',
				nowPlaying: isNowPlaying,
				loved: lastTrack.loved === '1',
				from: trackTimestamp,
				to: endTime,
				duration,
			}

			this.log(
				`${isNowPlaying ? 'Now playing' : 'Last played'}:`,
				`${track.artist} - ${track.name}`,
			)

			return track
		} catch (error) {
			this.logError('Failed to fetch latest scrobble:', error)
			throw error
		}
	}
}
