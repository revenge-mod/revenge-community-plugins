import type { Activity, ServiceType, Track } from '../types'

const debugInfo = {} as {
	lastActivity?: Activity
	lastTrack?: Track
	lastAPIResponse?: any
	ignoreList?: boolean
	componentMountErrors?: string[]
	lastReanimatedError?: string
	componentMountCount?: number
	settingsLoadAttempts?: number
	lastNavigationError?: string
	lastError?: Error
	lastUpdateError?: any
	lastTrack_nowPlaying?: boolean
	ignoredActivity?: string | boolean
	serviceErrors?: Record<ServiceType, string[]>
	apiCallCount?: number
	lastSuccessfulUpdate?: string
	currentService?: ServiceType
	connectionAttempts?: number
	lastCredentialValidation?: Record<ServiceType, boolean>
}

// set up debug tracking
debugInfo.componentMountErrors = []
debugInfo.componentMountCount = 0
debugInfo.settingsLoadAttempts = 0
debugInfo.serviceErrors = {
	lastfm: [],
	librefm: [],
	listenbrainz: [],
	mediasession: [],
}
debugInfo.apiCallCount = 0
debugInfo.connectionAttempts = 0
debugInfo.lastCredentialValidation = {
	lastfm: false,
	librefm: false,
	listenbrainz: false,
	mediasession: false,
}

// subscribers for reactivity
let subscribers: (() => void)[] = []

// Export debugInfo for direct access
export { debugInfo }

function notifySubscribers() {
	subscribers.forEach(cb => cb())
}

function subscribe(cb: () => void) {
	subscribers.push(cb)
	return () => {
		subscribers = subscribers.filter(s => s !== cb)
	}
}

const log = (..._args: any[]) => {}
const logError = (..._args: any[]) => {}

export function setDebugInfo(
	key: keyof typeof debugInfo,
	value: (typeof debugInfo)[typeof key],
) {
	;(debugInfo[key] as any) = value

	// log the important stuff
	if (key === 'lastError' && value) {
		logError('Error recorded:', (value as Error).message)
	} else if (key === 'lastTrack' && value) {
		log(
			'Track updated:',
			`${(value as Track).artist} - ${(value as Track).name}`,
		)
	} else if (key === 'currentService' && value) {
		log('Service changed to:', value)
	}

	notifySubscribers()
}

export function incrementApiCall() {
	debugInfo.apiCallCount = (debugInfo.apiCallCount || 0) + 1
	log(`API call count: ${debugInfo.apiCallCount}`)
	notifySubscribers()
}

export function recordServiceError(service: ServiceType, error: string) {
	debugInfo.serviceErrors = debugInfo.serviceErrors || {
		lastfm: [],
		librefm: [],
		listenbrainz: [],
		mediasession: [],
	}
	debugInfo.serviceErrors[service] = debugInfo.serviceErrors[service] || []
	debugInfo.serviceErrors[service].push(`${new Date().toISOString()}: ${error}`)

	// don't let error logs get too long
	if (debugInfo.serviceErrors[service].length > 10) {
		debugInfo.serviceErrors[service] =
			debugInfo.serviceErrors[service].slice(-10)
	}

	logError(`${service} error:`, error)
	notifySubscribers()
}

export function recordCredentialValidation(
	service: ServiceType,
	isValid: boolean,
) {
	debugInfo.lastCredentialValidation = debugInfo.lastCredentialValidation || {
		lastfm: false,
		librefm: false,
		listenbrainz: false,
		mediasession: false,
	}
	debugInfo.lastCredentialValidation[service] = isValid
	log(`${service} credentials validation:`, isValid ? 'Valid' : 'Invalid')
	notifySubscribers()
}

export function recordSuccessfulUpdate() {
	debugInfo.lastSuccessfulUpdate = new Date().toISOString()
	log('Successful update recorded at:', debugInfo.lastSuccessfulUpdate)
	notifySubscribers()
}

export function incrementConnectionAttempt() {
	debugInfo.connectionAttempts = (debugInfo.connectionAttempts || 0) + 1
	log(`Connection attempt: ${debugInfo.connectionAttempts}`)
	notifySubscribers()
}

export function resetConnectionAttempts() {
	debugInfo.connectionAttempts = 0
	log('Connection attempts reset')
	notifySubscribers()
}

export function logComponentMount(componentName: string) {
	debugInfo.componentMountCount = (debugInfo.componentMountCount || 0) + 1
	log(
		`Component mounted: ${componentName} (count: ${debugInfo.componentMountCount})`,
	)
	notifySubscribers()
}

export function logComponentError(componentName: string, error: any) {
	const errorMessage = `${componentName}: ${String(error)}`
	debugInfo.componentMountErrors = debugInfo.componentMountErrors || []
	debugInfo.componentMountErrors.push(errorMessage)

	if (String(error).includes('Reanimated')) {
		debugInfo.lastReanimatedError = errorMessage
	}

	logError(`Component error in ${componentName}:`, error)
	notifySubscribers()
}

export function logNavigationError(error: any) {
	debugInfo.lastNavigationError = String(error)
	logError('Navigation error:', error)
	notifySubscribers()
}

export function incrementSettingsLoad() {
	debugInfo.settingsLoadAttempts = (debugInfo.settingsLoadAttempts || 0) + 1
	log(`Settings load attempt: ${debugInfo.settingsLoadAttempts}`)
	notifySubscribers()
}

export function getDebugSummary(): string {
	const summary = {
		status: {
			currentService: debugInfo.currentService || 'unknown',
			lastSuccessfulUpdate: debugInfo.lastSuccessfulUpdate || 'never',
			connectionAttempts: debugInfo.connectionAttempts || 0,
			apiCallCount: debugInfo.apiCallCount || 0,
		},
		validation: debugInfo.lastCredentialValidation,
		errors: {
			totalComponentErrors: debugInfo.componentMountErrors?.length || 0,
			lastError: debugInfo.lastError?.message || 'none',
			serviceErrors: Object.fromEntries(
				Object.entries(debugInfo.serviceErrors || {}).map(
					([service, errors]) => [service, errors.length],
				),
			),
		},
		lastTrack: debugInfo.lastTrack
			? {
					artist: debugInfo.lastTrack.artist,
					name: debugInfo.lastTrack.name,
					nowPlaying: debugInfo.lastTrack.nowPlaying,
					service: debugInfo.currentService,
				}
			: null,
	}

	return JSON.stringify(summary, null, 2)
}

export function useDebugInfo(): string {
	try {
		const React = revenge.react.React
		const [, forceUpdate] = React.useReducer((x: number) => ~x, 0)

		// subscribe to debug info changes
		React.useEffect(() => {
			const unsubscribe = subscribe(() => {
				forceUpdate()
			})
			return unsubscribe
		}, [])

		// add some extra runtime info
		const runtimeInfo = {
			...debugInfo,
			timestamp: new Date().toISOString(),
			reactVersion: '18.0.0', // we can't check the real version here
			hasReanimatedError: !!debugInfo.lastReanimatedError,
			totalErrors: debugInfo.componentMountErrors?.length || 0,
			summary: getDebugSummary(),
		}

		return JSON.stringify(runtimeInfo, null, 4)
	} catch (error) {
		logError('Error in useDebugInfo:', error)
		return JSON.stringify(
			{
				error: 'Failed to generate debug info',
				errorMessage: String(error),
				timestamp: new Date().toISOString(),
			},
			null,
			4,
		)
	}
}
