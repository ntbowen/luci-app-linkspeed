'use strict';
'require view';
'require fs';
'require uci';
'require ui';

return view.extend({
	handleSaveApply: null,
	handleSave: null,
	handleReset: null,

	load: function() {
		return uci.load('linkspeed');
	},

	render: function() {
		var cnUrls = uci.get('linkspeed', 'config', 'cn_url') || uci.get('linkspeed', 'config', 'url') || [];
		var globalUrls = uci.get('linkspeed', 'config', 'global_url') || [];
		if (!Array.isArray(cnUrls)) cnUrls = [ cnUrls ];
		if (!Array.isArray(globalUrls)) globalUrls = [ globalUrls ];
		var profile = E('select', { 'class': 'cbi-input-select' }, [
			E('option', { 'value': 'cn' }, _('China mainland nodes')),
			E('option', { 'value': 'global' }, _('Global nodes'))
		]);
		var cnUploadUrl = uci.get('linkspeed', 'config', 'cn_upload_url') || uci.get('linkspeed', 'config', 'upload_url') || 'https://test.nju.edu.cn/backend/empty.php';
		var globalUploadUrl = uci.get('linkspeed', 'config', 'global_upload_url') || cnUploadUrl;

		var activeRun = 0;
		var selected = E('select', { 'class': 'cbi-input-select' });
		function activeUrls() { return profile.value === 'global' ? globalUrls : cnUrls; }
		function activeUploadUrl() { return profile.value === 'global' ? globalUploadUrl : cnUploadUrl; }
		function refreshTargets() {
			selected.innerHTML = '';
			activeUrls().forEach(function(url, index) { selected.appendChild(E('option', { 'value': url }, (index + 1) + '. ' + url)); });
			selected.appendChild(E('option', { 'value': '__custom__' }, _('Custom temporary link')));
		}
		profile.addEventListener('change', refreshTargets);
		refreshTargets();
		var custom = E('input', {
			'class': 'cbi-input-text',
			'type': 'url',
			'placeholder': 'https://example.com/test.bin'
		});
		var duration = E('input', {
			'class': 'cbi-input-text', 'type': 'number', 'min': '3', 'max': '86400',
			'value': uci.get('linkspeed', 'config', 'duration') || '15'
		});
		var maxMb = E('input', {
			'class': 'cbi-input-text', 'type': 'number', 'min': '0',
			'value': uci.get('linkspeed', 'config', 'max_megabytes') || '100'
		});
		var maxMbHint = E('div', {
			'class': 'cbi-value-description',
			'style': 'max-width:52em;line-height:1.55'
		}, _('Enter 0 for unlimited traffic; the test stops when the time limit is reached. A positive value caps the total traffic per direction and is split evenly across the concurrent connections; download and upload are counted separately in duplex mode.'));
		var historyLimit = E('input', {
			'class': 'cbi-input-text', 'type': 'number', 'min': '1', 'max': '200', 'value': '20'
		});
		var historyResult = E('div', {}, _('Click "Refresh history" to load saved records.'));
		var result = E('div', { 'class': 'cbi-section' }, [
			E('div', { 'class': 'alert-message notice' }, _('No speed test has been run yet.'))
		]);

		function setStatus(text, style) {
			result.innerHTML = '';
			result.appendChild(E('div', { 'class': 'alert-message ' + (style || 'notice') }, text));
		}

		function validNumber(input, min, max) {
			var value = Number(input.value);
			return Number.isInteger(value) && value >= min && value <= max;
		}

		function confirmLongTest(mode) {
			var seconds = Number(duration.value);
			var traffic = Number(maxMb.value) === 0 ? _('Unlimited (stop manually or wait for the time limit)') : maxMb.value + ' MB';
			return window.confirm(
				_('A speed test / stress test is about to start.') + '\n\n' +
				_('Mode:') + ' ' + mode + '\n' +
				_('Max duration: %d seconds').format(seconds) + '\n' +
				_('Max traffic per direction:') + ' ' + traffic + '\n\n' +
				_('The test will keep using WAN bandwidth and may consume a large amount of metered data. Continue?')
			);
		}

		var live = null;

		function fitCanvas(canvas, maxWidth, height) {
			var dpr = window.devicePixelRatio || 1;
			var cssWidth = canvas.clientWidth || maxWidth;
			var pw = Math.round(cssWidth * dpr), ph = Math.round(height * dpr);
			if (canvas.width !== pw || canvas.height !== ph) {
				canvas.width = pw;
				canvas.height = ph;
				canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
			}
			return { ctx: canvas.getContext('2d'), w: cssWidth, h: height };
		}

		function beginLiveChart() {
			var stats = E('p', { 'style': 'font-size:1.15em;font-weight:bold' }, _('Waiting for the first sample...'));
			var summary = E('p', {}, '');
			var canvas = E('canvas', { 'style': 'width:100%;max-width:900px;height:220px;background:#202020;border-radius:4px' });
			result.innerHTML = '';
			result.appendChild(E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('WAN Live Speed (per-second sampling)')),
				stats, summary, canvas,
				E('p', { 'class': 'cbi-value-description' }, _('Purple: download') + '  ' + _('Cyan: upload') + '  ' + _('Source: WAN interface byte counters'))
			]));
			fitCanvas(canvas, 900, 220);
			live = { stats: stats, summary: summary, canvas: canvas, previous: null, samples: [] };
		}

		function updateLiveChart(rx, tx) {
			if (!live || !isFinite(rx) || !isFinite(tx)) return;
			var now = Date.now();
			if (live.previous) {
				var seconds = Math.max((now - live.previous.time) / 1000, 0.1);
				var down = Math.max(0, rx - live.previous.rx) * 8 / seconds / 1000000;
				var up = Math.max(0, tx - live.previous.tx) * 8 / seconds / 1000000;
				live.samples.push({ down: down, up: up });
				if (live.samples.length > 600) live.samples.shift();
				var peakDown = 0, peakUp = 0, sumDown = 0, sumUp = 0;
				live.samples.forEach(function(s) {
					peakDown = Math.max(peakDown, s.down); peakUp = Math.max(peakUp, s.up);
					sumDown += s.down; sumUp += s.up;
				});
				live.stats.textContent = _('Download:') + ' ' + down.toFixed(2) + ' Mbps  ' + _('Upload:') + ' ' + up.toFixed(2) + ' Mbps';
				live.summary.textContent = _('Average:') + ' ' + (sumDown / live.samples.length).toFixed(2) + ' / ' + (sumUp / live.samples.length).toFixed(2) + ' Mbps  ' + _('Peak:') + ' ' + peakDown.toFixed(2) + ' / ' + peakUp.toFixed(2) + ' Mbps';
				var fit = fitCanvas(live.canvas, 900, 220), ctx = fit.ctx, w = fit.w, h = fit.h;
				var max = Math.max(10, peakDown, peakUp) * 1.1;
				ctx.clearRect(0, 0, w, h); ctx.strokeStyle = '#444'; ctx.lineWidth = 1;
				for (var g = 1; g < 4; g++) { ctx.beginPath(); ctx.moveTo(0, h * g / 4); ctx.lineTo(w, h * g / 4); ctx.stroke(); }
				function line(key, color) {
					ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 2;
					live.samples.forEach(function(s, i) { var x = live.samples.length > 1 ? i * w / (live.samples.length - 1) : 0; var y = h - s[key] / max * h; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
					ctx.stroke();
				}
				line('down', '#9b87f5'); line('up', '#58d5d2');
				ctx.fillStyle = '#ddd'; ctx.font = '12px sans-serif'; ctx.fillText(max.toFixed(0) + ' Mbps', 8, 15);
				ctx.textAlign = 'right'; ctx.fillText(_('Last 600 s max'), w - 8, h - 8); ctx.textAlign = 'left';
			}
			live.previous = { rx: rx, tx: tx, time: now };
		}

		function runJob(program, args) {
			var jobId = String(Date.now());
			beginLiveChart();
			return fs.exec('/usr/libexec/linkspeed-start', [ jobId, program, historyLimit.value ].concat(args)).then(function() {
				return new Promise(function(resolve, reject) {
					function poll() {
						fs.exec('/usr/libexec/linkspeed-status', [ jobId ]).then(function(res) {
							var output = String(res.stdout || '');
							var pos = output.indexOf('\n');
							var header = (pos >= 0 ? output.substring(0, pos) : output).trim().split('|');
							var state = header[0];
							var body = pos >= 0 ? output.substring(pos + 1) : '';
							updateLiveChart(Number(header[1]), Number(header[2]));
							if (state === 'RUNNING')
								window.setTimeout(poll, 1000);
							else if (state === 'DONE')
								resolve({ stdout: body });
							else
								reject(new Error(body.trim() || _('Speed test job failed')));
						}).catch(reject);
					}
					poll();
				});
			});
		}

		function parseMetrics(line) {
			var fields = String(line || '').trim().split('|');
			if (fields.length !== 8)
				throw new Error(_('Invalid data format returned by the test program'));
			return {
				http_code: Number(fields[0] || 0),
				remote_ip: fields[1] || '',
				size_download: Number(fields[2] || 0),
				speed_download: Number(fields[3] || 0),
				time_namelookup: Number(fields[4] || 0),
				time_connect: Number(fields[5] || 0),
				time_starttransfer: Number(fields[6] || 0),
				time_total: Number(fields[7] || 0)
			};
		}

		function runSingle() {
			var runId = ++activeRun;
			var url = selected.value === '__custom__' ? custom.value.trim() : selected.value;
			if (!/^https?:\/\//i.test(url)) {
				setStatus(_('Please enter a valid HTTP/HTTPS direct link.'), 'error');
				return;
			}
			if (!validNumber(duration, 3, 86400) || !validNumber(maxMb, 0, Number.MAX_SAFE_INTEGER)) {
				setStatus(_('Please check the test duration and max download size.'), 'error');
				return;
			}
			if (!confirmLongTest(_('Single-node download'))) return;
			setStatus(_('Single-node test running; click "Stop now" at any time...'), 'notice');
			runJob('linkspeed-test', [ url, duration.value, maxMb.value ]).then(function(res) {
				if (runId !== activeRun) return;
				var data = parseMetrics(res.stdout);
				var mbps = Number(data.speed_download || 0) * 8 / 1000000;
				result.innerHTML = '';
				result.appendChild(E('div', { 'class': 'cbi-section' }, [
					E('h3', {}, _('Single-node Result')),
					E('p', { 'style': 'font-size:1.35em;font-weight:bold' }, mbps.toFixed(2) + ' Mbps (' + (mbps / 8).toFixed(2) + ' MB/s)'),
					E('p', {}, _('Downloaded:') + ' ' + (Number(data.size_download || 0) / 1048576).toFixed(2) + ' MiB'),
					E('p', {}, 'HTTP ' + data.http_code + '  TTFB ' + (Number(data.time_starttransfer || 0) * 1000).toFixed(1) + ' ms  IP ' + (data.remote_ip || '-'))
				]));
			}).catch(function(err) {
				if (runId === activeRun) setStatus(_('Test failed:') + ' ' + String(err.message || err), 'error');
			});
		}

		function runMulti() {
			var runId = ++activeRun;
			var targets = activeUrls().slice(0, 5);
			if (targets.length < 2 || !validNumber(duration, 3, 86400) || !validNumber(maxMb, 0, Number.MAX_SAFE_INTEGER)) {
				setStatus(_('Invalid node count or test parameters.'), 'error');
				return;
			}
			if (!confirmLongTest(_('5-node concurrent download'))) return;
			setStatus(_('5-node concurrent test running; click "Stop now" at any time...'), 'notice');
			runJob('linkspeed-test-multi', [ duration.value, maxMb.value ].concat(targets)).then(function(res) {
				if (runId !== activeRun) return;
				var results = (res.stdout || '').trim().split(/\n+/).map(parseMetrics);
				var bytes = results.reduce(function(sum, item) { return sum + Number(item.size_download || 0); }, 0);
				var elapsed = results.reduce(function(max, item) { return Math.max(max, Number(item.time_total || 0)); }, 0);
				var rows = results.map(function(item, index) {
					return E('tr', {}, [
						E('td', {}, String(index + 1)),
						E('td', { 'style': 'word-break:break-all' }, targets[index]),
						E('td', {}, (Number(item.speed_download || 0) * 8 / 1000000).toFixed(2) + ' Mbps'),
						E('td', {}, String(item.http_code || 0)),
						E('td', {}, (Number(item.time_starttransfer || 0) * 1000).toFixed(1) + ' ms')
					]);
				});
				var mbps = elapsed > 0 ? bytes * 8 / elapsed / 1000000 : 0;
				result.innerHTML = '';
				result.appendChild(E('div', { 'class': 'cbi-section' }, [
					E('h3', {}, _('5-node Aggregate Result')),
					E('p', { 'style': 'font-size:1.35em;font-weight:bold' }, mbps.toFixed(2) + ' Mbps (' + (mbps / 8).toFixed(2) + ' MB/s)'),
					E('p', {}, _('Total downloaded:') + ' ' + (bytes / 1048576).toFixed(2) + ' MiB'),
					E('table', { 'class': 'table' }, [
						E('tr', { 'class': 'tr table-titles' }, [ E('th', {}, '#'), E('th', {}, _('Node')), E('th', {}, _('Speed')), E('th', {}, 'HTTP'), E('th', {}, 'TTFB') ])
					].concat(rows))
				]));
			}).catch(function(err) {
				if (runId === activeRun) setStatus(_('Concurrent test failed:') + ' ' + String(err.message || err), 'error');
			});
		}

		function runUpload() {
			var runId = ++activeRun;
			if (!validNumber(duration, 3, 86400) || !validNumber(maxMb, 0, Number.MAX_SAFE_INTEGER)) {
				setStatus(_('Please check the test duration and max traffic per direction.'), 'error');
				return;
			}
			if (!confirmLongTest(_('3-way concurrent upload'))) return;
			setStatus(_('3-way upload test running; click "Stop now" at any time...'), 'notice');
			runJob('linkspeed-upload-multi', [ duration.value, maxMb.value, activeUploadUrl(), '3' ]).then(function(res) {
				if (runId !== activeRun) return;
				var results = (res.stdout || '').trim().split(/\n+/).map(parseMetrics);
				var bytes = results.reduce(function(sum, item) { return sum + Number(item.size_download || 0); }, 0);
				var elapsed = results.reduce(function(max, item) { return Math.max(max, Number(item.time_total || 0)); }, 0);
				var mbps = elapsed > 0 ? bytes * 8 / elapsed / 1000000 : 0;
				var rows = results.map(function(item, index) {
					return E('tr', {}, [
						E('td', {}, String(index + 1)),
						E('td', {}, (Number(item.speed_download || 0) * 8 / 1000000).toFixed(2) + ' Mbps'),
						E('td', {}, item.http_code ? String(item.http_code) : _('Time limit reached')),
						E('td', {}, (Number(item.time_total || 0)).toFixed(2) + ' s')
					]);
				});
				result.innerHTML = '';
				result.appendChild(E('div', { 'class': 'cbi-section' }, [
					E('h3', {}, _('3-way Upload Result')),
					E('p', { 'style': 'font-size:1.35em;font-weight:bold' }, mbps.toFixed(2) + ' Mbps (' + (mbps / 8).toFixed(2) + ' MB/s)'),
					E('p', {}, _('Total uploaded:') + ' ' + (bytes / 1048576).toFixed(2) + ' MiB  ' + _('Endpoint:') + ' ' + activeUploadUrl()),
					E('table', { 'class': 'table' }, [
						E('tr', { 'class': 'tr table-titles' }, [ E('th', {}, '#'), E('th', {}, _('Speed')), E('th', {}, 'HTTP'), E('th', {}, _('Time')) ])
					].concat(rows))
				]));
			}).catch(function(err) {
				if (runId === activeRun) setStatus(_('Upload test failed:') + ' ' + String(err.message || err), 'error');
			});
		}

		function runDuplex() {
			var runId = ++activeRun;
			var targets = activeUrls().slice(0, 5);
			if (targets.length < 2 || !validNumber(duration, 3, 86400) || !validNumber(maxMb, 0, Number.MAX_SAFE_INTEGER)) {
				setStatus(_('Invalid node count or test parameters.'), 'error');
				return;
			}
			if (!confirmLongTest(_('Duplex test (down+up)'))) return;
			setStatus(_('Duplex test running (5 download + 3 upload streams)...'), 'notice');
			runJob('linkspeed-duplex', [ duration.value, maxMb.value, activeUploadUrl() ].concat(targets)).then(function(res) {
				if (runId !== activeRun) return;
				var down = [], up = [];
				(res.stdout || '').trim().split(/\n+/).forEach(function(line) {
					if (line.indexOf('D|') === 0) down.push(parseMetrics(line.substring(2)));
					if (line.indexOf('U|') === 0) up.push(parseMetrics(line.substring(2)));
				});
				if (!down.length || !up.length) throw new Error(_('Incomplete data returned by the duplex test'));
				var downBytes = down.reduce(function(sum, item) { return sum + Number(item.size_download || 0); }, 0);
				var upBytes = up.reduce(function(sum, item) { return sum + Number(item.size_download || 0); }, 0);
				var downElapsed = down.reduce(function(max, item) { return Math.max(max, Number(item.time_total || 0)); }, 0);
				var upElapsed = up.reduce(function(max, item) { return Math.max(max, Number(item.time_total || 0)); }, 0);
				var downMbps = downElapsed > 0 ? downBytes * 8 / downElapsed / 1000000 : 0;
				var upMbps = upElapsed > 0 ? upBytes * 8 / upElapsed / 1000000 : 0;
				result.innerHTML = '';
				result.appendChild(E('div', { 'class': 'cbi-section' }, [
					E('h3', {}, _('Duplex Test Result')),
					E('p', { 'style': 'font-size:1.35em;font-weight:bold' }, _('Download:') + ' ' + downMbps.toFixed(2) + ' Mbps'),
					E('p', { 'style': 'font-size:1.35em;font-weight:bold' }, _('Upload:') + ' ' + upMbps.toFixed(2) + ' Mbps'),
					E('p', {}, _('Downloaded:') + ' ' + (downBytes / 1048576).toFixed(2) + ' MiB  ' + _('Uploaded:') + ' ' + (upBytes / 1048576).toFixed(2) + ' MiB'),
					E('p', {}, _('Simultaneous bidirectional testing reflects link capacity under full load; results are usually lower than separate tests.'))
				]));
			}).catch(function(err) {
				if (runId === activeRun) setStatus(_('Duplex test failed:') + ' ' + String(err.message || err), 'error');
			});
		}

		function stopTest() {
			activeRun++;
			setStatus(_('Stopping test...'), 'warning');
			fs.exec('/usr/libexec/linkspeed-stop', []).then(function() {
				setStatus(_('Test stopped; all test connections closed.'), 'warning');
			}).catch(function(err) {
				setStatus(_('Stop failed:') + ' ' + String(err.message || err), 'error');
			});
		}

		function loadHistory() {
			historyResult.textContent = _('Loading history...');
			fs.exec('/usr/libexec/linkspeed-history', [ 'list' ]).then(function(res) {
				var lines = String(res.stdout || '').trim().split(/\n+/).filter(Boolean);
				var rows = lines.map(function(line) {
					var f = line.split('|'), id = f[1], started = Number(f[3]), ended = Number(f[4]);
					return E('tr', {}, [ E('td', {}, new Date(started * 1000).toLocaleString()), E('td', {}, f[2]),
						E('td', {}, _('%d seconds').format(Math.max(0, ended - started))), E('td', {}, f[6] || '0'),
						E('td', {}, E('button', { 'class': 'btn cbi-button-action', 'click': function() { viewHistory(id); } }, _('View samples'))) ]);
				});
				historyResult.innerHTML = '';
				historyResult.appendChild(lines.length ? E('table', { 'class': 'table' }, [ E('tr', { 'class': 'tr table-titles' }, [
					E('th', {}, _('Start time')), E('th', {}, _('Mode')), E('th', {}, _('Duration')), E('th', {}, _('Samples')), E('th', {}, '')
				]) ].concat(rows)) : E('p', {}, _('No test history yet.')));
			}).catch(function(err) { historyResult.textContent = _('Failed to load history:') + ' ' + String(err.message || err); });
		}

		function viewHistory(jobId) {
			historyResult.textContent = _('Loading per-second samples...');
			fs.exec('/usr/libexec/linkspeed-history', [ 'detail', jobId ]).then(function(res) {
				var points = String(res.stdout || '').trim().split(/\n+/).filter(function(line) { return line.indexOf('S|') === 0; }).map(function(line) {
					var f = line.split('|'), dt = Math.max(Number(f[2]) || 1, 1);
					return { time: Number(f[1]), down: Number(f[3]) * 8 / dt / 1000000, up: Number(f[4]) * 8 / dt / 1000000 };
				});
				if (!points.length) throw new Error(_('This record has no speed samples'));
				var peakDown = 0, peakUp = 0, sumDown = 0, sumUp = 0;
				points.forEach(function(p) { peakDown = Math.max(peakDown, p.down); peakUp = Math.max(peakUp, p.up); sumDown += p.down; sumUp += p.up; });
				var canvas = E('canvas', { 'style': 'width:100%;max-width:1000px;height:320px;background:#202020;border-radius:4px;cursor:crosshair' });
				var pointInfo = E('p', { 'style': 'min-height:1.5em;font-weight:bold;color:#ddd' }, _('Click the curve to inspect a specific second.'));
				historyResult.innerHTML = '';
				historyResult.appendChild(E('div', {}, [
					E('p', { 'style': 'font-size:1.15em;font-weight:bold' }, _('Avg download:') + ' ' + (sumDown / points.length).toFixed(2) + ' Mbps  ' + _('Avg upload:') + ' ' + (sumUp / points.length).toFixed(2) + ' Mbps'),
					E('p', {}, _('Peak download:') + ' ' + peakDown.toFixed(2) + ' Mbps  ' + _('Peak upload:') + ' ' + peakUp.toFixed(2) + ' Mbps  ' + _('Samples:') + ' ' + points.length),
					canvas, pointInfo,
					E('p', { 'class': 'cbi-value-description' }, _('Purple: download') + '  ' + _('Cyan: upload') + '  ' + _('Each raw point is a 1-second sample; long records are downsampled only when drawing.'))
				]));
				var pad = 34, ctx, w, h, max, baseChart;
				function repaint() {
					if (!canvas.isConnected) { window.removeEventListener('resize', repaint); return; }
					var fit = fitCanvas(canvas, 1000, 320);
					ctx = fit.ctx; w = fit.w; h = fit.h;
					max = Math.max(10, peakDown, peakUp) * 1.1;
					var step = Math.max(1, Math.ceil(points.length / 1200)), drawn = [];
					for (var i = 0; i < points.length; i += step) {
						var end = Math.min(i + step, points.length), d = 0, u = 0;
						for (var j = i; j < end; j++) { d += points[j].down; u += points[j].up; }
						drawn.push({ down: d / (end - i), up: u / (end - i) });
					}
					ctx.strokeStyle = '#444'; ctx.lineWidth = 1;
					for (var g = 0; g <= 4; g++) { var y = pad + (h - pad * 2) * g / 4; ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(w - pad, y); ctx.stroke(); }
					function draw(key, color) { ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 2; drawn.forEach(function(p, n) { var x = pad + (drawn.length > 1 ? n * (w - pad * 2) / (drawn.length - 1) : 0), y = h - pad - p[key] / max * (h - pad * 2); if (n) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.stroke(); }
					draw('down', '#9b87f5'); draw('up', '#58d5d2');
					ctx.fillStyle = '#ddd'; ctx.font = '13px sans-serif'; ctx.fillText(max.toFixed(0) + ' Mbps', 4, pad); ctx.fillText('0', 18, h - pad); ctx.fillText(new Date(points[0].time * 1000).toLocaleTimeString(), pad, h - 8);
					ctx.textAlign = 'right'; ctx.fillText(new Date(points[points.length - 1].time * 1000).toLocaleTimeString(), w - 8, h - 8); ctx.textAlign = 'left';
					baseChart = ctx.getImageData(0, 0, canvas.width, canvas.height);
				}
				window.addEventListener('resize', repaint);
				repaint();
				canvas.addEventListener('click', function(ev) {
					var rect = canvas.getBoundingClientRect();
					var ratio = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
					var index = Math.round(ratio * (points.length - 1));
					var p = points[index];
					var x = pad + ratio * (w - pad * 2);
					var downY = h - pad - p.down / max * (h - pad * 2);
					var upY = h - pad - p.up / max * (h - pad * 2);
					ctx.putImageData(baseChart, 0, 0);
					ctx.strokeStyle = '#eee'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, pad); ctx.lineTo(x, h - pad); ctx.stroke();
					function marker(y, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.stroke(); }
					marker(downY, '#9b87f5'); marker(upY, '#58d5d2');
					pointInfo.textContent = new Date(p.time * 1000).toLocaleString() + '  ' + _('Download:') + ' ' + p.down.toFixed(2) + ' Mbps  ' + _('Upload:') + ' ' + p.up.toFixed(2) + ' Mbps';
				});
			}).catch(function(err) { historyResult.textContent = _('Failed to load history:') + ' ' + String(err.message || err); });
		}

		function loadHistory() {
			fs.exec('/usr/libexec/linkspeed-history', [ 'list' ]).then(function(res) {
				var rows = String(res.stdout || '').trim().split(/\n+/).filter(Boolean).map(function(line) {
					var f = line.split('|'), jobId = f[1];
					return E('tr', {}, [ E('td', {}, new Date(Number(f[3]) * 1000).toLocaleString()),
						E('td', {}, f[2]), E('td', {}, f[6] || '0'),
						E('td', {}, E('button', { 'class': 'btn cbi-button-action', 'click': function() { viewHistory(jobId); } }, _('View samples'))) ]);
				});
				historyResult.innerHTML = '';
				historyResult.appendChild(E('table', { 'class': 'table' }, [ E('tr', { 'class': 'tr table-titles' }, [
					E('th', {}, _('Start time')), E('th', {}, _('Mode')), E('th', {}, _('Samples')), E('th', {}, _('Actions'))
				]) ].concat(rows)));
			}).catch(function(err) { historyResult.textContent = _('Failed to load history:') + ' ' + String(err.message || err); });
		}

		return E([], [
			E('h2', {}, _('Network Speed Test')),
			E('div', { 'class': 'cbi-map-descr' }, _('Instant speed test tool; no save & apply needed. Test traffic is generated by the router WAN egress.')),
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Test Parameters')),
				E('div', { 'class': 'cbi-value' }, [ E('label', { 'class': 'cbi-value-title' }, _('Node group')), E('div', { 'class': 'cbi-value-field' }, profile) ]),
				E('div', { 'class': 'cbi-value' }, [ E('label', { 'class': 'cbi-value-title' }, _('Single node selection')), E('div', { 'class': 'cbi-value-field' }, selected) ]),
				E('div', { 'class': 'cbi-value' }, [ E('label', { 'class': 'cbi-value-title' }, _('Custom temporary link')), E('div', { 'class': 'cbi-value-field' }, custom) ]),
				E('div', { 'class': 'cbi-value' }, [ E('label', { 'class': 'cbi-value-title' }, _('Max duration (seconds)')), E('div', { 'class': 'cbi-value-field' }, duration) ]),
				E('div', { 'class': 'cbi-value' }, [ E('label', { 'class': 'cbi-value-title' }, _('Max total traffic per direction (MB)')), E('div', { 'class': 'cbi-value-field' }, [ maxMb, maxMbHint ]) ]),
				E('div', { 'class': 'cbi-value' }, [ E('label', { 'class': 'cbi-value-title' }, _('History entries to keep')), E('div', { 'class': 'cbi-value-field' }, [ historyLimit, E('div', { 'class': 'cbi-value-description' }, _('Each completed test counts as one entry, range 1-200; written to storage once finished.')) ]) ]),
				E('div', { 'class': 'cbi-page-actions' }, [
					E('button', { 'class': 'btn cbi-button-action', 'click': runSingle }, _('Single-node test')),
					' ', E('button', { 'class': 'btn cbi-button-positive', 'click': runMulti }, _('5-node concurrent test')),
					' ', E('button', { 'class': 'btn cbi-button-action', 'click': runUpload }, _('3-way upload test')),
					' ', E('button', { 'class': 'btn cbi-button-positive', 'click': runDuplex }, _('Duplex test (down+up)')),
					' ', E('button', { 'class': 'btn cbi-button-negative', 'click': stopTest }, _('Stop now'))
				])
			]),
			result,
			E('div', { 'class': 'cbi-section' }, [ E('h3', {}, _('Test History')), E('button', { 'class': 'btn cbi-button-action', 'click': loadHistory }, _('Refresh history')), historyResult ])
		]);
	}
});
