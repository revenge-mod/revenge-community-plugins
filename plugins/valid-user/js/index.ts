import { ToastActionCreators } from '@revenge-mod/discord/actions'
import { Dispatcher } from '@revenge-mod/discord/common/flux'
import { ImportTrackerModuleId } from '@revenge-mod/discord/common/import-tracker'
import { LoggerModuleId } from '@revenge-mod/discord/common/logger'
import { Stores, withStoreName } from '@revenge-mod/discord/flux'
import { Clipboard } from '@revenge-mod/externals/react-native-clipboard'
import { getModules, lookupModule } from '@revenge-mod/modules/finders'
import {
	withDependencies,
	withName,
	withProps,
} from '@revenge-mod/modules/finders/filters'
import { instead } from '@revenge-mod/patcher'
import type { DiscordModules } from '@revenge-mod/discord/types'

const NO_ACCESS_TITLE = "You don't have access to this link."
const NO_ACCESS_BODY = "This link is to a user you don't have access to."
const SNOWFLAKE = /^\d{17,20}$/

type ProfileSheet = (props: { userId: string }) => void

type Alerts = { show(props: unknown): unknown }

type Http = {
	HTTP: { get(options: { url: string }): Promise<{ body?: unknown }> }
}

interface Message {
	id: string
	content?: string
}

async function cacheUser(userId: string) {
	http ??= lookupModule(withProps('HTTP', 'post'))[0] as Http | undefined
	if (!http) throw new Error('HTTP module not found')

	const { body } = await http.HTTP.get({ url: `/users/${userId}` })
	Dispatcher.dispatch({ type: 'USER_UPDATE', user: body })
}

const REDRAW_DELAY = 110
const redraws = new Set<ReturnType<typeof setTimeout>>()

// Messages keep the mention they were first rendered with, so the cached user alone changes nothing.
// A temporary content change followed by the real content makes the open channel render them again.
function redrawMentions(userId: string) {
	const channelId = (
		Stores.SelectedChannelStore as DiscordModules.Flux.Store<{
			getChannelId(): string | undefined
		}>
	).getChannelId()
	if (!channelId) return

	const { getMessages } = Stores.MessageStore as DiscordModules.Flux.Store<{
		getMessages(channelId: string): { toArray(): Message[] }
	}>
	const mention = new RegExp(`<@!?${userId}>`)

	for (const { id, content } of getMessages(channelId).toArray()) {
		if (!content || !mention.test(content)) continue

		Dispatcher.dispatch({
			type: 'MESSAGE_UPDATE',
			message: { id, channel_id: channelId, content: `${content}\u200b` },
		})
		const timer = setTimeout(() => {
			redraws.delete(timer)
			Dispatcher.dispatch({
				type: 'MESSAGE_UPDATE',
				message: { id, channel_id: channelId, content },
			})
		}, REDRAW_DELAY)
		redraws.add(timer)
	}
}

let profileSheet: ProfileSheet | undefined
let http: Http | undefined

function findProfileSheet(): ProfileSheet | undefined {
	const named = withName('showUserProfileActionSheet')
	const { ordered, relative } = withDependencies
	const userStoreId = lookupModule(withStoreName('UserStore'))[1]

	try {
		const exact = lookupModule(
			named.and(
				withDependencies(
					ordered([
						LoggerModuleId,
						userStoreId,
						relative(1),
						relative(2),
						relative(3),
						ImportTrackerModuleId,
					]),
				),
			),
		)[0]
		if (exact) return exact as ProfileSheet
	} catch {
		// the exact match depends on Discord's module layout, the name alone is the fallback
	}

	return lookupModule(named)[0] as ProfileSheet | undefined
}

function isNoAccessAlert(
	props: unknown,
): props is { onConfirmSecondary(): void } {
	return (
		typeof props === 'object' &&
		props !== null &&
		'title' in props &&
		props.title === NO_ACCESS_TITLE &&
		'body' in props &&
		props.body === NO_ACCESS_BODY &&
		'onConfirmSecondary' in props &&
		typeof props.onConfirmSecondary === 'function'
	)
}

// The alert never receives the ID as a prop, only its "Copy User ID" handler knows it.
// Run that handler with the clipboard write and its toast swallowed to read the ID out.
function readUserId(copyUserId: () => void) {
	let copied: string | undefined
	const restore = [
		instead(Clipboard, 'setString', ([text]: [string]) => {
			copied = text
		}),
		instead(ToastActionCreators, 'open', () => {}),
	]

	try {
		copyUserId()
	} finally {
		for (const undo of restore) undo()
	}

	return copied && SNOWFLAKE.test(copied) ? copied : undefined
}

export default plugin({
	start({ cleanup, plugin }) {
		cleanup(() => {
			for (const timer of redraws) clearTimeout(timer)
			redraws.clear()
		})
		cleanup(
			getModules(withProps('show', 'close', 'openLazy', 'confirm'), alerts => {
				cleanup(
					instead(alerts as Alerts, 'show', ([props], orig) => {
						try {
							if (isNoAccessAlert(props)) {
								const userId = readUserId(props.onConfirmSecondary)
								profileSheet ??= findProfileSheet()
								if (userId && profileSheet) {
									profileSheet({ userId })
									cacheUser(userId)
										.then(() => redrawMentions(userId))
										.catch(plugin.reportError)
									return
								}
							}
						} catch (error) {
							plugin.reportError(error)
						}

						return orig(props)
					}),
				)
			}),
		)
	},
})
