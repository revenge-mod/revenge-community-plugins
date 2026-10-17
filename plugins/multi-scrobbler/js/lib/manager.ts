import Constants from '../constants'
import { DEFAULTS } from '../defaults'
import { serviceFactory } from '../services/ServiceFactory'
import { clearActivity, fetchAsset, sendRequest } from './activity'
import {
	debugInfo,
	incrementApiCall,
	incrementConnectionAttempt,
	recordServiceError,
	recordSuccessfulUpdate,
	setDebugInfo,
} from './debug'
import { getSelfPresenceStore } from './modules'
import { getSettings, pluginState } from './state'
import { formatDuration, getCurrentTimestamp } from './time'
import type { Activity, ServiceType } from '../types'

enum ActivityType {
	PLAYING = 0,
	STREAMING = 1,
	LISTENING = 2,
	COMPETING = 5,
}

class PluginManager {
	private static instance: PluginManager
	private updateTimer?: any
	private reconnectTimer?: any
	private consecutiveFailures = 0
	private isReconnecting = false
	private _currentActivity?: Activity
	private _lastUpdateTime = 0

	private constructor() {
		// singleton pattern
	}

	public static getInstance(): PluginManager {
		if (!PluginManager.instance) {
			PluginManager.instance = new PluginManager()
		}
		return PluginManager.instance
	}

	// Check for new tracks and update Discord status when something changes
	private async updateActivity() {
		if (pluginState.pluginStopped) {
			setDebugInfo('componentMountErrors', [
				...(debugInfo.componentMountErrors || []),
				'Plugin is stopped, skipping update',
			])
			try {
				this.stopUpdates()
			} catch (e) {
				setDebugInfo('lastError', e as Error)
			}
			return
		}

		const settings = getSettings()
		const serviceName = serviceFactory.getCurrentService().getServiceName()

		// Track current service for debug
		setDebugInfo('currentService', settings.service)

		try {
			// Check if any ignored app is active
			if (settings.ignoreList && settings.ignoreList.length > 0) {
				const ignoredActivity = getSelfPresenceStore()?.findActivity(
					(act: any) => {
						if (!act.name) return false
						return settings.ignoreList.some((ignoredApp: string) =>
							act.name.toLowerCase().includes(ignoredApp.toLowerCase()),
						)
					},
				)

				if (ignoredActivity) {
					setDebugInfo('ignoredActivity', ignoredActivity.name)
					clearActivity()
					return
				}
			}

			incrementApiCall()
			incrementConnectionAttempt()
			const lastTrack = await serviceFactory
				.getCurrentService()
				.fetchLatestScrobble()
			setDebugInfo('lastTrack', lastTrack)

			if (!lastTrack.nowPlaying) {
				setDebugInfo('lastTrack_nowPlaying', false)
				// Forget the track so it is re-sent once playback resumes
				pluginState.lastTrackUrl = undefined
				clearActivity()
				return
			}

			// use simple URL comparison like Last.fm plugin
			if (pluginState.lastTrackUrl === lastTrack.url) {
				recordSuccessfulUpdate()
				this.consecutiveFailures = 0
				return
			}

			setDebugInfo('componentMountErrors', [
				...(debugInfo.componentMountErrors || []),
				`Track changed: ${lastTrack.artist} - ${lastTrack.name}`,
			])

			// set up timestamps for the track
			let activityTimestamps:
				| { start: number | string; end?: number | string }
				| undefined
			if (lastTrack.nowPlaying && settings.showTimestamp && lastTrack.from) {
				// figure out when this track actually started
				const now = getCurrentTimestamp()
				let startTime = lastTrack.from

				// if the timestamp is way old, estimate when it started
				if (startTime < now - 3600) {
					// more than an hour old - probably wrong
					if (lastTrack.duration && lastTrack.duration > 0) {
						// guess we're about 10% in or 30 seconds, whatever's smaller
						const estimatedElapsed = Math.min(lastTrack.duration * 0.1, 30)
						startTime = now - estimatedElapsed
					} else {
						startTime = now
					}
				}

				activityTimestamps = {
					start: startTime * 1000,
				}

				if (lastTrack.to) {
					activityTimestamps.end = lastTrack.to * 1000
				}
			}

			const activity: Activity = {
				name: settings.appName || Constants.DEFAULT_APP_NAME,
				flags: 0,
				type: settings.listeningTo
					? ActivityType.LISTENING
					: ActivityType.PLAYING,
				details: lastTrack.name,
				state: `${lastTrack.artist}`,
				status_display_type: 1,
				application_id: Constants.APPLICATION_ID,
			}

			// replace template variables in app name if user is using them
			if (activity.name.includes('{{')) {
				const variables = {
					artist: lastTrack.artist,
					name: lastTrack.name,
					album: lastTrack.album,
					service: serviceName,
				}

				for (const [key, value] of Object.entries(variables)) {
					activity.name = activity.name.replace(
						new RegExp(`{{${key}}`, 'g'),
						value || '',
					)
				}
			}

			// add the timestamps we figured out
			if (activityTimestamps) {
				activity.timestamps = activityTimestamps
			}

			// set up album art and tooltip text
			if (lastTrack.album || lastTrack.albumArt) {
				const assetUrls = lastTrack.albumArt ? [lastTrack.albumArt] : []
				const assets = await fetchAsset(assetUrls)

				// Only use album art if available
				const largeImageAsset = assets[0]

				if (largeImageAsset) {
					activity.assets = {
						large_image: largeImageAsset,
					}

					// Build tooltip text based on settings
					if (settings.showLargeText) {
						let largeText = ''

						if (settings.showAlbumInTooltip && lastTrack.album) {
							largeText += `on ${lastTrack.album}`
						}

						if (settings.showDurationInTooltip && lastTrack.duration) {
							const durationText = formatDuration(lastTrack.duration)
							if (largeText) {
								largeText += ` \u2022 ${durationText}`
							} else {
								largeText = durationText
							}
						}

						if (largeText) {
							activity.assets.large_text = largeText
						}
					}
				} else if (
					lastTrack.album &&
					settings.showLargeText &&
					settings.showAlbumInTooltip
				) {
					activity.assets = {
						large_text: `on ${lastTrack.album}`,
					}
				}
			}

			setDebugInfo('lastActivity', activity)

			await sendRequest(activity)
			pluginState.lastTrackUrl = lastTrack.url
			this._currentActivity = activity
			pluginState.lastActivity = activity
			this.consecutiveFailures = 0
			this._lastUpdateTime = getCurrentTimestamp()
			recordSuccessfulUpdate()
		} catch (error) {
			setDebugInfo('lastError', error as Error)
			recordServiceError(
				settings.service as ServiceType,
				(error as Error).message,
			)
			this.handleError(error as Error)
		}
	}

