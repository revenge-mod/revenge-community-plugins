const DEFAULTS = {
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
	debug: false,
};

type Settings = typeof DEFAULTS;

// rest: call the API directly instead of showing a popup
const RULES: { on: keyof Settings; test: (key: string, title: string, content: string) => boolean; rest?: (props: any) => unknown }[] = [
	{ on: "autoConfirmMessage", test: (_, t) => t === "Delete Message" },
	{ on: "autoConfirmEmbed", test: (_, t, c) => t === "Delete Embed" || (t === "Are you sure?" && c === "This will remove all embeds on this message for everyone.") },
	{ on: "autoConfirmAttachment", test: (_, t, c) => t === "Are you sure?" && c === "This will remove this attachment from this message permanently." },
	{ on: "autoConfirmMaskedLink", test: (k) => k === "masked-link" },
	{ on: "autoConfirmChannel", test: (_, t) => t === "Delete Channel" },
	{
		on: "autoConfirmServer",
		test: (k, t) => t === "Leave Server" || k === "guild-action-sheet-leave-server",
		rest: (p) => p?.guild?.id && getHttp()?.del({ url: `/users/@me/guilds/${p.guild.id}`, body: { lurking: false } }),
	},
	{ on: "autoConfirmGroup", test: (_, t) => t.startsWith("Leave '") },
	{ on: "autoConfirmRole", test: (_, t) => t.startsWith("Delete ") },
	{
		on: "autoConfirmFriend",
		test: (k) => k === "remove-friend",
		rest: (p) => p?.user?.id && getHttp()?.del({ url: `/users/@me/relationships/${p.user.id}` }),
	},
	{
		on: "autoConfirmCancelRequest",
		test: (k) => k === "cancel-friend-request",
		rest: (p) => p?.user?.id && getHttp()?.del({ url: `/users/@me/relationships/${p.user.id}` }),
	},
	{ on: "autoConfirmVoiceCall", test: (k) => k === "start-voice-call" },
	{ on: "autoConfirmPin", test: (_, t) => t === "Pin Message" || t === "Unpin Message" },
];

// action sheets skip openAlert, matched by openLazy's key instead
const SHEET_RULES: { on: keyof Settings; key: string; rest: (props: any) => unknown }[] = [
	{ on: "autoConfirmBlock", key: "BlockConfirmationActionSheet", rest: (p) => p?.userId && getHttp()?.put({ url: `/users/@me/relationships/${p.userId}`, body: { type: 2 } }) },
	{ on: "autoConfirmIgnore", key: "IgnoreConfirmationActionSheet", rest: (p) => p?.userId && getHttp()?.put({ url: `/users/@me/relationships/${p.userId}/ignore` }) },
];

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
	{
		title: "Debug",
		rows: [["debug", "Debug logging", "Logs alert data to Debug Logs, for troubleshooting", "debug"]],
	},
];

let logger: InstanceType<typeof revenge.discord.common.logger.Logger> | undefined;
let unpatch: (() => void) | undefined;
let unpatchSheet: (() => void) | undefined;
let http: any;
const getHttp = () => (http ??= revenge.modules.finders.lookupModule(revenge.modules.finders.filters.withProps("get", "getAPIBaseURL"))[0]);

const log = (...args: unknown[]) => {
	logger?.log(...args);
	console.log("[InstantActions]", ...args);
};

const flattenText = (node: any, depth = 0): string => {
	if (node == null || depth > 6) return "";
	if (typeof node === "string") return node;
	if (typeof node === "number") return String(node);
	if (Array.isArray(node)) return node.map((n) => flattenText(n, depth + 1)).join(" ");
	if (typeof node === "object" && "props" in node) return flattenText(node.props?.children, depth + 1);
	return "";
};

type Btn = { variant?: string; onPress: () => void };
const skipVariants = new Set(["secondary", "tertiary", "secondary-overlay"]);

const collectButtons = (node: any, out: Btn[], depth = 0) => {
	if (node == null || depth > 6) return;
	if (Array.isArray(node)) return node.forEach((n) => collectButtons(n, out, depth + 1));
	if (typeof node === "object" && "props" in node) {
		if (typeof node.props?.onPress === "function") out.push({ variant: node.props.variant, onPress: node.props.onPress });
		collectButtons(node.props?.children, out, depth + 1);
	}
};

const pickConfirm = (buttons: Btn[]) => {
	const destructive = buttons.find((b) => b.variant === "destructive");
	if (destructive) return destructive.onPress;
	if (buttons.length === 2) return buttons.find((b) => !skipVariants.has(b.variant ?? ""))?.onPress;
};

const Settings = ({ api }: { api: { jsonStorage: { use(): Settings; set(patch: Partial<Settings>): void } } }) => {
	const { Page } = revenge.components;
	const { Design } = revenge.discord.design;
	const { getAssetIdByName } = revenge.assets;
	const { ScrollView } = revenge.react.ReactNative;
	const settings = api.jsonStorage.use() ?? DEFAULTS;

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
};

export default plugin({
	jsonStorage: { default: DEFAULTS, load: true },
	start({ jsonStorage }) {
		logger = new revenge.discord.common.logger.Logger("InstantActions");

		unpatchSheet = revenge.patcher.instead(revenge.discord.actions.ActionSheetActionCreators, "openLazy", (args, original) => {
			const [, key, props] = args;
			const settings = jsonStorage.cache ?? DEFAULTS;
			const rule = SHEET_RULES.find((r) => settings[r.on] && r.key === key);

			if (!rule) {
				if (settings.debug) log("openLazy no match", key);
				return original(...args);
			}

			const sent = rule.rest(props);
			if (sent) {
				if (settings.debug) log("sheet rest", rule.on);
				Promise.resolve(sent)
					.then(() => (props as any)?.onSuccess?.())
					.catch((e: unknown) => settings.debug && log("sheet rest error", rule.on, String(e)));
				return;
			}

			if (settings.debug) log("sheet rest skipped, no id found", rule.on, props ? Object.keys(props) : []);
			return original(...args);
		});

		unpatch = revenge.patcher.instead(revenge.discord.actions.AlertActionCreators, "openAlert", (args, original) => {
			const [key, alert] = args;
			const settings = jsonStorage.cache ?? DEFAULTS;
			const props = alert?.props;
			const title = flattenText(props?.title);
			const content = flattenText(props?.content);
			const rule = RULES.find((r) => settings[r.on] && r.test(key, title, content));

			if (!rule) {
				if (settings.debug) log("no match", { key, title, content });
				return original(...args);
			}

			const buttons: Btn[] = [];
			collectButtons(props?.actions, buttons);
			const confirm = pickConfirm(buttons);

			if (settings.debug) log("matched", { key, title, on: rule.on, pickedConfirm: !!confirm });

			if (confirm) return confirm();

			if (typeof props?.onConfirm === "function") {
				if (settings.debug) log("onConfirm", rule.on);
				return props.onConfirm();
			}

			if (rule.rest) {
				const sent = rule.rest(props);
				if (sent) {
					if (settings.debug) log("rest", rule.on);
					(sent as Promise<unknown>)?.catch?.((e: unknown) => settings.debug && log("rest error", rule.on, String(e)));
					return;
				}
				if (settings.debug) log("rest skipped, no id found", rule.on, { propKeys: props ? Object.keys(props) : [], guildId: props?.guild?.id, userId: props?.user?.id });
			}

			return original(...args);
		});
	},
	stop() {
		unpatch?.();
		unpatch = undefined;
		unpatchSheet?.();
		unpatchSheet = undefined;
	},
	SettingsComponent: Settings,
});
