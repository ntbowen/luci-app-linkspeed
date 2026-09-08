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
			E('option', { 'value': 'cn' }, _('中国内地节点')),
			E('option', { 'value': 'global' }, _('海外节点'))
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
			selected.appendChild(E('option', { 'value': '__custom__' }, _('自定义临时链接')));
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
		}, _('填写 0 表示不限制流量，仅按测速时长停止。正数是每个方向的总流量上限，五路并发会平均分配；上下行同时测速会分别计算。'));
		var historyLimit = E('input', {
			'class': 'cbi-input-text', 'type': 'number', 'min': '1', 'max': '200', 'value': '20'
		});
		var historyResult = E('div', {}, _('点击“刷新历史”读取已保存记录。'));
		var result = E('div', { 'class': 'cbi-section' }, [
			E('div', { 'class': 'alert-message notice' }, _('尚未开始测速。'))
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
			var traffic = Number(maxMb.value) === 0 ? _('无限制（需手动停止或等待最长时间结束）') : maxMb.value + ' MB';
			return window.confirm(
				_('即将开始测速/压力测试。') + '\n\n' +
				_('模式：') + mode + '\n' +
				_('最长时间：') + seconds + _(' 秒') + '\n' +
				_('每方向最大总流量：') + traffic + '\n\n' +
				_('测试会持续占用 WAN 带宽，并可能产生大量移动数据。确定继续吗？')
			);
		}

		var live = null;

		function beginLiveChart() {
			var stats = E('p', { 'style': 'font-size:1.15em;font-weight:bold' }, _('等待第一秒采样……'));
			var summary = E('p', {}, '');
			var canvas = E('canvas', { 'width': '640', 'height': '220', 'style': 'width:100%;max-width:900px;height:220px;background:#202020;border-radius:4px' });
			result.innerHTML = '';
			result.appendChild(E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('WAN 实时速度（每秒采样）')),
				stats, summary, canvas,
				E('p', { 'class': 'cbi-value-description' }, _('紫色：下载　青色：上传　数据来源：wwan0 接口字节计数'))
			]));
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
				live.stats.textContent = _('当前下载：') + down.toFixed(2) + ' Mbps　' + _('当前上传：') + up.toFixed(2) + ' Mbps';
				live.summary.textContent = _('平均：') + (sumDown / live.samples.length).toFixed(2) + ' / ' + (sumUp / live.samples.length).toFixed(2) + ' Mbps　' + _('峰值：') + peakDown.toFixed(2) + ' / ' + peakUp.toFixed(2) + ' Mbps';
				var ctx = live.canvas.getContext('2d'), w = live.canvas.width, h = live.canvas.height;
				var max = Math.max(10, peakDown, peakUp) * 1.1;
				ctx.clearRect(0, 0, w, h); ctx.strokeStyle = '#444'; ctx.lineWidth = 1;
				for (var g = 1; g < 4; g++) { ctx.beginPath(); ctx.moveTo(0, h * g / 4); ctx.lineTo(w, h * g / 4); ctx.stroke(); }
				function line(key, color) {
					ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 2;
					live.samples.forEach(function(s, i) { var x = live.samples.length > 1 ? i * w / (live.samples.length - 1) : 0; var y = h - s[key] / max * h; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
					ctx.stroke();
				}
				line('down', '#9b87f5'); line('up', '#58d5d2');
				ctx.fillStyle = '#ddd'; ctx.font = '12px sans-serif'; ctx.fillText(max.toFixed(0) + ' Mbps', 8, 15); ctx.fillText(_('最近最多 600 秒'), w - 110, h - 8);
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
								reject(new Error(body.trim() || _('测速任务失败')));
						}).catch(reject);
					}
					poll();
				});
			});
		}

		function parseMetrics(line) {
			var fields = String(line || '').trim().split('|');
			if (fields.length !== 8)
				throw new Error(_('测速程序返回的数据格式无效'));
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
				setStatus(_('请输入有效的 HTTP/HTTPS 直链。'), 'error');
				return;
			}
			if (!validNumber(duration, 3, 86400) || !validNumber(maxMb, 0, Number.MAX_SAFE_INTEGER)) {
				setStatus(_('请检查测速时长和最大下载量。'), 'error');
				return;
			}
			if (!confirmLongTest(_('单节点下载'))) return;
			setStatus(_('单节点测速中，可随时点击“立即停止”……'), 'notice');
			runJob('linkspeed-test', [ url, duration.value, maxMb.value ]).then(function(res) {
				if (runId !== activeRun) return;
				var data = parseMetrics(res.stdout);
				var mbps = Number(data.speed_download || 0) * 8 / 1000000;
				result.innerHTML = '';
				result.appendChild(E('div', { 'class': 'cbi-section' }, [
					E('h3', {}, _('单节点结果')),
					E('p', { 'style': 'font-size:1.35em;font-weight:bold' }, mbps.toFixed(2) + ' Mbps (' + (mbps / 8).toFixed(2) + ' MB/s)'),
					E('p', {}, _('下载量：') + (Number(data.size_download || 0) / 1048576).toFixed(2) + ' MiB'),
					E('p', {}, 'HTTP ' + data.http_code + '　TTFB ' + (Number(data.time_starttransfer || 0) * 1000).toFixed(1) + ' ms　IP ' + (data.remote_ip || '-'))
				]));
			}).catch(function(err) {
				if (runId === activeRun) setStatus(_('测速失败：') + String(err.message || err), 'error');
			});
		}

		function runMulti() {
			var runId = ++activeRun;
			var targets = activeUrls().slice(0, 5);
			if (targets.length < 2 || !validNumber(duration, 3, 86400) || !validNumber(maxMb, 0, Number.MAX_SAFE_INTEGER)) {
				setStatus(_('节点数量或测速参数无效。'), 'error');
				return;
			}
			if (!confirmLongTest(_('五节点并发下载'))) return;
			setStatus(_('五节点并发测速中，可随时点击“立即停止”……'), 'notice');
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
					E('h3', {}, _('五节点聚合结果')),
					E('p', { 'style': 'font-size:1.35em;font-weight:bold' }, mbps.toFixed(2) + ' Mbps (' + (mbps / 8).toFixed(2) + ' MB/s)'),
					E('p', {}, _('总下载量：') + (bytes / 1048576).toFixed(2) + ' MiB'),
					E('table', { 'class': 'table' }, [
						E('tr', { 'class': 'tr table-titles' }, [ E('th', {}, '#'), E('th', {}, _('节点')), E('th', {}, _('速度')), E('th', {}, 'HTTP'), E('th', {}, 'TTFB') ])
					].concat(rows))
				]));
			}).catch(function(err) {
				if (runId === activeRun) setStatus(_('并发测速失败：') + String(err.message || err), 'error');
			});
		}

		function runUpload() {
			var runId = ++activeRun;
			if (!validNumber(duration, 3, 86400) || !validNumber(maxMb, 0, Number.MAX_SAFE_INTEGER)) {
				setStatus(_('请检查测速时长和每方向最大流量。'), 'error');
				return;
			}
			if (!confirmLongTest(_('五路并发上传'))) return;
			setStatus(_('三路上传测速中，可随时点击“立即停止”……'), 'notice');
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
						E('td', {}, item.http_code ? String(item.http_code) : _('限时结束')),
						E('td', {}, (Number(item.time_total || 0)).toFixed(2) + ' s')
					]);
				});
				result.innerHTML = '';
				result.appendChild(E('div', { 'class': 'cbi-section' }, [
					E('h3', {}, _('三路上传结果')),
					E('p', { 'style': 'font-size:1.35em;font-weight:bold' }, mbps.toFixed(2) + ' Mbps (' + (mbps / 8).toFixed(2) + ' MB/s)'),
					E('p', {}, _('总上传量：') + (bytes / 1048576).toFixed(2) + ' MiB　' + _('接收端点：南京大学')),
					E('table', { 'class': 'table' }, [
						E('tr', { 'class': 'tr table-titles' }, [ E('th', {}, '#'), E('th', {}, _('速度')), E('th', {}, 'HTTP'), E('th', {}, _('用时')) ])
					].concat(rows))
				]));
			}).catch(function(err) {
				if (runId === activeRun) setStatus(_('上传测速失败：') + String(err.message || err), 'error');
			});
		}

		function runDuplex() {
			var runId = ++activeRun;
			var targets = activeUrls().slice(0, 5);
			if (targets.length < 2 || !validNumber(duration, 3, 86400) || !validNumber(maxMb, 0, Number.MAX_SAFE_INTEGER)) {
				setStatus(_('节点数量或测速参数无效。'), 'error');
				return;
			}
			if (!confirmLongTest(_('上下行同时测速'))) return;
			setStatus(_('上下行同时测速中（5 路下载 + 3 路上传）……'), 'notice');
			runJob('linkspeed-duplex', [ duration.value, maxMb.value, activeUploadUrl() ].concat(targets)).then(function(res) {
				if (runId !== activeRun) return;
				var down = [], up = [];
				(res.stdout || '').trim().split(/\n+/).forEach(function(line) {
					if (line.indexOf('D|') === 0) down.push(parseMetrics(line.substring(2)));
					if (line.indexOf('U|') === 0) up.push(parseMetrics(line.substring(2)));
				});
				if (!down.length || !up.length) throw new Error(_('双向测速返回数据不完整'));
				var downBytes = down.reduce(function(sum, item) { return sum + Number(item.size_download || 0); }, 0);
				var upBytes = up.reduce(function(sum, item) { return sum + Number(item.size_download || 0); }, 0);
				var downElapsed = down.reduce(function(max, item) { return Math.max(max, Number(item.time_total || 0)); }, 0);
				var upElapsed = up.reduce(function(max, item) { return Math.max(max, Number(item.time_total || 0)); }, 0);
				var downMbps = downElapsed > 0 ? downBytes * 8 / downElapsed / 1000000 : 0;
				var upMbps = upElapsed > 0 ? upBytes * 8 / upElapsed / 1000000 : 0;
				result.innerHTML = '';
				result.appendChild(E('div', { 'class': 'cbi-section' }, [
					E('h3', {}, _('上下行同时测速结果')),
					E('p', { 'style': 'font-size:1.35em;font-weight:bold' }, _('下载：') + downMbps.toFixed(2) + ' Mbps'),
					E('p', { 'style': 'font-size:1.35em;font-weight:bold' }, _('上传：') + upMbps.toFixed(2) + ' Mbps'),
					E('p', {}, _('下载量：') + (downBytes / 1048576).toFixed(2) + ' MiB　' + _('上传量：') + (upBytes / 1048576).toFixed(2) + ' MiB'),
					E('p', {}, _('双向同时测速反映满负载时的链路能力，结果通常低于分开测试。'))
				]));
			}).catch(function(err) {
				if (runId === activeRun) setStatus(_('双向测速失败：') + String(err.message || err), 'error');
			});
		}

		function stopTest() {
			activeRun++;
			setStatus(_('正在停止测速……'), 'warning');
			fs.exec('/usr/libexec/linkspeed-stop', []).then(function() {
				setStatus(_('测速已停止，所有测速连接均已关闭。'), 'warning');
			}).catch(function(err) {
				setStatus(_('停止失败：') + String(err.message || err), 'error');
			});
		}

		function loadHistory() {
			historyResult.textContent = _('正在读取历史……');
			fs.exec('/usr/libexec/linkspeed-history', [ 'list' ]).then(function(res) {
				var lines = String(res.stdout || '').trim().split(/\n+/).filter(Boolean);
				var rows = lines.map(function(line) {
					var f = line.split('|'), id = f[1], started = Number(f[3]), ended = Number(f[4]);
					return E('tr', {}, [ E('td', {}, new Date(started * 1000).toLocaleString()), E('td', {}, f[2]),
						E('td', {}, Math.max(0, ended - started) + _(' 秒')), E('td', {}, f[6] || '0'),
						E('td', {}, E('button', { 'class': 'btn cbi-button-action', 'click': function() { viewHistory(id); } }, _('查看打点'))) ]);
				});
				historyResult.innerHTML = '';
				historyResult.appendChild(lines.length ? E('table', { 'class': 'table' }, [ E('tr', { 'class': 'tr table-titles' }, [
					E('th', {}, _('开始时间')), E('th', {}, _('模式')), E('th', {}, _('时长')), E('th', {}, _('采样点')), E('th', {}, '')
				]) ].concat(rows)) : E('p', {}, _('暂无测速历史。')));
			}).catch(function(err) { historyResult.textContent = _('读取历史失败：') + String(err.message || err); });
		}

		function viewHistory(jobId) {
			historyResult.textContent = _('正在读取秒级打点……');
			fs.exec('/usr/libexec/linkspeed-history', [ 'detail', jobId ]).then(function(res) {
				var points = String(res.stdout || '').trim().split(/\n+/).filter(function(line) { return line.indexOf('S|') === 0; }).map(function(line) {
					var f = line.split('|'), dt = Math.max(Number(f[2]) || 1, 1);
					return { time: Number(f[1]), down: Number(f[3]) * 8 / dt / 1000000, up: Number(f[4]) * 8 / dt / 1000000 };
				});
				if (!points.length) throw new Error(_('该记录没有速度采样点'));
				var peakDown = 0, peakUp = 0, sumDown = 0, sumUp = 0;
				points.forEach(function(p) { peakDown = Math.max(peakDown, p.down); peakUp = Math.max(peakUp, p.up); sumDown += p.down; sumUp += p.up; });
				var canvas = E('canvas', { 'width': '900', 'height': '320', 'style': 'width:100%;max-width:1000px;height:320px;background:#202020;border-radius:4px;cursor:crosshair' });
				var pointInfo = E('p', { 'style': 'min-height:1.5em;font-weight:bold;color:#ddd' }, _('点击曲线查看某一秒的实际数据。'));
				historyResult.innerHTML = '';
				historyResult.appendChild(E('div', {}, [
					E('p', { 'style': 'font-size:1.15em;font-weight:bold' }, _('平均下载：') + (sumDown / points.length).toFixed(2) + ' Mbps　' + _('平均上传：') + (sumUp / points.length).toFixed(2) + ' Mbps'),
					E('p', {}, _('峰值下载：') + peakDown.toFixed(2) + ' Mbps　' + _('峰值上传：') + peakUp.toFixed(2) + ' Mbps　' + _('采样点：') + points.length),
					canvas, pointInfo,
					E('p', { 'class': 'cbi-value-description' }, _('紫色：下载　青色：上传　每个原始点为一秒采样；长记录仅在绘图时自动抽样。'))
				]));
				var ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height, pad = 34;
				var max = Math.max(10, peakDown, peakUp) * 1.1, step = Math.max(1, Math.ceil(points.length / 1200)), drawn = [];
				for (var i = 0; i < points.length; i += step) {
					var end = Math.min(i + step, points.length), d = 0, u = 0;
					for (var j = i; j < end; j++) { d += points[j].down; u += points[j].up; }
					drawn.push({ down: d / (end - i), up: u / (end - i) });
				}
				ctx.strokeStyle = '#444'; ctx.lineWidth = 1;
				for (var g = 0; g <= 4; g++) { var y = pad + (h - pad * 2) * g / 4; ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(w - pad, y); ctx.stroke(); }
				function draw(key, color) { ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 2; drawn.forEach(function(p, n) { var x = pad + (drawn.length > 1 ? n * (w - pad * 2) / (drawn.length - 1) : 0), y = h - pad - p[key] / max * (h - pad * 2); if (n) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.stroke(); }
				draw('down', '#9b87f5'); draw('up', '#58d5d2');
				ctx.fillStyle = '#ddd'; ctx.font = '13px sans-serif'; ctx.fillText(max.toFixed(0) + ' Mbps', 4, pad); ctx.fillText('0', 18, h - pad); ctx.fillText(new Date(points[0].time * 1000).toLocaleTimeString(), pad, h - 8); ctx.fillText(new Date(points[points.length - 1].time * 1000).toLocaleTimeString(), w - 105, h - 8);
				var baseChart = ctx.getImageData(0, 0, w, h);
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
					pointInfo.textContent = new Date(p.time * 1000).toLocaleString() + '　' + _('下载：') + p.down.toFixed(2) + ' Mbps　' + _('上传：') + p.up.toFixed(2) + ' Mbps';
				});
			}).catch(function(err) { historyResult.textContent = _('读取历史失败：') + String(err.message || err); });
		}

		function loadHistory() {
			fs.exec('/usr/libexec/linkspeed-history', [ 'list' ]).then(function(res) {
				var rows = String(res.stdout || '').trim().split(/\n+/).filter(Boolean).map(function(line) {
					var f = line.split('|'), jobId = f[1];
					return E('tr', {}, [ E('td', {}, new Date(Number(f[3]) * 1000).toLocaleString()),
						E('td', {}, f[2]), E('td', {}, f[6] || '0'),
						E('td', {}, E('button', { 'class': 'btn cbi-button-action', 'click': function() { viewHistory(jobId); } }, _('查看打点'))) ]);
				});
				historyResult.innerHTML = '';
				historyResult.appendChild(E('table', { 'class': 'table' }, [ E('tr', { 'class': 'tr table-titles' }, [
					E('th', {}, _('开始时间')), E('th', {}, _('模式')), E('th', {}, _('采样点')), E('th', {}, _('操作'))
				]) ].concat(rows)));
			}).catch(function(err) { historyResult.textContent = _('读取历史失败：') + String(err.message || err); });
		}

		return E([], [
			E('h2', {}, _('网络测速')),
			E('div', { 'class': 'cbi-map-descr' }, _('即时测速工具，无需保存应用。测速流量由路由器 WAN 出口产生。')),
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('测速参数')),
				E('div', { 'class': 'cbi-value' }, [ E('label', { 'class': 'cbi-value-title' }, _('节点组')), E('div', { 'class': 'cbi-value-field' }, profile) ]),
				E('div', { 'class': 'cbi-value' }, [ E('label', { 'class': 'cbi-value-title' }, _('单节点选择')), E('div', { 'class': 'cbi-value-field' }, selected) ]),
				E('div', { 'class': 'cbi-value' }, [ E('label', { 'class': 'cbi-value-title' }, _('自定义临时链接')), E('div', { 'class': 'cbi-value-field' }, custom) ]),
				E('div', { 'class': 'cbi-value' }, [ E('label', { 'class': 'cbi-value-title' }, _('最长时长（秒）')), E('div', { 'class': 'cbi-value-field' }, duration) ]),
				E('div', { 'class': 'cbi-value' }, [ E('label', { 'class': 'cbi-value-title' }, _('每方向最大总流量（MB）')), E('div', { 'class': 'cbi-value-field' }, [ maxMb, maxMbHint ]) ]),
				E('div', { 'class': 'cbi-value' }, [ E('label', { 'class': 'cbi-value-title' }, _('历史最多保留（次）')), E('div', { 'class': 'cbi-value-field' }, [ historyLimit, E('div', { 'class': 'cbi-value-description' }, _('每次完整测速算一条，范围 1–200；完成后一次性写入硬盘。')) ]) ]),
				E('div', { 'class': 'cbi-page-actions' }, [
					E('button', { 'class': 'btn cbi-button-action', 'click': runSingle }, _('单节点测速')),
					' ', E('button', { 'class': 'btn cbi-button-positive', 'click': runMulti }, _('五节点并发测速')),
					' ', E('button', { 'class': 'btn cbi-button-action', 'click': runUpload }, _('三路上传测速')),
					' ', E('button', { 'class': 'btn cbi-button-positive', 'click': runDuplex }, _('上下行同时测速')),
					' ', E('button', { 'class': 'btn cbi-button-negative', 'click': stopTest }, _('立即停止'))
				])
			]),
			result,
			E('div', { 'class': 'cbi-section' }, [ E('h3', {}, _('测速历史')), E('button', { 'class': 'btn cbi-button-action', 'click': loadHistory }, _('刷新历史')), historyResult ])
		]);
	}
});
