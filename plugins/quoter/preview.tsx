/** @jsxImportSource . */
import {
	AlertActionCreators,
	ToastActionCreators,
} from '@revenge-mod/discord/actions'
import { Design } from '@revenge-mod/discord/design'
import { lookupModule } from '@revenge-mod/modules/finders'
import {
	withDependencies,
	withName,
	withProps,
} from '@revenge-mod/modules/finders/filters'
import {
	ReactJSXRuntimeModuleId,
	ReactModuleId,
	ReactNativeModuleId,
} from '@revenge-mod/react'
import { Fragment, useEffect, useMemo, useState } from 'react'
import {
	ActivityIndicator,
	Image,
	ScrollView,
	useWindowDimensions,
	View,
} from 'react-native'
import { hasReply } from './lib/content'
import {
	buildFileName,
	buildPayload,
	getMessageChannelId,
	getReply,
} from './lib/quote'
import { buildRendererHtml } from './lib/renderer'
import { sendQuoteAttachment } from './lib/send'
import { useQuoterEnabled, useQuoterSettings } from './storage'
import type { ComponentType } from 'react'
import type {
	QuoteMessage,
	RenderedQuote,
	WebViewModule,
	WebViewProps,
} from './types'

const KEY = 'revenge-next.quoter.preview'
export function closeQuoteModal() {
	AlertActionCreators.dismissAlert(KEY)
}
export function openQuoteModal(message: QuoteMessage) {
	AlertActionCreators.openAlert(KEY, <QuoteAlert message={message} />)
}
function QuoteAlert({ message }: { message: QuoteMessage }) {
	const { height } = useWindowDimensions()
	const settings = useQuoterSettings()
	const enabled = useQuoterEnabled()
	const [WebView] = useState(() => {
		const existing = lookupModule(withProps<WebViewModule>('WebView'), {
			initialize: false,
		})[0]?.WebView
		if (existing) return existing
		const [, commandsId] = lookupModule(withName('codegenNativeCommands'))
		if (commandsId === undefined) return undefined
		// The Android forwardRef wrapper is lazy; match its native-command dependency before initializing it.
		return lookupModule(
			withDependencies([
				ReactModuleId,
				ReactNativeModuleId,
				ReactJSXRuntimeModuleId,
				commandsId,
				null,
				null,
				null,
				null,
				null,
			]).and(withProps('render', 'isFileUploadSupported')),
		)[0] as ComponentType<WebViewProps> | undefined
	})

	const [result, setResult] = useState<{
		id: string
		image: RenderedQuote
		ready: boolean
	}>()
	const [error, setError] = useState('')
	const [includeReply, setIncludeReply] = useState(false)
	const replyAvailable = !!getReply(message)
	const [draft, setDraft] = useState(settings.watermark)
	useEffect(() => {
		if (draft === settings.watermark) return
		const timer = setTimeout(
			() => settings.updateSettings({ watermark: draft }),
			500,
		)
		return () => clearTimeout(timer)
	}, [draft, settings.watermark])
	const { id, html } = useMemo(() => {
		const id = `${Date.now()}-${Math.random()}`
		return {
			id,
			html: buildRendererHtml({
				...buildPayload(message, settings, includeReply),
				renderId: id,
			}),
		}
	}, [
		message,
		settings.grayscale,
		settings.showWatermark,
		settings.watermark,
		settings.quotationMarks,
		settings.allowMedia,
		settings.allowReplies,
		includeReply,
	])
	useEffect(() => {
		setError('')
	}, [id])
	const image = result?.id === id ? result.image : undefined
	const ready = result?.id === id && result.ready
	const send = async () => {
		if (!image || !ready || !enabled || draft !== settings.watermark) return
		const channelId = getMessageChannelId(message)
		if (!channelId) {
			setError('Unable to resolve channel.')
			return
		}
		closeQuoteModal()
		try {
			await sendQuoteAttachment(channelId, image, buildFileName(message))
			ToastActionCreators.open('QUOTER_SENT', { text: 'Quote sent.' })
		} catch (error) {
			ToastActionCreators.open('QUOTER_FAILED', {
				text: `Failed to send quote: ${error instanceof Error ? error.message : String(error)}`,
				variant: 'critical',
			})
		}
	}
	return (
		<Design.AlertModal
			title="Create Quote"
			content="Preview generated from selected message"
			extraContent={
				<ScrollView
					style={{ maxHeight: Math.max(160, height - 280) }}
					contentContainerStyle={{ paddingTop: 10, paddingBottom: 4 }}
				>
					<View
						style={{
							width: '100%',
							aspectRatio: image ? image.width / image.height : 2,
							maxHeight: 260,
							alignSelf: 'center',
							borderRadius: 14,
							overflow: 'hidden',
							backgroundColor: '#0f0f0f',
							justifyContent: 'center',
							alignItems: 'center',
						}}
					>
						{image ? (
							<Image
								source={{ uri: image.dataUrl }}
								resizeMode="contain"
								style={{ width: '100%', height: '100%' }}
							/>
						) : !WebView ? (
							<Design.Text variant="text-xs/medium">
								WebView unavailable. Cannot render quote.
							</Design.Text>
						) : null}
						{WebView && enabled && !ready && !error && (
							<View
								pointerEvents="none"
								style={{
									position: 'absolute',
									left: 0,
									top: 0,
									right: 0,
									bottom: 0,
									alignItems: 'center',
									justifyContent: 'center',
								}}
							>
								<View
									style={{
										backgroundColor: '#0009',
										borderRadius: 24,
										padding: 8,
									}}
								>
									<ActivityIndicator
										size="small"
										color="#fff"
										accessibilityLabel="Preparing quote"
									/>
								</View>
							</View>
						)}
					</View>
					{WebView && enabled ? (
						<WebView
							key={id}
							source={{
								html,
								baseUrl: includeReply
									? 'file:///android_asset/'
									: 'https://localhost',
							}}
							javaScriptEnabled
							onMessage={event => {
								try {
									const data = JSON.parse(event.nativeEvent.data)
									if (data.renderId !== id) return
									if (
										(data.type === 'result' || data.type === 'preview') &&
										typeof data.dataUrl === 'string' &&
										/^data:image\/(png|gif);base64,/.test(data.dataUrl) &&
										data.width > 0 &&
										data.height > 0
									) {
										setResult({
											id,
											ready: data.type === 'result',
											image: {
												dataUrl: data.dataUrl,
												width: data.width,
												height: data.height,
											},
										})
									} else if (data.type === 'error')
										setError(String(data.message))
								} catch {
									setError('Invalid renderer response.')
								}
							}}
							onError={() => setError('Could not load the quote renderer.')}
							style={{
								width: 1,
								height: 1,
								opacity: 0,
								position: 'absolute',
								left: -9999,
								top: -9999,
							}}
						/>
					) : null}
					{!!error && (
						<Design.Text color="text-feedback-critical">{error}</Design.Text>
					)}
					{settings.allowReplies && hasReply(message) && (
						<Design.TableSwitchRow
							label="Include reply"
							subLabel={
								replyAvailable
									? 'Show the referenced message above the quote.'
									: 'The referenced message is unavailable.'
							}
							disabled={!replyAvailable}
							value={includeReply}
							onValueChange={setIncludeReply}
						/>
					)}
					<Design.TableSwitchRow
						label="Quotation marks"
						value={settings.quotationMarks}
						onValueChange={quotationMarks =>
							settings.updateSettings({ quotationMarks })
						}
					/>
					<Design.TableSwitchRow
						label="Grayscale"
						value={settings.grayscale}
						onValueChange={(grayscale: boolean) =>
							settings.updateSettings({ grayscale })
						}
					/>
					<Design.TableSwitchRow
						label="Show Watermark"
						value={settings.showWatermark}
						onValueChange={(showWatermark: boolean) =>
							settings.updateSettings({ showWatermark })
						}
					/>
					{settings.showWatermark && (
						<Design.TextInput
							label="Watermark text"
							value={draft}
							maxLength={32}
							onChange={setDraft}
						/>
					)}
				</ScrollView>
			}
			actions={
				<Fragment>
					<Design.AlertActionButton
						text="Send"
						variant="primary"
						disabled={!ready || !enabled || draft !== settings.watermark}
						onPress={() => void send()}
					/>
					<Design.AlertActionButton
						text="Cancel"
						variant="secondary"
						onPress={closeQuoteModal}
					/>
				</Fragment>
			}
		/>
	)
}
