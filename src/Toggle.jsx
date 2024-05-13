import { useEffect, useState, useRef } from 'preact/hooks';
import ReactToggle from 'react-toggle';

const defaultValueFormatter = (value) => `${value}`;

export default function Toggle({
	name,
	propertyPath,
	value,
	setValue,
	valueFormatter = defaultValueFormatter,
	valueUpdateTime,
}) {
	const onChange = (event) => {
		setValue(event.target.checked);
	}

	return <div className="control">
		<h2 title={propertyPath}>{name}</h2>
		<div className="control__control">
			<label>
			  <ReactToggle
			    defaultChecked={value}
			    icons={{
			      checked: 'On',
			      unchecked: 'Off',
			    }}
			    onChange={onChange} />
			</label>
		</div>
	</div>
}