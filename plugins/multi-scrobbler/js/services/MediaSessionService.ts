import { findAlbumArtUrl } from '../lib/artwork'
import * as MediaSession from '../lib/mediasession'
import { BaseService } from './BaseService'
import type { Track } from '../types'

export class MediaSessionService extends BaseService {
	getServiceName(): string {
		return 'MediaSession'
	}

	async validateCredentials(): Promise<boolean> {
		const available = await MediaSession.isMediaSessionAvailable()
		if (!available) {
			const companionInstalled = await MediaSession.isCompanionInstalled()
			const companionEnabled = companionInstalled
				? await MediaSession.isCompanionListenerEnabled()
				: false
			if (companionInstalled && !companionEnabled) {
				throw new Error(
					'MediaSession Bridge companion is installed but not enabled. ' +
						'Open it and enable the notification listener.',
				)
			}
			if (!companionInstalled) {
				const enabled = await MediaSession.isNotificationListenerEnabled()
				if (!enabled) {
					throw new Error(
						'Notification Listener access is required. ' +
							'Install MediaSession Bridge companion app or enable any notification listener in Settings.',
					)
				}
			}
			throw new Error(
				'No active media sessions found. Start playing music on your device first.',
			)
		}
		return true
	}

	async fetchLatestScrobble(): Promise<Track> {
		const info = await MediaSession.getCurrentMediaInfo()
		if (!info?.title) {
			throw new Error('No media currently playing')
		}

		const now = Math.floor(Date.now() / 1000)
		const isPlaying = info.stateLabel === 'playing'

		let duration: number | undefined
		let elapsed: number | undefined
		let endTime: number | null = null

		if (info.duration > 0) {
			duration = Math.floor(info.duration / 1000)
			if (info.position > 0) {
				// Clamp against duration — some apps report bogus positions.
				elapsed = Math.min(Math.floor(info.position / 1000), duration)
				endTime = now - elapsed + duration
			} else {
				endTime = now + duration
			}
		}

		// Media sessions only carry raw art bytes, which Discord can't render.
		// Look up a public cover-art URL by metadata instead (cached per term).
		let albumArt: string | null = null
		try {
			albumArt = await findAlbumArtUrl(
				info.artist || '',
				info.album || '',
				info.title || '',
			)
		} catch {
			// Best effort only — presence works without artwork.
		}

		const track: Track = {
			name: info.title || 'Unknown',
			artist: info.artist || 'Unknown',
			album: info.album || '',
			albumArt,
			// Stable identity per track — the manager dedupes on this, so it must
			// change when the song changes and stay stable across polls.
			url: `mediasession://${info.packageName}/${encodeURIComponent(
				info.artist || '',
			)}/${encodeURIComponent(info.title || '')}`,
			date: new Date().toISOString(),
			nowPlaying: isPlaying,
			loved: false,
			from: elapsed !== undefined ? now - elapsed : now,
			to: endTime,
			duration,
		}

		this.log(
			`${isPlaying ? 'Now playing' : 'Last played'}:`,
			`${track.artist} - ${track.name}`,
			`from ${info.appName || info.packageName}`,
		)

		return track
	}
}
