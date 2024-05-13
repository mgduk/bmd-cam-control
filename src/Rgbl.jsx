import RcSlider from 'rc-slider';
import { useEffect, useState, useRef } from 'preact/hooks';

export default function Rgbl({
	name,
	propertyPath,
	subProperties,

	createPanel,
}) {
	return <div className="control four-width parent">
		<h2 title={propertyPath}>{name}</h2>
		<div className="control__control">
			{Object.values(subProperties).map(props => {
				return createPanel({
					...props,
					isSubPanel: true,
				})
			})}
		</div>
	</div>
}