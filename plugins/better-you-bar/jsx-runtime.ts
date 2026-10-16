import { ReactJSXRuntime } from '@revenge-mod/react'

export type { JSX } from 'react/jsx-runtime'

// Discord binds React after external plugins are evaluated.
export const jsx: typeof import('react/jsx-runtime').jsx = (...args) =>
	ReactJSXRuntime.jsx(...args)
export const jsxs: typeof import('react/jsx-runtime').jsxs = (...args) =>
	ReactJSXRuntime.jsxs(...args)
