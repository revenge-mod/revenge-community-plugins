import type { MultiScrobblerStorage } from './types'

export const DEFAULTS: MultiScrobblerStorage = {
	username: '',
	apiKey: '',
	librefmUsername: '',
	librefmApiKey: '',
	listenbrainzUsername: '',
	listenbrainzToken: '',
	appName: 'Music',
	timeInterval: 5,
	showTimestamp: true,
	listeningTo: true,
	showLargeText: true,
	showAlbumInTooltip: true,
	showDurationInTooltip: true,
	ignoreYouTubeMusic: false,
	service: 'lastfm',
	ignoreList: [],
	verboseLogging: false,
}
