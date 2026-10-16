/** @jsxImportSource . */
import { getAssetIdByName } from '@revenge-mod/assets'
import { ActionSheetActionCreators } from '@revenge-mod/discord/actions'
import { getModules } from '@revenge-mod/modules/finders'
import { withName } from '@revenge-mod/modules/finders/filters'
import { instead } from '@revenge-mod/patcher'
import { Children, cloneElement, isValidElement } from 'react'
import { Image } from 'react-native'
import { getQuoteMedia } from './lib/content'
import { closeQuoteModal, openQuoteModal } from './preview'
import Settings from './settings'
import {
	configureStorage,
	defaults,
	loadSettings,
	quoterSettings,
	setActive,
} from './storage'
import type { ComponentType, ReactNode } from 'react'
import type { QuoteMessage, QuoterSettings, TreeProps } from './types'

export default plugin<{ jsonStorage: QuoterSettings }>({
	jsonStorage: { default: defaults },
	SettingsComponent: Settings,
	async start({ cleanup, jsonStorage, plugin }) {
		let stopped = false
		cleanup(() => {
			stopped = true
			setActive(false)
			closeQuoteModal()
		})
		if (plugin.startedLate) plugin.requireReload()
		configureStorage(jsonStorage)
		await loadSettings()
		if (stopped) return
		setActive(true)
		cleanup(
			getModules(
				withName('LongPressMessageActionSheet'),
				module => {
					if (stopped) return
					const target = module as {
						default: (props: { message?: QuoteMessage }) => ReactNode
					}
					cleanup(
						instead(target, 'default', function (args, original) {
							const result = Reflect.apply(original, this, args)
							const message = args[0].message
							if (
								!message ||
								(!message.content &&
									!(quoterSettings.allowMedia && getQuoteMedia(message).length))
							)
								return result
							let inserted = false
							const add = (node: ReactNode): ReactNode => {
								if (!isValidElement<TreeProps>(node)) return node
								const children = Children.toArray(node.props.children)
								if (
									!inserted &&
									node.props.hasIcons &&
									children.some(
										child =>
											isValidElement<TreeProps>(child) &&
											typeof child.props.label === 'string',
									)
								) {
									const template = children.find(
										child =>
											isValidElement<TreeProps>(child) &&
											typeof child.props.label === 'string',
									)
									if (isValidElement<TreeProps>(template)) {
										inserted = true
										const Row = template.type as ComponentType<{
											label: string
											icon?: ReactNode
											onPress(): void
										}>
										const icon = isValidElement(template.props.icon)
											? cloneElement(
													template.props.icon as React.ReactElement<{
														IconComponent: ComponentType<{ color: string }>
													}>,
													{
														IconComponent: ({ color }) => (
															<Image
																source={getAssetIdByName('QuoteIcon')}
																style={{
																	width: 24,
																	height: 24,
																	tintColor: color,
																}}
															/>
														),
													},
												)
											: undefined
										return cloneElement(
											node,
											{},
											...children,
											<Row
												key="quoter"
												label="Quote"
												icon={icon}
												onPress={() => {
													ActionSheetActionCreators.hideAllActionSheets()
													openQuoteModal(message)
												}}
											/>,
										)
									}
								}
								return cloneElement(
									node,
									{},
									Children.map(node.props.children, add),
								)
							}
							return add(result)
						}),
					)
				},
				{ returnNamespace: true },
			),
		)
	},
})