	private handleError(error: Error) {
		this.consecutiveFailures++
		setDebugInfo('lastError', error)

		if (this.consecutiveFailures >= Constants.MAX_RETRY_ATTEMPTS) {
			this.startReconnection()
		}
	}

	private startReconnection() {
		if (this.isReconnecting) return

		this.isReconnecting = true
		this.stopUpdates()

		this.reconnectTimer = setInterval(() => {
			this.initialize()
				.then(() => {
					this.stopReconnection()
				})
				.catch(error => {
					this.handleError(error as Error)
				})
		}, Constants.RETRY_DELAY)
	}

	private stopReconnection() {
		if (this.reconnectTimer) {
			clearInterval(this.reconnectTimer)
			this.reconnectTimer = undefined
		}
		this.isReconnecting = false
		this.consecutiveFailures = 0
	}

	// clean up all timers
	private stopUpdates() {
		if (this.updateTimer) {
			clearInterval(this.updateTimer)
			this.updateTimer = undefined
		}
	}

	// start everything up
	public async initialize() {
		if (pluginState.pluginStopped) {
			throw new Error('Plugin is stopped')
		}

		const serviceName = serviceFactory.getCurrentService().getServiceName()
		const isValid = await serviceFactory.validateCurrentService()
		if (!isValid) {
			throw new Error(`Invalid credentials for ${serviceName}`)
		}

		this.stopUpdates()

		// check right away in case something is already playing
		await this.updateActivity()

		const currentService = getSettings().service

		let interval: number
		if (currentService === 'mediasession') {
			// MediaSession reads local Android state — no external API to rate limit.
			// Ignore the user's Update Interval entirely and poll at a fixed fast
			// tick (a literal 0ms timer would busy-loop the JS thread).
			interval = 1_000
		} else {
			let minInterval: number = Constants.MIN_UPDATE_INTERVAL
			if (currentService === 'librefm') {
				minInterval = Constants.LIBREFM_MIN_UPDATE_INTERVAL
			}
			interval = Math.max(
				(Number(getSettings().timeInterval) || Number(DEFAULTS.timeInterval)) *
					1000,
				minInterval * 1000,
			)
		}

		this.updateTimer = setInterval(() => this.updateActivity(), interval)
	}

	// stop everything and clean up
	public stop() {
		if (pluginState.pluginStopped) {
			return // already stopped
		}

		pluginState.pluginStopped = true

		try {
			this.stopUpdates()
			this.stopReconnection()
			clearActivity()
		} catch (_error) {
			// don't let cleanup errors break things
		}
	}

	// change to a different scrobble service
	public async switchService(_newService: string) {
		if (pluginState.pluginStopped) {
			return
		}

		// stop what we're doing first
		const wasRunning = !pluginState.pluginStopped
		this.stop()

		try {
			// clear cache so we get fresh service instances
			serviceFactory.clearCache()

			// Reset track state when switching services
			pluginState.lastTrackUrl = undefined
			this._currentActivity = undefined
			this._lastUpdateTime = 0

			// start back up with the new service
			if (wasRunning) {
				pluginState.pluginStopped = false
				await this.initialize()
			}
		} catch (_error) {
			// Handle error
		}
	}

	// get info about what's currently happening
	public getStatus() {
		const serviceName = serviceFactory.getCurrentService().getServiceName()
		return {
			running: !pluginState.pluginStopped,
			service: serviceName,
			consecutiveFailures: this.consecutiveFailures,
			isReconnecting: this.isReconnecting,
			lastTrackUrl: pluginState.lastTrackUrl,
			updateInterval: this.updateTimer ? 'Active' : 'Inactive',
			currentActivity: this._currentActivity,
			lastUpdateTime: this._lastUpdateTime,
		}
	}
}

// expose the manager functions
const manager = PluginManager.getInstance()
export const initialize = () => manager.initialize()
export const stop = () => manager.stop()
export const switchService = (service: string) => manager.switchService(service)
export const getStatus = () => manager.getStatus()

// Connection status tracking
let connectionAttempts = 0
const MAX_CONNECTION_ATTEMPTS = 3
const RECONNECT_DELAY = 5000

export async function tryInitialize() {
	try {
		await initialize()
		connectionAttempts = 0
	} catch (_error) {
		connectionAttempts++

		if (connectionAttempts < MAX_CONNECTION_ATTEMPTS) {
			setTimeout(tryInitialize, RECONNECT_DELAY)
		}
	}
}
