import { render } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import yaml from 'js-yaml';
import SwaggerClient from 'swagger-client';
import uncamelize from 'uncamelize';

import ShutterAngle from './ShutterAngle.jsx';
import CameraHost from './CameraHost.jsx';
import FocusStops from './FocusStops.jsx';
import AutoFocus from './AutoFocus.jsx';
import Slider from './Slider.jsx';
import Toggle from './Toggle.jsx';
import Rgbl from './Rgbl.jsx';

import preactLogo from './assets/preact.svg';
import './style.css';

const YAML_PATH = `/yaml`;

// ping the websocket server this frequently to check it's still
// accessible and talking to us
const PING_FREQ = 10000;
// cache websocket messages for this long after changing a value to
// debounce and avoid flickering:
const UPDATE_DEFER_DELAY = 1000;
// if we haven't had a websocket update for this long after changing
// a value, load the value from the API:
const FORCE_UPDATE_DELAY = 2000;

// This config object adds in data that's missing from the YAML files
import CONFIG from './config.js';

const HOSTS_STORAGE_KEY = 'cameraHosts';
const EQUIV_STORAGE_KEY = 'inactiveEquivalents';

const SETTINGS = '⚙️';

const PANELS = {
	image: [
		'video_gain_gain',
		'lens_iris_apertureStop',
		'video_shutter_shutterSpeed',
		// 'video_autoExposure_mode',
		'video_whiteBalance_whiteBalance',
		'video_whiteBalanceTint_whiteBalanceTint',
	],
	rate: [
		'system_format_frameRate',
		'system_format_offSpeedFrameRate',
		'system_format_offSpeedEnabled',
	],
	focus: [
		'lens_focus_normalised',
		'focus-stops',
		'auto-focus',
	],
	colour: [
		'video_whiteBalance_whiteBalance',
		'video_whiteBalanceTint_whiteBalanceTint',
		'colorCorrection_contrast_adjust',
		'colorCorrection_contrast_pivot',
		'colorCorrection_color_hue',
		'colorCorrection_color_saturation',
		'colorCorrection_lumaContribution_lumaContribution',
		'colorCorrection_lift_rgbl',
		'colorCorrection_gamma_rgbl',
		'colorCorrection_gain_rgbl',
		'colorCorrection_offset_rgbl',
	],
	[SETTINGS]: [
		'camera-host',
	],
};

// Properties that are shown for information but not control
const MONITORS = [
	'lens_focus_normalised',
	'lens_focus_doAutoFocus',
	'lens_zoom_focalLength',
	'system_format_frameRate',
	'lens_iris_apertureStop',
	'video_shutter_shutterSpeed',
	'system_format_offSpeedFrameRate',
	'system_format_offSpeedEnabled',
];

// These panels offer the same functionality in a different way, so can be switched between
const EQUIVALENTS = [
	['video_iso_iso', 'video_gain_gain'],
	['video_shutter_shutterSpeed', 'shutter-angle']
];

const getEquivalent = (() => (key) => {
	const flatList = EQUIVALENTS.flat();
	if (!flatList.includes(key)) {
		return;
	}
	for (const [a, b] of EQUIVALENTS) {
		if (a === key) {
			return b;
		}
		if (b === key) {
			return a;
		}
	}
})();

const keyToPath = (key) => key.split('_');
const pathToKey = (api, propertySet, property) => [api, propertySet, property].join('_').replace(/_*$/, '');

// take the combined set of unique properties from panels and monitors,
// and split out the api and propertySet to match the way BMD's API works
const capabilities = Array.from(new Set([Object.values(PANELS), MONITORS, EQUIVALENTS].flat(2)))
	.map(key => key.split('_'))
	// ignores any custom panels like settings
	.filter(a => a.length === 3)
	.reduce((tree, [api, propertySet, property]) => {
		let branch = tree.find(([p1, p2]) => p1 === api && p2 === propertySet)
		if (branch == null) {
			branch = [api, propertySet, []];
			tree.push(branch);
		}
		branch[2].push(property);
		return tree;
	}, []);

