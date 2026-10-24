export function TextInputRow({
	value,
	onChangeText,
	placeholder,
	secureTextEntry,
	disabled,
	keyboardType,
}: {
	value: string
	onChangeText: (text: string) => void
	placeholder?: string
	secureTextEntry?: boolean
	disabled?: boolean
	keyboardType?: 'numeric'
}) {
	const React = revenge.react.React
	const { TextField } = revenge.discord.design.Design

	const [localValue, setLocalValue] = React.useState(value)

	React.useEffect(() => {
		setLocalValue(value)
	}, [value])

	const handleChange = (text: string) => {
		const filtered = keyboardType === 'numeric' ? text.replace(/\D/g, '') : text
		setLocalValue(filtered)
		onChangeText(filtered)
	}

	return (
		<TextField
			value={localValue}
			onChange={handleChange}
			placeholder={placeholder}
			secureTextEntry={secureTextEntry}
			isDisabled={disabled}
			isClearable
			style={{ marginTop: 4 }}
		/>
	)
}
