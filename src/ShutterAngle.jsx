import { useEffect, useState, useRef } from 'preact/hooks';

import Slider from './Slider.jsx';

export default function ShutterAngle(props) {
	const { getValue, app, setCachedValue, apiSet, pathToKey } = props;

	const getEffectiveFrameRate = () => {
		const offSpeedEnabled = getValue('system','format', 'offSpeedEnabled');
		return offSpeedEnabled
			? Number(getValue('system', 'format', 'offSpeedFrameRate'))
			: Number(getValue('system', 'format', 'frameRate'));
	};

	const getShutterAngle = () => {
		const frameRate = getEffectiveFrameRate();
		const speed = getValue('video', 'shutter', 'shutterSpeed');
		const angle = Math.round(frameRate / speed * 360);
		return angle;
	}

	const setShutterAngle = (shutterAngle, frameRate) => {
		frameRate ??= Number(getEffectiveFrameRate());
		const shutterSpeed = Math.round(frameRate * 360/shutterAngle);
		// manually update the cached value for shutter speed as we use it to calculate
		// the displayed value of shutter angle
		setCachedValue('video', 'shutter', 'shutterSpeed', shutterSpeed);
		return apiSet('video', 'shutter', 'shutterSpeed')(shutterSpeed, false);
	}

	const preserveShutterAngle = (e) => {
		const key = pathToKey(e.detail.api, e.detail.propertySet, e.detail.property)
		if (key === 'system_format_frameRate' || key === 'system_format_offSpeedFrameRate') {
			// update shutter speed
			setShutterAngle(getShutterAngle(), e.detail.value);
		} else if (key === 'system_format_offSpeedEnabled') {
			setShutterAngle(getShutterAngle(), e.detail.value
				? Number(getValue('system', 'format', 'offSpeedFrameRate'))
				: Number(getValue('system', 'format', 'frameRate'))
			);
		}
	};

	const onRemovePanel = (e) => {
		if (e.detail.key === 'shutter-angle') {
			// if the shutter angle panel is removed, we should no longer auto adjust shutter speed
			stopListening();
		}
	};

	const anotherInstanceMounted = () => {
		stopListening();
	}

	const stopListening = () => {
		app.current.removeEventListener('setvalue', preserveShutterAngle);
		app.current.removeEventListener('removepanel', onRemovePanel);
		app.current.removeEventListener('shutter-angle:mounted', anotherInstanceMounted);
	}

	useEffect(() => {
		// We need a single instance of this component to keep listening to events even when it's unmounted,
		// so that the Shutter Angle behaviour can be maintained, but only one instance of the component should do so.
		// So we dispatch an event to tell any existing instances to stop listening and let this one take that job on its own.
		app.current.dispatchEvent(new CustomEvent('shutter-angle:mounted', { detail: this }));
		app.current.addEventListener('shutter-angle:mounted', anotherInstanceMounted);

		app.current.addEventListener('setvalue', preserveShutterAngle)
		app.current.addEventListener('removepanel', onRemovePanel);
	}, []);

	return <Slider
		{...props}
		value={getShutterAngle()}
		setValue={setShutterAngle}
	/>
}
