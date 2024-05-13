export default {
	system: {
		_swagger: 'SystemControl.yaml',
		format: {
			frameRate: {
				liveUpdate: false,
			},
			offSpeedFrameRate: {
				liveUpdate: false,
				step: 1,
				marks: ({ getPropertyConfig, getValue }) => {
					const frameRate = Number(getValue('system', 'format', 'frameRate'));
					const { minimum, maximum } = getPropertyConfig('system', 'format', 'offSpeedFrameRate');
					return [
						Math.round(frameRate / 8),
						Math.round(frameRate / 4),
						Math.round(frameRate / 2),
						Math.round(frameRate),
						Math.round(frameRate * 1.5),
						Math.round(frameRate * 2),
						Math.round(frameRate * 2.5),
					].filter(v => v >= minimum && v <= maximum)
				},
				symbolic: ({ getValue }) => [ getValue('system', 'format', 'frameRate') ],
			}
		},
	},
	lens: {
		_swagger: 'LensControl.yaml',
		iris: {
			apertureStop: {
				values: () => {
					const s = Math.sqrt(2);
					const values = [];
					// we want powers of thirds and halves
					for (let i=0; i<=60; i++) {
						if (i % 6 === 1 || i % 6 === 5) {
							continue;
						}
						values.push(Math.pow(s,i/6));
					}
					return values;
				},
				name: 'Aperture',
				liveUpdate: false,
				valueFormatter: value => `f${value != null ? value.toFixed(1) : ''}`,
				markFormatter: value => value != null ? (value <= 8 ? value.toFixed(1) : value.toFixed(0)) : '',
				// showLabelEvery: 4,
				liveUpdate: false,
			},
		},
		focus: {
			normalised: {
				name: 'Focus',
				type: 'range',
				maximum: 1,
				minimum: 0,
				step: 0.01,
			}
		},
		focus_doAutoFocus: {
			// as this affects the values of focus, that's what we need to call to get its value
			_getter: 'focus',
		},
	},
	video: {
		_swagger: 'VideoControl.yaml',
		gain: {
			gain: {
				values: [-12, -10, -8, -6, -4, -2, 0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, ],
				symbolic: {
					0: 'Native gain (low)',
					18: 'Native gain (high)',
				},
				defaultValue: 0,
				valueFormatter: value => `${value} dB`,
				showLabelEvery: 3,
			},
		},
		iso: {
			iso: {
				values: [100, 125, 160, 200, 250, 320, 400, 500, 640, 800, 1000, 1250, 1600, 2000, 2500, 3200, 4000, 5000, 6400, 8000, 10000, 12800, 16000, 20000, 25600, ],
				showLabelEvery: 3,
				symbolic: {
					400: 'Native ISO (low)',
					3200: 'Native ISO (high)',
				},
				defaultValue: 400,
				liveUpdate: false,
			},
		},
		shutter: {
			shutterSpeed: {
				values: ({ getValue }) => {
					const values = [24, 25, 30, 48, 50, 60, 100, 125, 200, 250, 500, 1000, 2000];
					const frameRate = Number(getValue('system', 'format', 'frameRate'));
					return values.filter((value) => value >= frameRate);
				},
				liveUpdate: false,
				defaultValue: 24,
				valueFormatter: value => `1/${value}`,
				liveUpdate: false,
			},
		},
		whiteBalance: {
			whiteBalance: {
				minimum: 2500,
				maximum: 10000,
				step: 50,
				defaultValue: 5600,
				symbolic: {
					3200: '💡', // Tungsten
					4000: '🔋', //'Fluorescent
					4500: '🕶️', // Shade
					5600: '☀️', // Sunlight
					6500: '🌥️', // Cloudy
				},
			},
		},
		whiteBalanceTint: {
			whiteBalanceTint: {
			},
		},
	},
	colorCorrection: {
		_swagger: 'ColorCorrectionControl.yaml',
		color: {
			saturation: {
				step: 0.02,
				defaultValue: 1,
				valueFormatter: v => `${(v * 50).toFixed()}%`,
			},
			hue: {
				step: 1/180,
				valueFormatter: v => `${((v + 1) * 180).toFixed()}°`,
			},
		},
		contrast: {
			pivot: {
				name: 'Pivot',
				step: 0.01,
				defaultValue: 0.5,
			},
			adjust: {
				name: 'Contrast',
				step: 0.02,
				maximum: 2,
				minimum: 0,
				defaultValue: 1,
				valueFormatter: v => `${(v * 50).toFixed()}%`,
			},
		},
		lumaContribution: {
			lumaContribution: {
				step: 0.01,
			},
		},
		lift: {
			red: {
				step: 0.01,
				defaultValue: 0,
			},
			green: {
				step: 0.01,
				defaultValue: 0,
			},
			blue: {
				step: 0.01,
				defaultValue: 0,
			},
			luma: {
				step: 0.01,
				defaultValue: 0,
			},
		},
		gamma: {
			red: {
				step: 0.01,
				defaultValue: 0,
			},
			green: {
				step: 0.01,
				defaultValue: 0,
			},
			blue: {
				step: 0.01,
				defaultValue: 0,
			},
			luma: {
				step: 0.01,
				defaultValue: 0,
			},
		},
		gain: {
			red: {
				step: 0.01,
				defaultValue: 1,
			},
			green: {
				step: 0.01,
				defaultValue: 1,
			},
			blue: {
				step: 0.01,
				defaultValue: 1,
			},
			luma: {
				step: 0.01,
				defaultValue: 1,
			},
		},
		offset: {
			red: {
				step: 0.01,
				defaultValue: 0,
			},
			green: {
				step: 0.01,
				defaultValue: 0,
			},
			blue: {
				step: 0.01,
				defaultValue: 0,
			},
			luma: {
				step: 0.01,
				defaultValue: 0,
			},
		},
	},
	'shutter-angle': {
		type: 'number',
		name: 'Shutter angle',
		maximum: 360,
		minimum: 1,
		step: 1,
		liveUpdate: false,
		marks: [45, 90, 135, 180, 225, 270, 315, 360],
		symbolic: [180],
	}
};
