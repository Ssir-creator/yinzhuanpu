'use strict';
const $ = (selector) => document.querySelector(selector);
const sides = ['reference', 'practice'];
const labels = { reference: '参考侧', practice: '练习侧' };
const colors = { reference: '#397561', practice: '#ba784f' };
const techniques = {
  roll: ['轮指', '用连续拨弦，观察起音间隔和音量变化。示例不代表专业演奏标准。'],
};
let context, technique = 'roll', generation = 0, busy = false;
let sequence = false, playGeneration = 0;
const tracks = { reference: null, practice: null };

$('#cards').innerHTML = sides.map(side => `
  <article class="audio-card ${side}" data-side="${side}">
    <div class="card-heading"><div><span class="dot"></span><h3>${labels[side]}</h3><small>${side.toUpperCase()}</small></div><label class="upload">＋ 导入音频<input type="file" accept="audio/*,.wav,.mp3,.m4a,.ogg,.flac" data-upload="${side}" aria-label="导入${labels[side]}音频"></label></div>
    <p class="filename" id="${side}-name">加载中</p>
    <div class="player"><button class="play" data-play="${side}" aria-label="播放${labels[side]}" disabled>▶</button><div><strong id="${side}-time">0:00 / 0:00</strong><small>点击波形可定位</small></div><span class="source" id="${side}-source">合成演示</span></div>
    <div class="region-controls"><label>选区起点 <input id="${side}-start" type="number" min="0" step="0.1" value="0"> 秒</label><label>终点 <input id="${side}-end" type="number" min="0" step="0.1" value="6"> 秒</label><button data-region="${side}" class="quiet">应用选区</button><button data-clip="${side}" class="quiet">▶ 试听选区</button></div>
    <div class="chart-label">波形 <small>AMPLITUDE / TIME</small></div><div class="wave-wrap"><canvas id="${side}-wave" height="100" tabindex="0" role="slider" aria-label="${labels[side]}音频位置" aria-valuemin="0" aria-valuemax="6" aria-valuenow="0"></canvas><div class="playhead" id="${side}-head"></div></div><div class="axis"><span>0 s</span><span id="${side}-duration">6 s</span></div>
    <details class="technical"><summary>展开辅助频谱与音量包络</summary><div class="chart-label">频谱 <small>FREQUENCY / TIME</small></div><div class="spec-wrap"><canvas id="${side}-spec" height="160" role="img" aria-label="${labels[side]}频谱图"></canvas><div class="freq-labels" id="${side}-freq"></div></div><div class="axis"><span>低能量 <span class="gradient"></span> 高能量</span><span>dB · 相对各自峰值</span></div>
    <div class="chart-label">音量包络 <small>RMS / TIME</small></div><canvas id="${side}-envelope" height="75" role="img" aria-label="${labels[side]}音量包络"></canvas><div class="stats" id="${side}-stats"></div></details>
  </article>`).join('');
$('.sound-bars').innerHTML = Array.from({ length: 43 }, (_, i) => `<i style="height:${12 + 88 * Math.abs(Math.sin(i * 1.73)) * Math.sin((i + 1) / 44 * Math.PI)}%"></i>`).join('');

