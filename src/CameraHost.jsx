import { useEffect, useState, useRef } from 'preact/hooks';

export default function CameraHost({
	value,
	setValue,
	hosts,
	forgetHost,
}) {
	const [showOptions, setShowOptions] = useState(false);

	const onSubmit = (event) => {
		event.preventDefault();
		setHost(input.current.value);
	}

	const setHost = (host) => {
		input.current.value = host;
		setValue(host);
	}

	const input = useRef();

	const forgetClick = host => ev => {
		ev.stopPropagation();
		if (input.current.value === host) {
			input.current.value = '';
		}
		forgetHost(host);
	}

	const toggleOptions = ev => {
		setShowOptions(!showOptions);
		ev.stopPropagation();
	}

	useEffect(() => {
		const hideOptions = () => setShowOptions(false);
		window.addEventListener('click', hideOptions);
		return () => {
			window.removeEventListener('click', hideOptions);
		}
	}, [])

	const hostOptionsAvailable = () => {
		if (!hosts?.length) {
			return false;
		}
		if (hosts.length === 1 && hosts[0] === value) {
			return false;
		}
		return true;
	}

	useEffect(() => {
		if (!hostOptionsAvailable()) {
			setShowOptions(false);
		}
	}, [hosts])

	return <div className="control double-width" id="camera-host">
		<h2>Camera host</h2>
		<form className="control__control" onSubmit={onSubmit}>
			<span id="camera-host-prefix" onClick={() => input.current.focus()}>http://</span>
			<input type="text" ref={input} value={value} onFocus={ev => ev.target.select()} />
			<button type="submit" className="button">Save</button>
			{hostOptionsAvailable() && (<>
				<span id="camera-host-options-dropdown" onClick={toggleOptions}>▼</span>
				{showOptions && <ul id="camera-host-options">
					{hosts.map(host =>
						host !== value &&
							<li key={host} onClick={() => setHost(host)}>
								http://{host}
								{forgetHost && <span className="camera-host-forget" title="Forget host" onClick={forgetClick(host)}>🙈</span>}
							</li>
					)}
				</ul>}
			</>)}
		</form>
	</div>
}
