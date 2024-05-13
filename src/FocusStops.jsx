import { useEffect, useState, useRef } from 'preact/hooks';

// controls how closely two focal lengths need to be to be considered the same
const PRECISION = 0.01;
const SLOW_FOCUS_FREQ = 50;

const STORAGE_KEY = 'focusStops';
const DEFAULT_TIME = 1000;

const loadStops = () => {
	return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? [];
};

const saveStops = (stops) => {
	localStorage.setItem(
		STORAGE_KEY,
		JSON.stringify(stops)
	);
}

export default function FocusStops({
	apiSet,
	monitoredValues,
	app,
}) {
	const [stops, setStops] = useState(loadStops());
	const [editable, setEditable] = useState(stops.length === 0);

	const focalLength = monitoredValues?.lens_focus_normalised;

	const addStop = () => {
		stops.push({ stop: focalLength, time: DEFAULT_TIME });
		setStops([...stops]);
		saveStops(stops);
	};

	const deleteClick = (i) => (ev) => {
		ev.stopPropagation(ev);
		const newStops = stops.toSpliced(i, 1)
		setStops(newStops)
		saveStops(newStops);
	}

	const timeClick = (i) => (ev) => {
		ev.stopPropagation(ev);
		stops[i].time = stops[i].time == 0 ? DEFAULT_TIME : 0;
		setStops([...stops]);
		saveStops(stops);
	}

	const focusTimer = useRef();
	const easeInOutSine = x => -(Math.cos(Math.PI * x) - 1) / 2;

	const stopFocusing = () => {
		clearInterval(focusTimer.current);
	}

	// Focus to a normalised value — either instantly (time==0) or smoothly over $time ms
	const focusTo = (value, time = 0) => {
		app.current.dispatchEvent(new CustomEvent('focus:start'));
		const func = apiSet('lens','focus','normalised');
		if (!time) {
			func(value, false);
		} else {
			const totalCalls = Math.floor(time / SLOW_FOCUS_FREQ);
			const start = monitoredValues.lens_focus_normalised;
			const delta = value - start;
			let i = 0;
			const focusNext = () => {
				const newValue = start + (easeInOutSine(1/totalCalls * ++i) * delta);
				func(newValue, false);
				if (i >= totalCalls) {
					clearInterval(focusTimer.current);
				}
			};
			focusTimer.current = setInterval(focusNext, SLOW_FOCUS_FREQ)
		}
	};

	useEffect(() => {
		app.current.addEventListener('focus:start', stopFocusing);
		return () => {
			app.current.addEventListener('focus:start', stopFocusing);
		};
	}, []);

	const match = (a, b) => Math.abs(a-b) < PRECISION;

	const letter = num => String.fromCharCode(65 + num);

	return <div className="control triple-width focusStops">
		<h2>Stops</h2>
		{stops.length > 0 && (editable
			? <span className="focusStops__editable focusStops__editable--on" onClick={() => setEditable(false)}>Freeze</span>
			: <span className="focusStops__editable focusStops__editable--off" onClick={() => setEditable(true)}>Unfreeze</span>
		)}
		<div className="control__control">
			<div className="focusStops__stops">
				{stops.map(({ stop, time}, i) =>
					<button
						key={i}
						onClick={() => focusTo(stop, time)}
						className={`focusStop ${match(focalLength,stop) ? 'active' : ''}`}
					>
						<span className="focusStop__size" style={{width: `${stop*100}%`}}></span>
						{letter(i)}
						{editable && <span className="focusStop__delete" title={`Delete ${letter(i)}`} onClick={deleteClick(i)}>&times;</span>}
						{editable && <span className="focusStop__time" onClick={timeClick(i)}>
							{time == 0 ? <span title={`Focus instantly`}>🐇</span> : <span title={`Focus over ${DEFAULT_TIME}ms`}>🐢</span>}
						</span>}
					</button>
				)}
				{editable && stops.length < 8 && <button className="focusStops__add" onClick={addStop} title="Add stop at current focal length">+</button>}
			</div>
		</div>
	</div>
}