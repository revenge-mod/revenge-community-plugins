import { ReactJSXRuntime } from '@revenge-mod/react'

export type { JSX } from 'react/jsx-runtime'

// The CLI's automatic JSX imports otherwise capture React before the init phase.
export const jsx: typeof import('react/jsx-runtime').jsx = (...args) =>
	ReactJSXRuntime.jsx(...args)
export const jsxs: typeof import('react/jsx-runtime').jsxs = (...args) =>
	ReactJSXRuntime.jsxs(...args)
