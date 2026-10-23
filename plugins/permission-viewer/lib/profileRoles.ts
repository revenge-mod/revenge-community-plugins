import { cloneElement, createElement, isValidElement } from 'react'
import { ProfileRoles } from '../components/ProfileRoles'
import type { ReactElement, ReactNode } from 'react'
import type { RoleItemComponent } from '../components/rolePill'

interface RolesListProps {
	guildId: string
	guildMemberRoleIds: string[]
}

/** The card's only element with `guildMemberRoleIds`; found by prop, not component name. */
function isRolesList(node: ReactNode): node is ReactElement<RolesListProps> {
	return (
		isValidElement(node) &&
		Array.isArray((node.props as Partial<RolesListProps>)?.guildMemberRoleIds)
	)
}

/** Swaps the client's roles list for ProfileRoles; untouched branches return by reference. */
export function replaceProfileRolesList(
	node: ReactNode,
	Pill: RoleItemComponent,
): ReactNode {
	if (isRolesList(node)) {
		return createElement(ProfileRoles, {
			guildId: node.props.guildId,
			guildMemberRoleIds: node.props.guildMemberRoleIds,
			Pill,
		})
	}

	if (!isValidElement<{ children?: ReactNode }>(node)) return node

	const children = (node.props as { children?: ReactNode })?.children
	if (children === undefined || children === null) return node

	if (Array.isArray(children)) {
		let changed = false
		const next = children.map(child => {
			const replaced = replaceProfileRolesList(child, Pill)
			if (replaced !== child) changed = true
			return replaced
		})
		return changed ? cloneElement(node, { children: next }) : node
	}

	const replaced = replaceProfileRolesList(children, Pill)
	return replaced !== children
		? cloneElement(node, { children: replaced })
		: node
}
