import { getAssetIdByName } from "@revenge-mod/assets";
import { Page } from "@revenge-mod/components";
import { Design } from "@revenge-mod/discord/design";
import { ReactNative } from "@revenge-mod/react";
import type { PluginApi } from "@revenge-mod/plugins/types";

export const DEFAULTS = {
	autoConfirmMessage: true,
	autoConfirmEmbed: true,
	autoConfirmAttachment: true,
	autoConfirmMaskedLink: false,
	autoConfirmChannel: false,
	autoConfirmServer: false,
	autoConfirmGroup: false,
	autoConfirmRole: false,
	autoConfirmFriend: false,
	autoConfirmBlock: false,
	autoConfirmIgnore: false,
	autoConfirmCancelRequest: false,
	autoConfirmVoiceCall: false,
	autoConfirmPin: false,
};

export type Settings = typeof DEFAULTS;

const GROUPS: { title: string; rows: [key: keyof Settings, label: string, sub: string, icon: string][] }[] = [
	{
		title: "Messages",
		rows: [
			["autoConfirmMessage", "Messages", "Deletes messages without confirmation", "ChatIcon"],
			["autoConfirmEmbed", "Embeds", "Deletes embeds without confirmation", "EmbedIcon"],
			["autoConfirmAttachment", "Attachments", "Removes attachments without confirmation", "AttachmentIcon"],
			["autoConfirmMaskedLink", "Masked Links", "Opens links without the \"Leaving Discord\" warning", "LinkIcon"],
			["autoConfirmPin", "Pin/Unpin Messages", "Removes confirmation prompt when pinning or unpinning messages.", "PinIcon"],
		],
	},
	{
		title: "Servers & Groups",
		rows: [
			["autoConfirmChannel", "Channels", "Deletes channels without confirmation", "ChannelListIcon"],
			["autoConfirmServer", "Servers", "Leaves servers without confirmation", "ic_leave_24px"],
			["autoConfirmGroup", "Groups", "Leaves group DMs without confirmation", "GroupIcon"],
			["autoConfirmRole", "Roles", "Deletes roles without confirmation", "role"],
		],
	},
	{
		title: "Friends & DMs",
		rows: [
			["autoConfirmFriend", "Unfriend", "Removes friends without confirmation", "UserMinusIcon"],
			["autoConfirmBlock", "Block", "Blocks users without confirmation (this also unfriends them automatically)", "ic_block"],
			["autoConfirmIgnore", "Ignore", "Ignores users without confirmation", "EyeSlashIcon"],
			["autoConfirmCancelRequest", "Cancel Friend Request", "Cancels outgoing friend requests without confirmation", "UserClockIcon"],
			["autoConfirmVoiceCall", "Voice Calls", "Starts DM voice calls without the \"Ready to start a call?\" prompt", "PhoneCallIcon"],
		],
	},
];

export default function SettingsPage({ api }: { api: PluginApi<{ jsonStorage: Settings }> }) {
	const settings = api.jsonStorage.use() ?? DEFAULTS;
	const { ScrollView } = ReactNative;

	return (
		<Page>
			<ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40, gap: 16 }}>
				{GROUPS.map((group) => (
					<Design.TableRowGroup title={group.title} key={group.title}>
						{group.rows.map(([key, label, sub, icon]) => (
							<Design.TableSwitchRow
								key={key}
								label={label}
								subLabel={sub}
								icon={<Design.TableRow.Icon source={getAssetIdByName(icon)} />}
								value={settings[key]}
								onValueChange={(v: boolean) => api.jsonStorage.set({ [key]: v })}
							/>
						))}
					</Design.TableRowGroup>
				))}
			</ScrollView>
		</Page>
	);
}
