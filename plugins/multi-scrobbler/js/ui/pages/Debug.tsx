import {
	logComponentError,
	logComponentMount,
	useDebugInfo,
} from '../../lib/debug'

export default function Debug() {
	const React = revenge.react.React
	const { Page } =
		revenge.components as typeof import('@revenge-mod/components')
	const { ScrollView } = revenge.react.ReactNative
	const { TableRowGroup, TableRow } = revenge.discord.design.Design

	React.useEffect(() => {
		logComponentMount('Debug')
	}, [])

	try {
		const debugInfo = useDebugInfo()

		if (!debugInfo) {
			logComponentError('Debug', 'useDebugInfo returned null or undefined')
			return (
				<Page>
					<ScrollView>
						<TableRowGroup>
							<TableRow
								label="No debug information available"
								subLabel="Debug data could not be loaded"
							/>
						</TableRowGroup>
					</ScrollView>
				</Page>
			)
		}

		const parsed = JSON.parse(debugInfo)

		return (
			<Page>
				<ScrollView>
					<TableRowGroup title="Status">
						<TableRow
							label="Current Service"
							subLabel={parsed.status?.currentService || 'unknown'}
						/>
						<TableRow
							label="Last Successful Update"
							subLabel={parsed.status?.lastSuccessfulUpdate || 'never'}
						/>
						<TableRow
							label="Connection Attempts"
							subLabel={String(parsed.status?.connectionAttempts || 0)}
						/>
						<TableRow
							label="API Call Count"
							subLabel={String(parsed.status?.apiCallCount || 0)}
						/>
					</TableRowGroup>

					<TableRowGroup title="Credential Validation">
						<TableRow
							label="Last.fm"
							subLabel={
								parsed.lastCredentialValidation?.lastfm ? 'Valid' : 'Invalid'
							}
						/>
						<TableRow
							label="Libre.fm"
							subLabel={
								parsed.lastCredentialValidation?.librefm ? 'Valid' : 'Invalid'
							}
						/>
						<TableRow
							label="ListenBrainz"
							subLabel={
								parsed.lastCredentialValidation?.listenbrainz
									? 'Valid'
									: 'Invalid'
							}
						/>
					</TableRowGroup>

					<TableRowGroup title="Errors">
						<TableRow
							label="Total Component Errors"
							subLabel={String(parsed.errors?.totalComponentErrors || 0)}
						/>
						<TableRow
							label="Last Error"
							subLabel={parsed.errors?.lastError || 'none'}
						/>
						<TableRow
							label="Last.fm Errors"
							subLabel={String(parsed.errors?.serviceErrors?.lastfm || 0)}
						/>
						<TableRow
							label="Libre.fm Errors"
							subLabel={String(parsed.errors?.serviceErrors?.librefm || 0)}
						/>
						<TableRow
							label="ListenBrainz Errors"
							subLabel={String(parsed.errors?.serviceErrors?.listenbrainz || 0)}
						/>
					</TableRowGroup>

					<TableRowGroup title="Last Track">
						<TableRow
							label="Artist"
							subLabel={parsed.lastTrack?.artist || '—'}
						/>
						<TableRow label="Track" subLabel={parsed.lastTrack?.name || '—'} />
						<TableRow
							label="Now Playing"
							subLabel={parsed.lastTrack?.nowPlaying ? 'Yes' : 'No'}
						/>
						<TableRow
							label="Service"
							subLabel={parsed.lastTrack?.service || '—'}
						/>
					</TableRowGroup>

					<TableRowGroup title="Runtime">
						<TableRow label="Timestamp" subLabel={parsed.timestamp || '—'} />
						<TableRow
							label="Has Reanimated Error"
							subLabel={parsed.hasReanimatedError ? 'Yes' : 'No'}
						/>
						<TableRow
							label="Total Errors"
							subLabel={String(parsed.totalErrors || 0)}
						/>
					</TableRowGroup>
				</ScrollView>
			</Page>
		)
	} catch (error) {
		logComponentError('Debug', error)
		return (
			<Page>
				<ScrollView>
					<TableRowGroup>
						<TableRow
							label="Error loading debug information"
							subLabel={String(error)}
						/>
					</TableRowGroup>
				</ScrollView>
			</Page>
		)
	}
}
