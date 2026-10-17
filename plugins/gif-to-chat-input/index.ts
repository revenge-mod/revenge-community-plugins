import { getModules } from '@revenge-mod/modules/finders'
import { withProps } from '@revenge-mod/modules/finders/filters'
import { instead } from '@revenge-mod/patcher'

interface ChatInputs {
	getBestActiveInputForChannelId(
		channelId: string,
	): { insertText(text: string): void } | undefined
}

interface MessageActions {
	sendMessage(
		channelId: string,
		message: { content: string },
		clearDraft: boolean,
		options?: { location?: string },
	): unknown
	receiveMessage: unknown
}

export default plugin({
	start({ cleanup, plugin }) {
		cleanup(
			getModules(
				withProps<ChatInputs>('getBestActiveInputForChannelId'),
				inputs => {
					cleanup(
						getModules(
							withProps<MessageActions>('sendMessage', 'receiveMessage'),
							messages => {
								cleanup(
									instead(messages, 'sendMessage', function (args, original) {
										const [channelId, message, , options] = args
										if (options?.location !== 'gif_reply')
											return Reflect.apply(original, this, args)

										const input =
											inputs.getBestActiveInputForChannelId(channelId)
										if (!input) {
											plugin.reportError(
												'Could not find the chatbox. GIF was not sent.',
											)
											return
										}
										input.insertText(message.content)
									}),
								)
							},
						),
					)
				},
			),
		)
	},
})