export function App() {
	const [loaded, setLoaded] = useState(false);
	const [controls, setControls] = useState([]);

	const [tabs, setTabs] = useState(() => Object.keys(PANELS));
	const [activeTab, setActiveTab] = useState(tabs[0]);

	const [panels, setPanels] = useState(PANELS);

	const [cameraHost, setCameraHost] = useState();

	const [monitoredValues, setMonitoredValues] = useState(() => MONITORS.reduce((a, k) => ({...a, [k]: null }), {}));

	// used for events
	const app = useRef(new EventTarget());

	const [cachedValues, setCachedValues] = useState({});
	// this ref ensures we can access the up-to-date values
	const cachedValuesRef = useRef();
	cachedValuesRef.current = cachedValues;

	const deferredUpdates = useRef({});
	const deferredUpdateTimers = useRef({});

	const [updateTimes, setUpdateTimes] = useState({});
	const updateTimesRef = useRef();
	updateTimesRef.current = updateTimes;

	const apiSchemas = useRef({});
	const socket = useRef();
	const pingSocketTimer = useRef();
	const socketLastMessageTime = useRef();
	const [connected, setConnected] = useState();
	const [connecting, setConnecting] = useState();

	const loadHosts = () => {
		return JSON.parse(localStorage.getItem(HOSTS_STORAGE_KEY)) ?? [];
	};

	const rememberHost = (host) => {
		localStorage.setItem(
			HOSTS_STORAGE_KEY,
			JSON.stringify(
				// add the host as the first in the list, so it's auto-loaded next time,
				// and use a Set to avoid a later duplicate
				Array.from(new Set([host, ...loadHosts()]))
			)
		);
	}

	const forgetHost = (host) => {
		const hosts = new Set(loadHosts());
		hosts.delete(host);
		localStorage.setItem(HOSTS_STORAGE_KEY, JSON.stringify(Array.from(hosts)));
		setAllHosts(loadHosts());
	}

	const [allHosts, setAllHosts] = useState(() => loadHosts());

	const apiGet = async (api, propertySet) => {
		await loadYaml();
		let func;
		for (const group in apiSchemas.current) {
			func = apiSchemas.current[group].apis.default[`get_${api}_${propertySet}`];
			if (func != null) {
				break;
			}
		}
		if (func == null) {
			console.debug(`No API getter function found for ${api} -> ${propertySet}`);
			return;
		}

		let result;
		try {
			result = await func();
		} catch (err) {
			console.error(err);
		}
		return result.body;
	}

	const yamlLoadPromise = useRef();
	const loadYaml = async () => {
		// only load once, return the existing promise subsequent times
		if (yamlLoadPromise.current != null) {
			return yamlLoadPromise.current;
		}
		return yamlLoadPromise.current = (async () => {
			const baseUrl = new URL(YAML_PATH, window.location);
			for (const api in CONFIG) {
				if (CONFIG[api]._swagger == null) {
					break;
				}
				apiSchemas.current[api] = await SwaggerClient(`${baseUrl}/${CONFIG[api]._swagger}`);
				apiSchemas.current[api].spec.servers[0].url = `http://${cameraHost}${apiSchemas.current[api].spec.servers[0].url}`
			}
		})();
	}

	const connectToHost = () => {
		if (socket.current != null) {
			socket.current?.close();
			socket.current = null;
			setTimeout(connectToHost, 10);
			return
		}

		// first load — reconnect to last used host if available,
		// or show settings
		if (cameraHost === undefined) {
			const hosts = loadHosts();
			if (hosts.length > 0) {
				// reconnect to last used host
				setCameraHost(hosts[0]);
			} else {
				setActiveTab(SETTINGS);
			}
			return;
		} else if (cameraHost === null) {
			// deliberately just unsetting, e.g. to reconnect to the same host
			return;
		}

		clearInterval(pingSocketTimer.current);
		socket.current = new WebSocket(
			`ws://${cameraHost}/control/api/v1/event/websocket`
		);
		setConnecting(true);
		socket.current.onclose = (event) => {
			setConnected(false);
			setConnecting(false);
			clearInterval(pingSocketTimer.current);
		}
		socket.current.onopen = (event) => {
			setConnected(true);
			setConnecting(false);
			rememberHost(cameraHost);

			loadSupportedFormat();

			const properties = [];
			for (const [api, propertySet] of capabilities) {
				properties.push(`/${api}/${propertySet}`);
			}
			socket.current.send(JSON.stringify({
				type: 'request',
				data: {
					action: 'subscribe',
					properties,
				}
			}));

			pingSocketTimer.current = setInterval(
				() => {
					setConnected(socket.current.readyState == WebSocket.OPEN);
					// an intentionally invalid message, as it's the smallest request/response payload I can see
					socket.current.send(JSON.stringify({type: 'request', data: {action: 'ping'} }));
					if (Date.now() - socketLastMessageTime.current > PING_FREQ*1.1) {
						setConnected(false);
						setConnecting(true);
					}
				},
				PING_FREQ
			);
		};
		socket.current.onmessage = (event) => {
			socketLastMessageTime.current = Date.now();
			const message = JSON.parse(event.data);
			switch (message.type) {
				case 'response':
					break;
				case 'event':
					const { action, property, value } = message.data;
					switch (action) {
						case 'websocketOpened':
							// TODO: handle websocket subscribe failure
							break;
						case 'propertyValueChanged':
							const [_, api, propertySet] = property.split('/', 3);
							app.current.dispatchEvent(new CustomEvent('propertyvaluechange', { detail: { api, propertySet, value } }));
							updateValuesFromSocket(api, propertySet, value)
							break;
						default:
							console.error('websocket unknown action', message);
					}
					break;
				default:
					console.error('websocket unknown type', message);
			}
		};
	};

	useEffect(connectToHost, [cameraHost]);

	// if we don't get a websocket update a short while after sending a change,
	// we'll force an update of its values via the API
	const forceUpdateTimers = useRef({});
	const forceUpdateWhenNecessary = () => {
		app.current.addEventListener('setvalue', (ev) => {
			const { api, propertySet } = ev.detail;
			const key = `${api}_${propertySet}`;
			clearTimeout(forceUpdateTimers.current[key]);
			forceUpdateTimers.current[key] = setTimeout(() => loadValues(api, propertySet), FORCE_UPDATE_DELAY);
		});
		app.current.addEventListener('propertyvaluechange', (ev) => {
			const { api, propertySet, value } = ev.detail;
			const key = `${api}_${propertySet}`;
			clearTimeout(forceUpdateTimers.current[key]);
		});
	};
	useEffect(forceUpdateWhenNecessary, [])

	const updateMonitoredValues = (api, propertySet, values) => {
		const monitors = MONITORS.filter(key => key.startsWith(`${api}_${propertySet}_`));
		if (monitors.length === 0) {
			return;
		}
		for (const key of monitors) {
			const [_, _2, property] = key.split('_');
			monitoredValues[key] = values[property];
		}
		setMonitoredValues({...monitoredValues});
	}

	const reconnect = () => {
		const oldHost = cameraHost;
		setCameraHost(null);
		setTimeout(
			() => setCameraHost(oldHost),
			100
		);
	};

	const setUpdateTime = (api, propertySet) => {
		setUpdateTimes({
			...updateTimesRef.current,
			[`${api}_${propertySet}`]: Date.now(),
		});
	}

	const getUpdateTime = (api, propertySet) => {
		return updateTimesRef.current[`${api}_${propertySet}`] ?? 0;
	}

	const addControl = (controls, api, propertySet, property) => {
		controls.set(
			pathToKey(api, propertySet, property),
			{ api, propertySet, property }
		);
	}

	// reads the current state of the system format (frame rate, etc)
	const loadData = async () => {
		const controls = new Map();;
		const promises = [];

		for (const [api, propertySet, properties] of capabilities) {
			promises.push(
				loadValues(api, propertySet)
				.then((data) => {
					if (properties[0] === 'rgbl') {
						addControl(controls, api, propertySet, 'rgbl');
					} else {
						for (const property of properties) {
							addControl(controls, api, propertySet, property);
						}
					}
				})
			)
		}

		// don't need to wait for this
		loadValues('lens', 'zoom');

		await Promise.all(promises);
		setControls(controls);
		restoreActiveEquivalents();
		setLoaded(true);
	};

	const loadValues = async (api, propertySet) => {
		// a property set can define an alternative property set as the ‘getter’
		propertySet = CONFIG[api]?.[propertySet]?._getter ?? propertySet;
		const values = await apiGet(api, propertySet);
		updateMonitoredValues(api, propertySet, values);
		return updateValues(api, propertySet, values);
	}

	const updateValues = (api, propertySet, values) => {
		if (values == null) {
			return
		}
	 	if (api === 'lens' && propertySet === 'iris') {
	 		delete values.normalised;
	 		delete values.apertureNumber;
	 	}
		setCachedValues({
			...cachedValuesRef.current,
			[api]: {
				...cachedValuesRef.current[api],
				[propertySet]: values,
			}
		})
		setUpdateTime(api, propertySet);
		return values;
	}

	const setCachedValue = (api, propertySet, property, value) => {
		if (property == null) {
			return;
		}
		try {
			cachedValuesRef.current[api][propertySet][property] = value;
		} catch (err) {
			console.debug('unable to set cached value for', api, propertySet, property, err)
		}
	}

	// enables deferring for a given propertySet, so any updates that are received
	// are cached for a while
	const deferUpdates = (api, propertySet) => {
		const key = `${api}/${propertySet}`;
		if (deferredUpdateTimers.current[key] != null) {
			clearTimeout(deferredUpdateTimers.current[key]);
		}
		// create an array to cache updates for the next while
		deferredUpdates.current[key] ??= [];
		// after a while, apply the latest update
		deferredUpdateTimers.current[key] = setTimeout(
			applyDeferredUpdate(api, propertySet),
			UPDATE_DEFER_DELAY
		);
	};

	const applyDeferredUpdate = (api, propertySet) => () => {
		const key = `${api}/${propertySet}`;
		const latestValues = deferredUpdates.current[key].pop();
		delete deferredUpdates.current[key];
		// the websocket message after we set the iris contains the _old_ iris value,
		// we'll discard the updates and load from the API to ensure latest data
		if (key === 'lens/iris') {
			loadValues('lens', 'iris');
			return;
		}
		updateValues(api, propertySet, latestValues);
	};

	const updateValuesFromSocket = (api, propertySet, values) => {
		const key = `${api}/${propertySet}`;
		updateMonitoredValues(api, propertySet, values);

		// if we're deferring updates (e.g. because we've just sent a new value), cache them
		if (deferredUpdates.current[key]) {
			deferredUpdates.current[key].push(values);
			return;
		}
		updateValues(api, propertySet, values);
	}

	const loadSupportedFormat = async () => {
		const { supportedFormats } = await apiGet('system', 'supportedFormats');
		const supported = supportedFormats[0];

		CONFIG.system ??= {};
		CONFIG.system.format ??= {};

		CONFIG.system.format.frameRate = {
			values: supported.frameRates,
			...CONFIG.system.format.frameRate
		};

		// convert this data to the standardised format I'm using
		if (supported.minOffSpeedFrameRate != null) {
			CONFIG.system.format.offSpeedFrameRate = {
				...CONFIG.system.format.offSpeedFrameRate,
				minimum: supported.minOffSpeedFrameRate,
				maximum: supported.maxOffSpeedFrameRate,
			}
		}

		await loadData();
	}

	const getSchema = (api, propertySet) => {
		if (!propertySet) {
			return {};
		}
		const pathName = propertySet.replaceAll('_', '/');
		// we're getting it from the path because the `scemas` section isn't fully defined
		return apiSchemas.current[api]?.spec?.paths?.[`/${api}/${pathName}`]?.put?.requestBody?.content?.['application/json']?.schema;
	}

	const apiSet = (api, propertySet, property) => async (value, defer = true) => {
		app.current.dispatchEvent(new CustomEvent('setvalue', { detail: { api, propertySet, property, defer, value } }));
		setCachedValue(api, propertySet, property, value);
		if (defer) {
			// we'll defer applying websocket updates for a little while, to
			// avoid an old event updating the component
			deferUpdates(api, propertySet);
		}
		if (apiSchemas.current[api].apis.default[`put_${api}_${propertySet}`] == null) {
			throw Error(`No PUT endpoint available for /${api}/${propertySet}`);
		}
		const resp = await apiSchemas.current[api].apis.default[`put_${api}_${propertySet}`]({}, {
			requestBody: cachedValuesRef.current[api]?.[propertySet]
		});
	};

	const getPropertyConfig = (api, propertySet, property, resolve = false) => {
		const propertySchema = getSchema(api, propertySet)?.properties?.[property] ?? {};
		// some are plurlized
		let config = {
			...CONFIG[api]?.[propertySet]?.[property]
				?? CONFIG[api]?.[propertySet]?.[`${property}s`]
				?? ((!propertySet) ? CONFIG[api] : {})
		};
		// ensure there's a default value
		if (config.defaultValue == null) {
			config.defaultValue =
				// default from YAML
				config.default ??
				// first option
				config.values?.[0] ??
				0;
		}

		if (resolve) {
			const resolveProps = {
				getValue,
				// avoid an infinite regression by setting resolve to false
				getPropertyConfig: (api, propertySet, property) => getPropertyConfig(api, propertySet, property),
			};
			if (typeof config.values === 'function') {
				config.values = config.values(resolveProps);
			}
			if (typeof config.marks === 'function') {
				config.marks = config.marks(resolveProps);
			}
			if (typeof config.symbolic === 'function') {
				config.symbolic = config.symbolic(resolveProps);
			}
			const key = pathToKey(api, propertySet, property);
			const equivalent = getEquivalent(key);
			if (equivalent) {
				const equivPath = keyToPath(equivalent);
				const propertyConfig = getPropertyConfig(...equivPath);
				config.equivalentName = propertyConfig.name ?? (equivPath[2] ? uncamelize(equivPath[2]) : equivalent);
				config.switchToEquivalent = switchToEquivalent(key);
			}
		}

		return {
			...propertySchema,
			...config,
		}
	}

	const loadInactiveEquivalents = () => {
		return localStorage[EQUIV_STORAGE_KEY]?.split(/,+/) ?? [];
	}

	const rememberActiveEquivalent = (inactive, active) => {
		localStorage[EQUIV_STORAGE_KEY] =
			(localStorage[EQUIV_STORAGE_KEY] ?? '')
			.replaceAll(new RegExp(`,*\\b(${active}|${inactive})\\b`,'g'), '') +
			',' + inactive;
	}

	const restoreActiveEquivalents = () => {
		Array.from(loadInactiveEquivalents()).forEach(key => swapPanels(key, getEquivalent(key)));
		setPanels({...panels});
	}

	const switchToEquivalent = (key) => () => {
		const equivalent = getEquivalent(key);
		swapPanels(key, equivalent);
		setPanels({...panels});
		rememberActiveEquivalent(key, equivalent);
	}

	const swapPanels = (outgoing, incoming) => {
		const outgoingIndex = panels[activeTab].indexOf(outgoing);
		if (incoming == null || panels[activeTab].includes(incoming) || outgoingIndex === -1) {
			return;
		}
		panels[activeTab].splice(outgoingIndex, 1, incoming);
		app.current.dispatchEvent(new CustomEvent('removepanel', { detail: { key: outgoing }}));
		app.current.dispatchEvent(new CustomEvent('addpanel', { detail: { key: incoming }}));
	}

	const getValue = (api, propertySet, property) => cachedValuesRef.current[api]?.[propertySet]?.[property];

	const getPropertyProps = (api, propertySet, property) => {
		const propertyConfig = getPropertyConfig(api, propertySet, property, true);

		const props = {
			...propertyConfig,
			name: propertyConfig.name ?? (property != null ? uncamelize(property) : api),
			key: pathToKey(api, propertySet, property),
			propertyPath: `${api}/${propertySet}/${property}`,
			value: getValue(api, propertySet, property) ?? propertyConfig.defaultValue,
			setValue: apiSet(api, propertySet, property),
			valueUpdateTime: getUpdateTime(api, propertySet),
			getValue,
			setCachedValue,
			app,
			apiSet,
			pathToKey,
			monitoredValues,
		};

		// rgbl is a pseudo property to combine colour properties into one panel
		if (property === 'rgbl') {
			props.type = 'rgbl';
			props.name = propertyConfig.name ?? uncamelize(propertySet);
			props.subProperties = {
				luma: {
					...getPropertyProps(api, propertySet, 'luma'),
					classNames: ['luma'],
				},
				red: {
					...getPropertyProps(api, propertySet, 'red'),
					classNames: ['red'],
				},
				green: {
					...getPropertyProps(api, propertySet, 'green'),
					classNames: ['green'],
				},
				blue: {
					...getPropertyProps(api, propertySet, 'blue'),
					classNames: ['blue'],
				},
			}
		}

		return props;
	};

	const createPanelFor = (key) => {
		switch (key) {
			case 'camera-host':
				return <CameraHost value={cameraHost} setValue={setCameraHost} hosts={allHosts} forgetHost={forgetHost} />;
			case 'focus-stops':
				return <FocusStops {...getPropertyProps('focus-stops')} />;
			case 'shutter-angle':
				return <ShutterAngle {...getPropertyProps('shutter-angle')} />;
			case 'auto-focus':
				return <AutoFocus {...getPropertyProps('auto-focus')} />;
			default:
				const { api, propertySet, property } = controls.get(key);
				const props = getPropertyProps(api, propertySet, property);
				return createPanel(props);
		}
	}

	const createPanel = (props) => {
		// For properties with value range
		switch (props.type) {
			case 'range':
				props.showValue = true;
			case 'integer':
			case 'number':
			case 'string':
				return <Slider {...props} />
			case 'boolean':
				return <Toggle {...props} />
			case 'rgbl':
				return <Rgbl {...props} createPanel={createPanel} />
			case 'object':
			default:
				console.error(`Unsupported property type '${type}': ${api} -> ${propertySet} -> ${property}`);
				return;
		}
	};

	return (
		<div id="bmd-cam-control" className={`${connected ? '' : 'disconnected'}`}>
			<nav id="tabs">
				<ol>{tabs.map(tab =>
					<li
						key={tab}
						className={activeTab === tab ? 'active' : ''}
						onClick={() => setActiveTab(tab)}
					>{tab}</li>
				)}</ol>
			</nav>
			<div id="controls" style={{ pointerEvents: connected ? 'auto' : 'none' }} key={panels[activeTab].join('&')}>
				{ Array.from(panels[activeTab]).map(key => {
					if (!loaded) {
						return;
					}
					return createPanelFor(key)
				}) }
			</div>
			<div id="info">
				{connected
					? <div id="connected" title={`Connected to ${cameraHost}`} onClick={() => setActiveTab(SETTINGS)}>🟢 <span class="cameraHost">{cameraHost}</span></div>
					: connecting
						? <div id="disconnected" title="Click to reconnect" onClick={reconnect}>
							⚪️ Trying to connect to <span class="cameraHost">{cameraHost}</span>…
							<div class="lds-ripple"><div></div><div></div></div>
						</div>
						: <div id="disconnected" title="Click to reconnect" onClick={reconnect}>🔴 Not connected to <span class="cameraHost">{cameraHost ?? 'a camera'}</span></div>
				}
				<div id="monitors">
					{monitoredValues.system_format_frameRate != null &&
						monitoredValues.system_format_offSpeedEnabled
							? <div title="Frame rate (off speed rate enabled)" className="highlight">{monitoredValues.system_format_offSpeedFrameRate}/{monitoredValues.system_format_frameRate}fps</div>
							: <div title="Frame rate">{monitoredValues.system_format_frameRate}fps</div>
					}
					{monitoredValues.video_shutter_shutterSpeed != null && <div title="Aperture">1/{monitoredValues.video_shutter_shutterSpeed.toFixed(0)}</div>}
					{monitoredValues.lens_iris_apertureStop != null && <div title="Aperture">f{monitoredValues.lens_iris_apertureStop.toFixed(1)}</div>}
					{monitoredValues.lens_zoom_focalLength != null && <div title="Focal length">{monitoredValues.lens_zoom_focalLength.toFixed(0)}mm</div>}
				</div>
			</div>
		</div>
	);
}

render(<App />, document.getElementById('app'));
