
const Button = (text) => function ({
	value,
	setValue,
	enabled,
}) {
	return <button
		onClick={()=>setValue?.(value)}
		disabled={value == null || enabled === false}
	>
		<div>{text}</div>
	</button>
}

const DecButton = Button('‹');
const IncButton = Button('›');

export {
	DecButton,
	IncButton
}