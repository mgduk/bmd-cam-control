import { useEffect, useState, useRef } from 'preact/hooks';

export default function AutoFocus({
	app,
	apiSet,
}) {
	const autoFocus = () => {
		app.current.dispatchEvent(new CustomEvent('focus:start'));
		apiSet('lens', 'focus_doAutoFocus', null)({}, false);
	};

	return <div className="control">
		<h2>Auto focus</h2>
		<div className="control__control">
			<button className="button" onClick={autoFocus}>Auto focus</button>
		</div>
	</div>
}