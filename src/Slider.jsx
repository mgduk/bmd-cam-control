import RcSlider from 'rc-slider';
import { useEffect, useState, useRef } from 'preact/hooks';

import { IncButton, DecButton } from './Buttons.jsx';

const LIVE_UPDATE_PERIOD = 50; //ms

const countDecimals = (value) => {
    if(Math.floor(value) === value) return 0;
    return value.toString().split(".")[1].length || 0;
};

const decimalsFormatter = (decimals) => (value) => `${value?.toFixed(decimals)}`;
const defaultValueFormatter = (value) => `${value ?? ''}`;

export default function Slider({
	name,
	propertyPath,
	value,
	defaultValue,
	setValue,
	showValue = true,
	valueFormatter,
	valueUpdateTime,
	key,

	maximum,
	minimum,
	step = 1,

	values = [],
	marks,
	markFormatter,
	symbolic,

	classNames = [],

	// show a label every n marks (null to autocalculate)
	showLabelEvery,

	// Update during sliding
	liveUpdate = true,

	equivalentName,
	switchToEquivalent,
}) {
	const fixedValues = values?.length > 0;

	// for ranges, format value labels to the precision of the step
	valueFormatter ??= fixedValues ? defaultValueFormatter : decimalsFormatter(countDecimals(step));

	const initialPosition = fixedValues ? values.indexOf(value) : value;
	const [position, setPosition] = useState(initialPosition);

	// if the value has changed, update the position to point to it
	useEffect(() => {
		setPosition(initialPosition);
	}, [valueUpdateTime, value]);

	// find the nearest option if it's not an exact match
	if (fixedValues && position === -1) {
		const abovePosition = values.findIndex(v => v > value);
		if (abovePosition === -1 || abovePosition === 0) {
			setPosition(0);
		} else {
			const aboveValue = values[abovePosition];
			const belowValue = values[abovePosition-1];
			if (value - belowValue < aboveValue - value) {
				setPosition(abovePosition-1);
			} else {
				setPosition(abovePosition);
			}
		}
	}

	maximum ??= (fixedValues ? values.length-1 : 99);
	minimum ??= 0;

	const lowerPosition = position === minimum ? null : position-step;
	const higherPosition = position === maximum ? null : position+step;

	let updateInstantly = false;

	const onMouseOver = (ev) => {
		// this is working around what seems to be a bug in rc-slider — clicking on a mark's text calls onChange
		// whereas it should call onChangeComplete (which is what clicking on a slider dot does)
		updateInstantly = ev.target.matches('.rc-slider-mark-text > *, .rc-slider-mark-text');
	}

	const createMarks = (values) => {
		const labelEvery = showLabelEvery ?? Math.ceil(values.length / 14);
		return values.reduce((all, option, position) => {
			const label = markLabel(option, position, labelEvery)
			all[fixedValues ? position : option] = createMark(option, label);
			return all;
		}, {});
	}

	const createMark = (option, label) =>
		(symbolic?.[option] != null)
			? <span
					title={`${symbolic[option]} — ${valueFormatter(option)}`}
					className="symbolic"
				>{label}</span>
			: <span title={valueFormatter(option)} className>{label}</span>;

	const markLabel = (option, position, labelEvery) =>
		(position % labelEvery === 0) || (symbolic?.[option] != null)
			? (markFormatter != null ? markFormatter(option) : option)
			: '';

	if (fixedValues) {
		marks = createMarks(values);
		const markValues = Object.keys(marks)
		minimum = markValues[0];
		maximum = markValues[markValues.length-1];
	}

	if (symbolic != null) {
		if (Array.isArray(symbolic)) {
			symbolic = symbolic.reduce((all, value) => {
				all[value] = true;
				return all;
			}, {})
		}
		marks ??= symbolic;
	}

	if (Array.isArray(marks)) {
		marks = createMarks(marks);
	}

	const onChangeComplete = (newPosition) => {
		if (completeChangeTimer.current) {
			clearTimeout(completeChangeTimer.current);
		}
		setPosition(newPosition);
		setValue(fixedValues ? values[newPosition] : newPosition);
	}

	const lastLiveUpdate = useRef(0);
	const completeChangeTimer = useRef();
	const onChange = (newPosition) => {
		setPosition(newPosition);
		if (!liveUpdate && !updateInstantly) {
			// this is partly to work around a bug in RcSlider whereby onChangeComplete
			// isn't called when a mark is clicked
			if (completeChangeTimer.current) {
				clearTimeout(completeChangeTimer.current);
			}
			completeChangeTimer.current = setTimeout(
				() => setValue(fixedValues ? values[newPosition] : newPosition),
				2000
			);
			return;
		}
		if (Date.now() - lastLiveUpdate.current > LIVE_UPDATE_PERIOD) {
			setValue(fixedValues ? values[newPosition] : newPosition);
			lastLiveUpdate.current = Date.now();
		}
		updateInstantly = false;
	}

	const revert = () => {
		setPosition(fixedValues ? values.indexOf(defaultValue) : defaultValue);
		setValue(defaultValue);
	}

	return <div className={`control ${classNames?.join(' ')}`} onMouseOver={onMouseOver}>
		<h2 title={propertyPath}>
			{name}
			{switchToEquivalent && <span class="control__switchToEquivalent" onClick={switchToEquivalent}>{equivalentName}</span>}
		</h2>
		<div className="control__control">
			<div className="control__value">
				<DecButton value={lowerPosition} setValue={onChangeComplete} />
				{showValue && <div className="control__value__value" onClick={() => revert()}>{valueFormatter(fixedValues ? values[position] : position)}</div>}
				<IncButton value={higherPosition} setValue={onChangeComplete} />
			</div>
			<RcSlider
				marks={marks}
				min={Number(minimum)}
				max={Number(maximum)}
				step={step}
				value={position}
				onChangeComplete={onChangeComplete}
				onChange={onChange}
			/>
		</div>
	</div>
}