import Constants from '../constants'
import { getSettings } from '../lib/state'
import { BaseService } from './BaseService'
import type { Track } from '../types'

interface ListenBrainzListen {
	listened_at: number
	track_metadata: {
		artist_name: string
		track_name: string
		release_name?: string
		additional_info?: {
			duration_ms?: number
			artist_mbids?: string[]
			release_mbid?: string
			recording_mbid?: string
			spotify_id?: string
			youtube_id?: string
			isrc?: string
			tags?: string[]
			media_player?: string
			submission_client?: string
			music_service?: string
			origin_url?: string
		}
	}
	playing_now?: boolean
}

export class ListenBrainzService extends BaseService {
	getServiceName(): string {
		return 'ListenBrainz'
	}

	async validateCredentials(): Promise<boolean> {
		try {
			const settings = getSettings()
			const username = settings.listenbrainzUsername
			const token = settings.listenbrainzToken

			if (!username) {
				throw new Error('Username not set for ListenBrainz')
			}

			// For ListenBrainz, we don't need a token to read public data
			// But we can test the connection by fetching user listens
			const url = `${Constants.SERVICES.listenbrainz.baseUrl}/user/${encodeURIComponent(username)}/listens?count=1`

			const headers: Record<string, string> = {}
			if (token) {
				headers.Authorization = `Token ${token}`
			}

			await this.makeRequest(url, { headers })

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
			const username = settings.listenbrainzUsername
			const token = settings.listenbrainzToken

			if (!username) {
				throw new Error('Username not set for ListenBrainz')
			}

			// First check for currently playing track
			let currentlyPlaying: ListenBrainzListen | null = null

			// Helper to normalize ListenBrainz responses which may return either
			// { listens: [...] } or { payload: { listens: [...] } }
			const extractListens = (resp: any): ListenBrainzListen[] | undefined => {
				if (!resp) return undefined
				if (Array.isArray(resp.listens)) return resp.listens
				if (resp.payload && Array.isArray(resp.payload.listens))
					return resp.payload.listens
				if (resp.data && Array.isArray(resp.data.listens))
					return resp.data.listens
				return undefined
			}

			try {
				const playingNowUrl = `${Constants.SERVICES.listenbrainz.baseUrl}/user/${encodeURIComponent(username)}/playing-now`
				const headers: Record<string, string> = {}
				if (token) {
					headers.Authorization = `Token ${token}`
				}

				const playingNowRaw: any = await this.makeRequest(playingNowUrl, {
					headers,
				})
				const playingNowListens = extractListens(playingNowRaw)
				if (playingNowListens && playingNowListens.length > 0) {
					currentlyPlaying = playingNowListens[0]
					currentlyPlaying.playing_now = true
				}
			} catch (_error) {}

			let latestListen: ListenBrainzListen

			if (currentlyPlaying) {
				latestListen = currentlyPlaying
			} else {
				// Fetch recent listens
				const url = `${Constants.SERVICES.listenbrainz.baseUrl}/user/${encodeURIComponent(username)}/listens?count=1`
				const headers: Record<string, string> = {}
				if (token) {
					headers.Authorization = `Token ${token}`
				}

				// Fetch recent listens and normalize different response shapes
				const dataRaw: any = await this.makeRequest(url, {
					headers,
				})

				const recentListens = ((): ListenBrainzListen[] | undefined => {
					if (!dataRaw) return undefined
					if (Array.isArray(dataRaw.listens)) return dataRaw.listens
					if (dataRaw.payload && Array.isArray(dataRaw.payload.listens))
						return dataRaw.payload.listens
					if (dataRaw.data && Array.isArray(dataRaw.data.listens))
						return dataRaw.data.listens
					return undefined
				})()

				if (!recentListens || recentListens.length === 0) {
					throw new Error('No listens found')
				}

				latestListen = recentListens[0]
			}

			const isNowPlaying = Boolean(latestListen.playing_now)
			const trackTimestamp =
				latestListen.listened_at || Math.floor(Date.now() / 1000)

			let duration: number | undefined
			let endTime: number | null = null

			// Extract duration from additional_info if available
			if (latestListen.track_metadata.additional_info?.duration_ms) {
				duration = Math.floor(
					latestListen.track_metadata.additional_info.duration_ms / 1000,
				)
				if (isNowPlaying && duration > 0) {
					endTime = trackTimestamp + duration
				}
			}

			// Try to get album art from Cover Art Archive
			let albumArt: string | null = null
			if (latestListen.track_metadata.additional_info?.release_mbid) {
				albumArt = `https://coverartarchive.org/release/${latestListen.track_metadata.additional_info.release_mbid}/front`
			}

			const track: Track = {
				name: latestListen.track_metadata.track_name,
				artist: latestListen.track_metadata.artist_name,
				album: latestListen.track_metadata.release_name || '',
				albumArt,
				url:
					latestListen.track_metadata.additional_info?.origin_url ||
					`https://listenbrainz.org/player/${latestListen.track_metadata.additional_info?.recording_mbid || `${encodeURIComponent(latestListen.track_metadata.artist_name)}/${encodeURIComponent(latestListen.track_metadata.track_name)}`}`,

				date: isNowPlaying
					? 'now'
					: new Date(trackTimestamp * 1000).toISOString(),
				nowPlaying: isNowPlaying,
				loved: false,
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
			this.logError('Failed to fetch latest listen:', error)
			throw error
		}
	}

	protected getErrorMessage(error: any): string {
		// ListenBrainz uses different error format
		if (error.error) {
			return error.error
		}
		if (error.message) {
			return error.message
		}
		return error.toString() || 'Unknown error'
	}
}
