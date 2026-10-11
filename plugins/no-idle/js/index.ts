import { onFluxEventDispatched } from '@revenge-mod/discord/flux'

export default plugin({
	start({ cleanup }) {
		cleanup(
			onFluxEventDispatched('IDLE', payload => {
				payload.idle = false
				return payload
			}),
		)
	},
})
