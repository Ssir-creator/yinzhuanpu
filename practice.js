'use strict';
let recorder = null, micStream = null, recordingTimer = null, recordingPending = false;
let recordToken = 0, historyBusy = false;
const historyMessage = (message) => { $('#history-status').textContent = message; };
function recordingUI(active) {
  recordingPending = active;
  setBusy(active);
  $('#record').disabled = active;
  $('#record-stop').disabled = !recorder || recorder.state !== 'recording';
  $('#record-side').disabled = active; $('#record-duration').disabled = active;
}
function releaseMic() {
  clearInterval(recordingTimer); recordingTimer = null;
  micStream?.getTracks().forEach(track => track.stop()); micStream = null;
}
function stopRecording() {
  if (recorder?.state === 'recording') { $('#record-stop').disabled = true; recorder.stop(); }
}
function waveBytes(buffer, limit = 30) {
  const length = Math.min(buffer.length, Math.floor(buffer.sampleRate * limit));
  const channels = buffer.numberOfChannels, byteLength = length * channels * 2;
  const bytes = new ArrayBuffer(44 + byteLength), view = new DataView(bytes);
  const text = (offset, value) => [...value].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, 36 + byteLength, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true); view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, byteLength, true);
  const data = Array.from({length: channels}, (_, c) => buffer.getChannelData(c));
  for (let i = 0; i < length; i++) for (let c = 0; c < channels; c++) {
    const sample = Math.max(-1, Math.min(1, data[c][i]));
    view.setInt16(44 + (i * channels + c) * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
  }
  return bytes;
}
$('#record').addEventListener('click', async () => {
  if (busy || recordingPending) return;
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    $('#record-status').textContent = '当前浏览器不支持网页录音，请使用 HTTPS 网站及新版 Chrome / Edge / Safari，或通过导入音频继续。'; return;
  }
  stopAll(); const token = ++recordToken, side = $('#record-side').value;
  const limit = Number($('#record-duration').value), chunks = [];
  recordingUI(true); $('#record-status').textContent = '等待麦克风授权…';
  try {
    const acquiredStream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false,channelCount:1}});
    if (token !== recordToken) { acquiredStream.getTracks().forEach(track => track.stop()); return; }
    micStream = acquiredStream;
    const type = ['audio/webm;codecs=opus','audio/mp4','audio/webm'].find(t => MediaRecorder.isTypeSupported(t));
    const current = new MediaRecorder(micStream, type ? {mimeType:type} : {}); recorder = current;
    let failed = false;
    current.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    current.onerror = () => { failed = true; $('#record-status').textContent = '录音设备发生错误，本次未替换原音频。'; releaseMic(); recorder = null; recordingUI(false); };
    current.onstop = async () => {
      if (failed) return;
      releaseMic(); recorder = null;
      if (token !== recordToken) { recordingUI(false); return; }
      $('#record-stop').disabled = true; $('#record-status').textContent = '正在本地处理录音…';
      try {
        const raw = await new Blob(chunks, {type:current.mimeType}).arrayBuffer();
        const decoded = await audioContext().decodeAudioData(raw);
        const track = await prepare(waveBytes(decoded), `轮指录音-${new Date().toISOString().replace(/[:.]/g,'-')}.wav`, false);
        tracks[side] = track; $('#comparable').checked = false;
        render(side); renderRollReview(); window.showScreen?.('compare'); $('#record-status').textContent = `已录入${labels[side]}，${track.buffer.duration.toFixed(1)} 秒。请检查选区及起音，再试听。`;
      } catch { $('#record-status').textContent = '录音太短或无法解码，本次未替换原音频。请重新录制或导入 WAV。'; }
      finally { recordingUI(false); }
    };
    current.start(250); recordingUI(true); const started = performance.now();
    $('#record-status').textContent = `● 正在录音 0.0 / ${limit} 秒，请开始同音轮指。`;
    recordingTimer = setInterval(() => {
      const elapsed = (performance.now()-started)/1000;
      $('#record-status').textContent = `● 正在录音 ${Math.min(elapsed,limit).toFixed(1)} / ${limit} 秒`;
      if (elapsed >= limit) { clearInterval(recordingTimer); stopRecording(); }
    }, 100);
  } catch (error) {
    releaseMic(); recorder = null; recordingUI(false);
    $('#record-status').textContent = error.name === 'NotAllowedError' ? '麦克风未获授权。可在浏览器地址栏调整权限，或直接导入录音。' : '无法打开麦克风。请检查设备是否连接、是否被其他程序占用，或直接导入录音。';
  }
});
$('#record-stop').addEventListener('click', stopRecording);
$('#promote').addEventListener('click', () => {
  if (busy || !tracks.practice) return;
  stopAll();
  const previous = tracks.practice;
  tracks.reference = {...previous, source:null,offset:0,started:0,clipEnd:null,region:[...previous.region]};
  $('#comparable').checked = false; render('reference'); renderRollReview();
  status('练习侧已复制到参考侧。下一次录入练习侧后，选择对应片段并重新确认可比条件。');
});
function openHistory() {
  return new Promise((resolve,reject) => {
    if (!window.indexedDB) { reject(new Error('此浏览器不支持本地记录，请下载音频备份。')); return; }
    const request = indexedDB.open('string-lens-practice',1);
    request.onupgradeneeded = () => request.result.createObjectStore('sessions',{keyPath:'id'});
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('本地存储不可用，可能处于受限或隐私模式。'));
  });
}
async function historyOperation(mode, action) {
  const db = await openHistory();
  return new Promise((resolve,reject) => {
    const tx = db.transaction('sessions',mode), store = tx.objectStore('sessions');
    let request;
    try { request = action(store); } catch (error) { db.close(); reject(error); return; }
    tx.oncomplete = () => { const value = request?.result; db.close(); resolve(value); };
    tx.onerror = tx.onabort = () => { db.close(); reject(new Error('保存失败：请检查浏览器存储空间或权限。')); };
  });
}
function downloadRecording(bytes, name) {
  const url = URL.createObjectURL(new Blob([bytes],{type:'audio/wav'}));
  const link = document.createElement('a'); link.href=url;link.download=name.replace(/\.[^.]+$/, '') + '.wav';link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function refreshHistory() {
  try {
    const sessions = await historyOperation('readonly',store=>store.getAll());
    sessions.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)); $('#history-list').replaceChildren();
    if (!sessions.length) { const empty = document.createElement('p');empty.className='storage-note';empty.textContent='还没有练习记录。导入或录制真实音频后，可主动保存练习侧。';$('#history-list').append(empty); }
    for (const entry of sessions) {
      const card=document.createElement('article');card.className='history-entry';
      const title=document.createElement('h3');title.textContent=new Date(entry.createdAt).toLocaleString();card.append(title);
      const info=document.createElement('p'); info.textContent=`选区 ${entry.region[0].toFixed(1)}–${entry.region[1].toFixed(1)} 秒 · ${entry.review.onsets.length} 个估计起音 · ${entry.review.usable ? '间隔 CV '+(entry.review.intervalCV*100).toFixed(1)+'%' : '分析条件不足'} · 数值不代表演奏评分`;card.append(info);
      if(entry.note){const note=document.createElement('p');note.textContent=entry.note;card.append(note);}
      const actions=document.createElement('div');actions.className='history-actions';
      for(const [label,callback] of [
        ['载入上一遍',()=>restoreEntry(entry,'reference')], ['载入练习侧',()=>restoreEntry(entry,'practice')],
        ['下载 WAV',()=>downloadRecording(entry.audio,entry.name)],
        ['删除记录',async()=>{try{await historyOperation('readwrite',store=>store.delete(entry.id));await refreshHistory();historyMessage('已删除此条本地记录。');}catch(error){historyMessage(error.message);}}]
      ]) {const button=document.createElement('button');button.className='quiet';button.textContent=label;button.addEventListener('click',()=>{if(!busy&&!historyBusy)callback();});actions.append(button);}
      card.append(actions);$('#history-list').append(card);
    }
  } catch(error) { historyMessage(error.message); }
}
async function restoreEntry(entry,side) {
  if (busy) return; stopAll();setBusy(true);
  try {
    const track=await prepare(entry.audio.slice(0),entry.name,false);track.region=[...entry.region];tracks[side]=track;
    $('#comparable').checked=false;render(side);renderRollReview();$('#practice-note').value=entry.note;
    historyMessage(`已载入${labels[side]}，请核对选区和录音条件。`);
  } catch(error){historyMessage(error.message);} finally{setBusy(false);}
}
$('#save-practice').addEventListener('click',async()=>{
  if(busy||historyBusy||!tracks.practice)return;
  if(tracks.practice.synthetic){historyMessage('合成演示不作为练习记录。请先录制或导入自己的音频。');return;}
  historyBusy=true;$('#save-practice').disabled=true;
  try {
    const track=tracks.practice;
    const entries=await historyOperation('readonly',store=>store.getAll());
    if(entries.length>=10)throw new Error('已有 10 条记录，请下载备份并删除不需要的记录后再保存。');
    const entry={id:crypto.randomUUID(),createdAt:new Date().toISOString(),name:track.name,audio:waveBytes(track.buffer),region:[...track.region],note:$('#practice-note').value.trim().slice(0,300),review:reviewTrack(track)};
    await historyOperation('readwrite',store=>store.add(entry));await refreshHistory();historyMessage('已保存在本浏览器。可下载 WAV 备份，或载入上一遍用于对比。');
  }catch(error){historyMessage(error.message);}finally{historyBusy=false;$('#save-practice').disabled=busy;}
});
window.addEventListener('pagehide',()=>{
  recordToken++;
  if (recorder?.state === 'recording') { recorder.onstop = null; recorder.stop(); }
  releaseMic(); recorder = null; recordingUI(false);
});
refreshHistory();
