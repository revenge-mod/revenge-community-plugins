import Page from '@revenge-mod/components/Page'
import { ScrollView } from 'react-native'
import { EmptyState } from '../components/common'
import { RoleList } from '../components/roleScreens'
import { readHandoff } from '../lib/navigation'
import { getSortedRoles } from '../lib/stores'

interface GuildRolesPageProps {
	guildId?: string
}

/** Guild roles on a pushed page; a sheet caps at half the screen. */
export function GuildRolesPage(props: GuildRolesPageProps) {
	// Params can be dropped on push; the handoff is reliable.
	const guildId = props?.guildId ?? readHandoff().guildId

	if (typeof guildId !== 'string') {
		return (
			<Page>
				<EmptyState
					title="No server loaded"
					subtitle="Reopen this page from a server in the server list."
				/>
			</Page>
		)
	}

	return <GuildRoles guildId={guildId} />
}

/** Page body, split out so its hooks run on every render. */
function GuildRoles({ guildId }: { guildId: string }) {
	const roles = getSortedRoles(guildId)

	return (
		<ScrollView>
			<Page>
				{roles.length ? (
					<RoleList guildId={guildId} roles={roles} stacking="stack" />
				) : (
					<EmptyState
						title="No roles found"
						subtitle="This server's roles have not loaded yet."
					/>
				)}
			</Page>
		</ScrollView>
	)
}