function audioContext() {
  if (!context) context = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 22050 });
  return context;
}
function status(message, error = false) {
  $('#status').textContent = message;
  $('#status').classList.toggle('error', error);
}
function setBusy(value) {
  busy = value;
  document.querySelectorAll('[data-play], [data-upload], #listen, #export').forEach(el => {
    el.disabled = value || !tracks.reference || !tracks.practice;
  });
}
function fft(real, imag) {
  const n = real.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [real[i], real[j]] = [real[j], real[i]]; [imag[i], imag[j]] = [imag[j], imag[i]]; }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const angle = -2 * Math.PI / size;
    for (let start = 0; start < n; start += size) {
      for (let j = 0; j < size / 2; j++) {
        const c = Math.cos(angle * j), s = Math.sin(angle * j);
        const a = start + j, b = a + size / 2;
        const re = real[b] * c - imag[b] * s, im = real[b] * s + imag[b] * c;
        real[b] = real[a] - re; imag[b] = imag[a] - im;
        real[a] += re; imag[a] += im;
      }
    }
  }
}
const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
const deviation = values => Math.sqrt(mean(values.map(v => (v - mean(values)) ** 2)));
function analyze(buffer) {
  const rate = buffer.sampleRate, length = buffer.length;
  const data = new Float32Array(length);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const channel = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) data[i] += channel[i] / buffer.numberOfChannels;
  }
  const hop = Math.round(rate * .01), size = 1024;
  const envelope = [], spectra = [], onsets = [];
  let energy = 0, peak = 0, maxPower = 0, weightedFrequency = 0, totalPower = 0;
  for (const sample of data) { energy += sample * sample; peak = Math.max(peak, Math.abs(sample)); }
  const win = Float32Array.from({ length: size }, (_, i) => .5 - .5 * Math.cos(2 * Math.PI * i / (size - 1)));
  for (let start = 0; start < length; start += hop) {
    let sum = 0;
    const end = Math.min(start + hop, length);
    for (let i = start; i < end; i++) sum += data[i] ** 2;
    envelope.push(Math.sqrt(sum / (end - start)));
    const real = new Float32Array(size), imag = new Float32Array(size);
    for (let i = 0; i < size; i++) real[i] = (data[start + i] || 0) * win[i];
    fft(real, imag);
    const powers = new Float32Array(size / 2 + 1);
    for (let k = 0; k < powers.length; k++) {
      const power = real[k] ** 2 + imag[k] ** 2;
      powers[k] = power; maxPower = Math.max(maxPower, power);
      weightedFrequency += power * k * rate / size; totalPower += power;
    }
    spectra.push(powers);
  }
  const onsetsFound = detectOnsets(envelope, hop, rate);
  onsets.push(...onsetsFound);
  const intervals = onsets.slice(1).map((t, i) => (t - onsets[i]) * 1000);
  return { data, rate, envelope, spectra, maxPower, hop, size, stats: {
    duration: buffer.duration, sampleRate: rate, channels: buffer.numberOfChannels,
    rmsDbFS: energy > 0 ? 20 * Math.log10(Math.sqrt(energy / length)) : null,
    peakDbFS: peak > 0 ? 20 * Math.log10(peak) : null,
    centroidHz: totalPower > 0 ? weightedFrequency / totalPower : null,
    onsetCount: onsets.length, onsetTimesSeconds: onsets,
    meanOnsetIntervalMs: intervals.length ? mean(intervals) : null,
    onsetIntervalCV: intervals.length > 1 ? deviation(intervals) / mean(intervals) : null,
  } };
}
async function prepare(bytes, name, synthetic) {
  let buffer;
  try { buffer = await audioContext().decodeAudioData(bytes); }
  catch { throw new Error('无法解码这份音频，请尝试 WAV 或 MP3 文件。'); }
  if (buffer.duration > 30) throw new Error('音频超过 30 秒，请先裁剪后再导入。');
  if (buffer.duration < .1) throw new Error('音频太短，请使用至少 0.1 秒的片段。');
  return { buffer, name, synthetic, analysis: analyze(buffer), offset: 0, source: null, started: 0, region: [0, buffer.duration] };
}
async function loadTechnique(next) {
  const ticket = ++generation;
  stopAll(); setBusy(true); status(`正在准备${techniques[next][0]}素材…`);
  try {
    const results = await Promise.all(sides.map(async side => {
      const name = `${next}-${side}.wav`;
      let bytes;
      if (window.DEMO_AUDIO?.[name]) {
        const decoded = atob(window.DEMO_AUDIO[name]);
        bytes = Uint8Array.from(decoded, char => char.charCodeAt(0)).buffer;
      } else {
        const response = await fetch(`assets/${name}`);
        if (!response.ok) throw new Error('素材读取失败，请通过 HTTP 服务打开页面。');
        bytes = await response.arrayBuffer();
      }
      return prepare(bytes, name, true);
    }));
    if (ticket !== generation) return;
    technique = next;
    sides.forEach((side, i) => { tracks[side] = results[i]; render(side); });
    document.querySelectorAll('[data-technique]').forEach(button => {
      button.classList.toggle('active', button.dataset.technique === next);
      button.setAttribute('aria-pressed', String(button.dataset.technique === next));
    });
    $('#technique-description').textContent = techniques[next][1];
    $('#comparable').checked = false; renderInsights(); status('合成演示已就绪 · 先点下方标记试听，再导入真实录音。');
  } catch (error) { if (ticket === generation) status(error.message, true); }
  finally { if (ticket === generation) setBusy(false); }
}
function canvasContext(id) {
  const canvas = $(`#${id}`);
  canvas.width = Math.max(100, Math.round(canvas.getBoundingClientRect().width));
  return [canvas.getContext('2d'), canvas.width, canvas.height];
}
function grid(ctx, w, h) {
  ctx.fillStyle = '#f8faf5'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#e5eadd'; ctx.lineWidth = 1;
  for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(i * w / 6, 0); ctx.lineTo(i * w / 6, h); ctx.stroke(); }
}
function render(side) {
  const track = tracks[side]; if (!track) return;
  $(`#${side}-name`).textContent = track.name;
  $(`#${side}-source`).textContent = track.synthetic ? '合成演示' : '本地录音';
  $(`#${side}-duration`).textContent = `${track.buffer.duration.toFixed(1)} s`;
  const a = track.analysis;
  let [ctx, w, h] = canvasContext(`${side}-wave`); grid(ctx, w, h);
  ctx.strokeStyle = colors[side]; ctx.globalAlpha = .75;
  const step = a.data.length / w;
  ctx.beginPath();
  for (let x = 0; x < w; x++) {
    let low = 0, high = 0;
    for (let i = Math.floor(x * step); i < Math.min(a.data.length, (x + 1) * step); i++) {
      low = Math.min(low, a.data[i]); high = Math.max(high, a.data[i]);
    }
    ctx.moveTo(x, h / 2 - high * h * .46); ctx.lineTo(x, h / 2 - low * h * .46);
  }
  ctx.stroke(); ctx.globalAlpha = 1;
  drawRegion(side);
  renderSpectrum(side);
  [ctx, w, h] = canvasContext(`${side}-envelope`); grid(ctx, w, h);
  // Full-scale amplitude: the same y axis across both recordings.
  ctx.strokeStyle = colors[side]; ctx.lineWidth = 1.5; ctx.beginPath();
  a.envelope.forEach((v, i) => { const x = i / Math.max(1, a.envelope.length - 1) * w, y = h - 5 - v * (h - 10); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
  ctx.stroke();
  const s = a.stats;
  $(`#${side}-stats`).innerHTML = `<div><small>RMS 电平</small><strong>${s.rmsDbFS === null ? '−∞' : s.rmsDbFS.toFixed(1)}</strong><span>dBFS</span></div><div><small>频谱重心</small><strong>${s.centroidHz === null ? '—' : Math.round(s.centroidHz)}</strong><span>Hz</span></div><div><small>估计起音</small><strong>${s.onsetCount}</strong><span>次</span></div>`;
  updatePlayer(side);
}
const palette = [[17, 31, 41], [28, 68, 74], [45, 105, 89], [154, 180, 115], [248, 217, 145]];
function renderSpectrum(side) {
  const track = tracks[side]; if (!track) return;
  const a = track.analysis;
  const [ctx, w, h] = canvasContext(`${side}-spec`), pixels = ctx.createImageData(w, h);
  const log = $('#scale').value === 'log', maxFreq = a.rate / 2;
  for (let y = 0; y < h; y++) {
    const fraction = 1 - y / (h - 1);
    const frequency = log ? 60 * (maxFreq / 60) ** fraction : maxFreq * fraction;
    const bin = Math.min(a.size / 2, Math.round(frequency * a.size / a.rate));
    for (let x = 0; x < w; x++) {
      const frame = a.spectra[Math.min(a.spectra.length - 1, Math.floor(x / w * a.spectra.length))];
      const db = a.maxPower > 0 ? 10 * Math.log10(Math.max(frame[bin], 1e-20) / a.maxPower) : -70;
      const intensity = Math.max(0, Math.min(1, (db + 70) / 70)) * 4;
      const index = Math.min(3, Math.floor(intensity)), mix = intensity - index, p = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) pixels.data[p + c] = palette[index][c] * (1 - mix) + palette[index + 1][c] * mix;
      pixels.data[p + 3] = 255;
    }
  }
  ctx.putImageData(pixels, 0, 0);
  $(`#${side}-freq`).innerHTML = log
    ? `<span>${(maxFreq / 1000).toFixed(1)} kHz</span><span>${Math.round(Math.sqrt(60 * maxFreq))} Hz</span><span>60 Hz</span>`
    : `<span>${(maxFreq / 1000).toFixed(1)} kHz</span><span>${(maxFreq / 2000).toFixed(1)} kHz</span><span>0 Hz</span>`;
}
function renderInsights() { renderRollReview(); }
function position(track) {
  return Math.min(track.buffer.duration, track.offset + (track.source ? context.currentTime - track.started : 0));
}
function time(seconds) { return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`; }
function updatePlayer(side) {
  const track = tracks[side]; if (!track) return;
  const pos = position(track), button = $(`[data-play="${side}"]`);
  button.textContent = track.source ? 'Ⅱ' : '▶';
  button.setAttribute('aria-label', `${track.source ? '暂停' : '播放'}${labels[side]}`);
  $(`#${side}-time`).textContent = `${time(pos)} / ${time(track.buffer.duration)}`;
  $(`#${side}-head`).style.left = `${pos / track.buffer.duration * 100}%`;
  const wave = $(`#${side}-wave`);
  wave.setAttribute('aria-valuemax', track.buffer.duration.toFixed(2));
  wave.setAttribute('aria-valuenow', pos.toFixed(2));
  wave.setAttribute('aria-valuetext', `${pos.toFixed(1)} 秒，共 ${track.buffer.duration.toFixed(1)} 秒`);
}
function stop(side) {
  const track = tracks[side]; if (!track?.source) return;
  track.offset = position(track); track.source.onended = null;
  track.source.stop(); track.source.disconnect(); track.source = null; updatePlayer(side);
}
function stopAll() {
  playGeneration++; sequence = false;
  sides.forEach(stop); sides.forEach(side => { if (tracks[side]) tracks[side].clipEnd = null; }); $('#listen').textContent = '▶ 顺序试听';
}
async function play(side, sequential = false) {
  const track = tracks[side]; if (!track || busy) return;
  const ticket = ++playGeneration;
  try {
    await audioContext().resume();
    if (ticket !== playGeneration || busy || track !== tracks[side]) return;
    if (track.offset >= track.buffer.duration - .01) track.offset = 0;
    const source = context.createBufferSource(); source.buffer = track.buffer; source.connect(context.destination);
    track.source = source; track.started = context.currentTime;
    source.onended = () => {
      if (track.source !== source) return;
      source.disconnect(); track.source = null; track.offset = track.clipEnd || track.buffer.duration; track.clipEnd = null; updatePlayer(side);
      if (sequential && sequence && side === 'reference') {
        tracks.practice.offset = tracks.practice.region[0]; tracks.practice.clipEnd = tracks.practice.region[1]; play('practice', true);
      } else if (sequential) { sequence = false; $('#listen').textContent = '▶ 顺序试听'; }
    };
    if (track.clipEnd) source.start(0, track.offset, Math.max(.01, track.clipEnd - track.offset));
    else source.start(0, track.offset); updatePlayer(side); animate();
  } catch { stopAll(); status('播放未成功，请检查浏览器音频权限后再次点击播放。', true); }
}
let animationPending = false;
function animate() {
  if (animationPending) return;
  animationPending = true;
  requestAnimationFrame(() => {
    animationPending = false; sides.forEach(updatePlayer);
    if (sides.some(side => tracks[side]?.source)) animate();
  });
}
function seek(side, seconds) {
  const track = tracks[side]; if (!track || busy) return;
  const wasPlaying = !!track.source;
  stopAll(); track.offset = Math.max(0, Math.min(track.buffer.duration, seconds));
  updatePlayer(side); if (wasPlaying) play(side);
}
document.querySelectorAll('[data-technique]').forEach(button => button.addEventListener('click', () => loadTechnique(button.dataset.technique)));
document.querySelectorAll('[data-play]').forEach(button => button.addEventListener('click', () => {
  const side = button.dataset.play, wasPlaying = !!tracks[side]?.source;
  stopAll(); if (!wasPlaying) play(side);
}));
$('#listen').addEventListener('click', () => {
  const wasSequence = sequence; stopAll();
  if (!wasSequence) { sides.forEach(side => { tracks[side].offset = tracks[side].region[0]; tracks[side].clipEnd = tracks[side].region[1]; updatePlayer(side); }); sequence = true; $('#listen').textContent = '■ 停止试听'; play('reference', true); }
});
$('#scale').addEventListener('change', () => sides.forEach(renderSpectrum));
sides.forEach(side => {
  const wave = $(`#${side}-wave`);
  wave.addEventListener('click', event => { if (tracks[side]) seek(side, (event.clientX - wave.getBoundingClientRect().left) / wave.clientWidth * tracks[side].buffer.duration); });
  wave.addEventListener('keydown', event => {
    if (!tracks[side] || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    seek(side, event.key === 'Home' ? 0 : event.key === 'End' ? tracks[side].buffer.duration : position(tracks[side]) + (event.key === 'ArrowRight' ? .5 : -.5));
  });
  $(`[data-upload="${side}"]`).addEventListener('change', async event => {
    const file = event.target.files[0]; event.target.value = ''; if (!file) return;
    if (file.size > 20 * 1024 * 1024) { status('文件超过 20 MB，请使用较短的录音。', true); return; }
    const ticket = ++generation; stopAll(); setBusy(true); status(`正在本地分析${labels[side]}音频…`);
    try {
      const track = await prepare(await file.arrayBuffer(), file.name, false);
      if (ticket !== generation) return;
      tracks[side] = track; $('#comparable').checked = false; render(side); renderInsights(); status('导入成功 · 音频仅在本地处理，未上传。');
    } catch (error) { if (ticket === generation) status(error.message, true); }
    finally { if (ticket === generation) setBusy(false); }
  });
});
$('#export').addEventListener('click', () => {
  const result = { version: 3, createdAt: new Date().toISOString(), technique,
    comparabilityConfirmed: $('#comparable').checked, comparisonEligible: (sides.every(side => tracks[side].synthetic) || (sides.every(side => !tracks[side].synthetic) && $('#comparable').checked)) && sides.every(side => reviewTrack(tracks[side]).usable), validationStatus: 'Synthetic checks only; real pipa/teacher validation pending',
    method: { fftSize: 1024, window: 'Hann', hopSeconds: .01, intervalFlagRelativeThreshold: .35, attackFlagDbThreshold: 4, minimumOnsets: 8, spectrumNormalization: 'per-track peak', onsetMethod: 'Adaptive RMS positive slope; 45ms minimum interval' },
    disclaimer: '合成素材仅供演示。数值描述音频，不构成技法评分。',
    tracks: Object.fromEntries(sides.map(side => [side, { name: tracks[side].name, synthetic: tracks[side].synthetic, selectedRegionSeconds: tracks[side].region, review: reviewTrack(tracks[side]), ...tracks[side].analysis.stats }])) };
  const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `string-lens-${technique}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  status('已导出分析摘要（不包含音频）。');
});
let resizeTimer;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => sides.forEach(render), 150); });
loadTechnique('roll');

// A deliberately narrow observation workflow: sustained same-note tremolo.
function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b), mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
function detectOnsets(envelope, hop, rate) {
  const novelty = envelope.map((v, i) => i ? Math.max(0, v - envelope[i - 1]) : 0);
  const floor = Math.max(1e-6, Math.max(...novelty) * .04);
  const candidates = [];
  for (let i = 1; i < novelty.length - 1; i++) {
    const local = novelty.slice(Math.max(0, i - 25), Math.min(novelty.length, i + 26));
    const threshold = Math.max(floor, median(local) * 3);
    if (novelty[i] > threshold && novelty[i] >= novelty[i - 1] && novelty[i] > novelty[i + 1]) {
      const t = i * hop / rate, previous = candidates[candidates.length - 1];
      if (previous && t - previous.time < .045) {
        if (novelty[i] > previous.strength) candidates[candidates.length - 1] = {time: t, strength: novelty[i]};
      } else candidates.push({time: t, strength: novelty[i]});
    }
  }
  return candidates.map(candidate => candidate.time);
}
function reviewTrack(track) {
  const a = track.analysis, [start, end] = track.region;
  const onsets = a.stats.onsetTimesSeconds.filter(t => t >= start && t < end);
  const intervals = onsets.slice(1).map((t, i) => t - onsets[i]);
  const typical = median(intervals);
  const peaks = onsets.map(t => {
    const first = Math.floor(t * a.rate / a.hop);
    return Math.max(...a.envelope.slice(first, first + 4), 1e-12);
  });
  const peakMedian = median(peaks);
  const relativeDb = peaks.map(value => 20 * Math.log10(value / Math.max(peakMedian, 1e-12)));
  let clipped = 0, count = 0;
  for (let i = Math.floor(start * a.rate); i < Math.min(a.data.length, end * a.rate); i++) {
    if (Math.abs(a.data[i]) >= .99) clipped++; count++;
  }
  let reason = '';
  if (onsets.length < 8) reason = '起音少于 8 个：请选更长的持续轮指片段，或检查检测是否漏掉拨弦。';
  else if (typical < .055) reason = '起音太密，接近检测分辨率：请降速录制，暂不输出均匀度线索。';
  else if (clipped / Math.max(1, count) > .001) reason = '选区存在削波：请降低录音增益后重录，暂不输出均匀度线索。';
  const events = [];
  if (!reason) {
    intervals.forEach((interval, i) => {
      const ratio = interval / typical;
      if (Math.abs(ratio - 1) > .35) events.push({time: onsets[i + 1], kind: 'interval', label: ratio > 1 ? '间隔偏长' : '间隔偏短', value: Math.round(interval * 1000), relative: ratio});
    });
    relativeDb.forEach((db, i) => {
      if (Math.abs(db) > 4) events.push({time: onsets[i], kind: 'attack', label: db > 0 ? '攻击音偏突出' : '攻击音偏弱', value: Number(db.toFixed(1))});
    });
  }
  events.sort((a, b) => a.time - b.time);
  return {start, end, onsets, intervals, medianIntervalSeconds: typical || null,
    intervalCV: intervals.length > 1 ? deviation(intervals) / mean(intervals) : null,
    relativeAttackDb: relativeDb, attackSpreadDb: relativeDb.length ? deviation(relativeDb) : null,
    usable: !reason, reason, events};
}
function drawRegion(side) {
  const track = tracks[side]; if (!track) return;
  const canvas = $(`#${side}-wave`), ctx = canvas.getContext('2d'), duration = track.buffer.duration;
  const [start, end] = track.region;
  ctx.fillStyle = '#203a3520';
  ctx.fillRect(0, 0, start / duration * canvas.width, canvas.height);
  ctx.fillRect(end / duration * canvas.width, 0, canvas.width, canvas.height);
  ctx.strokeStyle = colors[side]; ctx.globalAlpha = .35;
  for (const t of track.analysis.stats.onsetTimesSeconds) {
    if (t < start || t >= end) continue;
    const x = t / duration * canvas.width;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 15); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (const suffix of ['start', 'end']) $(`#${side}-${suffix}`).max = duration.toFixed(2);
  $(`#${side}-start`).value = start.toFixed(2); $(`#${side}-end`).value = end.toFixed(2);
}
function renderRollReview() {
  if (!tracks.reference || !tracks.practice) return;
  const reviews = Object.fromEntries(sides.map(side => [side, reviewTrack(tracks[side])]));
  const bothDemo = sides.every(side => tracks[side].synthetic);
  const mixed = tracks.reference.synthetic !== tracks.practice.synthetic;
  const allowed = bothDemo || (!mixed && $('#comparable').checked);
  $('#data-mode').textContent = bothDemo ? '合成演示' : mixed ? '素材来源不同' : '用户录音 · 效果待验证';
  $('#technique-description').textContent = bothDemo ? '人为设置的均匀 / 不均匀拨弦，用于理解图与标记，不代表真实琵琶效果。' : '录音只在本地分析；请核对起音标记并试听。用户录音不等于已完成专业验证。';
  const a = reviews.reference, b = reviews.practice;
  const speedRatio = a.medianIntervalSeconds && b.medianIntervalSeconds ? b.medianIntervalSeconds / a.medianIntervalSeconds : null;
  $('#review-summary').textContent = mixed ? '一侧为合成素材、一侧为用户录音：停止跨侧比较。仍可分别观察和试听。' : !allowed ? '尚未确认可比性：停止跨侧比较。请先选择同音、同条件的对应练习片段。' : !a.usable || !b.usable ? '部分选区不满足分析条件。查看各侧提示，调整片段或重录。' : speedRatio && Math.abs(speedRatio - 1) > .2 ? '两侧整体速度差超过 20%。图按各自中位间隔归一化，仅比较相对起伏；不把速度差判为错误。' : '已按各侧首个检测起音对齐显示，间隔按各自中位数归一化。标记都需要试听确认。';
  const cvText = r => r.usable && r.intervalCV !== null ? `${(r.intervalCV * 100).toFixed(1)}%` : '暂不输出';
  const attackText = r => r.usable ? `${r.attackSpreadDb.toFixed(1)} dB` : '暂不输出';
  $('#insights').innerHTML = [
    ['间隔起伏', '间隔变异系数反映选区内拨弦的疏密变化，先点击下方偏长 / 偏短位置试听。', `参考 ${cvText(a)} · 练习 ${cvText(b)}`],
    ['攻击音起伏', '相对各自中位攻击音计算，抵消固定录音增益；不能排除自动增益或录音距离变化。', `参考 ${attackText(a)} · 练习 ${attackText(b)}`],
    ['这次先听哪里', '从一个疑似位置开始，不直接认定演奏错误。减速练同音轮指，再录一遍复查。', `练习侧 ${b.usable ? b.events.length + ' 个待复听标记' : '需要调整录音 / 选区'}`],
  ].map((note, i) => `<article class="insight"><span class="insight-number">CHECK 0${i+1}</span><h3>${note[0]}</h3><p>${note[1]}</p><span class="comparison">${allowed ? note[2] : i === 2 ? note[2] : '可比性未满足，请分别查看下方单侧结果'}</span></article>`).join('');
  $('#timeline').innerHTML = sides.map(side => {
    const r = reviews[side];
    return `<section class="onset-panel"><h3>${labels[side]} · 起音间隔轨迹</h3><p>${r.reason || '每根柱对应相邻两次拨弦的间隔；100% 为本侧中位间隔。点击柱可试听该位置。'}</p><div class="interval-bars" id="${side}-intervals"></div><small>0 秒对应本侧选区首个起音；各侧独立归一化，不做逐指配对。${r.medianIntervalSeconds ? ' 中位间隔 ' + Math.round(r.medianIntervalSeconds*1000) + ' ms。' : ''}</small></section>`;
  }).join('');
  sides.forEach(side => {
    const r = reviews[side]; if (!r.usable) return;
    r.intervals.forEach((interval, i) => {
      const ratio = interval / r.medianIntervalSeconds, button = document.createElement('button');
      button.className = 'interval-bar' + (Math.abs(ratio - 1) > .35 ? ' flagged' : '');
      button.style.height = `${Math.max(5, Math.min(100, ratio * 45))}%`;
      const t = r.onsets[i+1];
      button.title = `${(t-r.onsets[0]).toFixed(2)} s · ${Math.round(interval*1000)} ms · ${(ratio*100).toFixed(0)}%`;
      button.setAttribute('aria-label', `${labels[side]}原录音 ${t.toFixed(2)} 秒，间隔 ${Math.round(interval*1000)} 毫秒，点击试听`);
      button.addEventListener('click', () => audition(side, Math.max(r.start, t-.3), Math.min(r.end, t+.5)));
      $(`#${side}-intervals`).append(button);
    });
  });
  $('#events').innerHTML = '';
  sides.forEach(side => {
    const r = reviews[side], section = document.createElement('section'); section.className = 'event-panel';
    const heading = document.createElement('h3'); heading.textContent = `${labels[side]} · 待复听位置`; section.append(heading);
    const caption = document.createElement('p');
    caption.textContent = !r.usable ? r.reason : r.events.length ? '原录音时间 · 阈值触发不等于演奏错误，点击播放前后约 0.8 秒。' : '当前规则没有触发标记；这不证明技法正确，请核对波形起音与试听。'; section.append(caption);
    const metrics = document.createElement('p'); metrics.textContent = `${r.onsets.length} 个起音 · 间隔 CV ${cvText(r)} · 攻击音起伏 ${attackText(r)}`; section.append(metrics);
    const expanded = document.createElement('details');
    const more = document.createElement('summary'); more.textContent = `展开其余 ${Math.min(40, r.events.length)-6} 个位置`; expanded.append(more);
    r.events.slice(0, 40).forEach((event, index) => {
      const button = document.createElement('button'); button.className = 'event-button';
      button.textContent = `▶ ${event.time.toFixed(2)} s · ${event.label} · ${event.value}${event.kind === 'interval' ? ' ms' : ' dB（相对中位数）'}`;
      button.addEventListener('click', () => audition(side, Math.max(r.start, event.time-.3), Math.min(r.end, event.time+.5))); (index < 6 ? section : expanded).append(button);
    });
    if (r.events.length > 6) section.append(expanded);
    if (r.events.length > 40) { const note = document.createElement('p'); note.textContent = '仅展示前 40 个标记，完整结果可导出。'; section.append(note); }
    $('#events').append(section);
  });
}
function audition(side, start, end) {
  if (busy) return;
  stopAll(); tracks[side].offset = start; tracks[side].clipEnd = end; play(side);
  status(`正在试听${labels[side]} ${start.toFixed(2)}–${end.toFixed(2)} 秒 · 请用听觉确认变化。`);
}
sides.forEach(side => {
  $(`[data-region="${side}"]`).addEventListener('click', () => {
    if (busy || !tracks[side]) return;
    const start = Number($(`#${side}-start`).value), end = Number($(`#${side}-end`).value);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > tracks[side].buffer.duration + .001 || end-start < .3) {
      status('选区无效：起点须大于等于 0，终点不能超过音频时长，且至少 0.3 秒。', true); return;
    }
    stopAll(); tracks[side].region = [start,end]; render(side); renderRollReview(); status('选区已更新，标记和统计只使用选区内起音。');
  });
  $(`[data-clip="${side}"]`).addEventListener('click', () => { if (tracks[side]) audition(side, ...tracks[side].region); });
  $(`.audio-card.${side} .technical`).addEventListener('toggle', () => { if ($(`.audio-card.${side} .technical`).open) render(side); });
});
$('#comparable').addEventListener('change', renderRollReview);
