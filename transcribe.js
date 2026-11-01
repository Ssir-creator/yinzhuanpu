'use strict';
const $=s=>document.querySelector(s);let ac,buffer,audioUrl,notes=[],selected=-1,recorder,stream,playNodes=[],undoStack=[],redoStack=[];
const context=()=>ac||(ac=new (window.AudioContext||window.webkitAudioContext)());
const status=(t,e=false)=>{$('#source-status').textContent=t;$('#source-status').style.color=e?'#a43d24':''};
function toWav(b){let n=b.length,c=b.numberOfChannels,a=new ArrayBuffer(44+n*c*2),v=new DataView(a),w=(o,s)=>[...s].forEach((x,i)=>v.setUint8(o+i,x.charCodeAt(0)));w(0,'RIFF');v.setUint32(4,36+n*c*2,true);w(8,'WAVE');w(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,c,true);v.setUint32(24,b.sampleRate,true);v.setUint32(28,b.sampleRate*c*2,true);v.setUint16(32,c*2,true);v.setUint16(34,16,true);w(36,'data');v.setUint32(40,n*c*2,true);for(let i=0;i<n;i++)for(let j=0;j<c;j++){let x=Math.max(-1,Math.min(1,b.getChannelData(j)[i]));v.setInt16(44+(i*c+j)*2,x<0?x*32768:x*32767,true)}return a}
async function loadAudio(bytes,name){try{let b=await context().decodeAudioData(bytes.slice(0));if(b.duration<.1||b.duration>60)throw Error('时长须为 0.1～60 秒');buffer=b;if(audioUrl)URL.revokeObjectURL(audioUrl);audioUrl=URL.createObjectURL(new Blob([toWav(b)],{type:'audio/wav'}));$('#source-audio').src=audioUrl;$('#audio-name').textContent=name;$('#audio-meta').textContent=`${b.duration.toFixed(1)} 秒 · ${b.sampleRate} Hz`;$('#audio-panel').hidden=false;$('#transcribe').disabled=false;$('#save-score').disabled=true;$('#score-title').value=name.replace(/\.[^.]+$/,'').slice(0,60);notes=[];selected=-1;$('#score-section').hidden=true;$('#note-editor').hidden=true;resetEditHistory();status('音频已准备好，可以生成简谱。')}catch(e){status(`无法读取音频：${e.message}`,true)}}
$('#audio-file').onchange=async e=>{let f=e.target.files[0];e.target.value='';if(!f)return;if(f.size>40*1024*1024)return status('文件超过 40 MB，请先裁剪。',true);loadAudio(await f.arrayBuffer(),f.name)};
$('#load-demo').onclick=()=>{let x=atob(window.DEMO_AUDIO),u=Uint8Array.from(x,c=>c.charCodeAt(0));$('#tempo').value=100;loadAudio(u.buffer,'小星星·合成示例.wav')};
$('#record').onclick=async()=>{if(!navigator.mediaDevices?.getUserMedia||!MediaRecorder)return status('当前浏览器不支持录音，请上传音频。',true);try{stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});let chunks=[];recorder=new MediaRecorder(stream);recorder.ondataavailable=e=>e.data.size&&chunks.push(e.data);recorder.onstop=async()=>{stream.getTracks().forEach(t=>t.stop());stream=null;$('#record').disabled=false;$('#stop-record').disabled=true;loadAudio(await new Blob(chunks).arrayBuffer(),`录音-${new Date().toLocaleTimeString()}.wav`)};recorder.start(200);$('#record').disabled=true;$('#stop-record').disabled=false;status('正在录音…')}catch(e){status(e.name==='NotAllowedError'?'没有麦克风权限，可改用上传。':'无法开启麦克风。',true)}};
$('#stop-record').onclick=()=>recorder?.state==='recording'&&recorder.stop();
function mono(){let d=new Float32Array(buffer.length);for(let c=0;c<buffer.numberOfChannels;c++){let x=buffer.getChannelData(c);for(let i=0;i<d.length;i++)d[i]+=x[i]/buffer.numberOfChannels}return d}
function detectPitch(f,sr){let rms=Math.sqrt(f.reduce((s,x)=>s+x*x,0)/f.length);if(rms<.012)return null;let best=0,lag=0;for(let l=Math.floor(sr/1200);l<=Math.min(sr/70,f.length/2);l++){let sum=0,a=0,b=0;for(let i=0;i<f.length-l;i++){sum+=f[i]*f[i+l];a+=f[i]*f[i];b+=f[i+l]*f[i+l]}let q=sum/Math.sqrt(a*b||1);if(q>best){best=q;lag=l}}return best<.62?null:{midi:69+12*Math.log2(sr/lag),confidence:best}}
function analyze(){let d=mono(),sr=buffer.sampleRate,size=2048,hop=256,segments=[],cur=null;for(let i=0;i+size<d.length;i+=hop){let p=detectPitch(d.subarray(i,i+size),sr),t=i/sr;if(!p){if(cur&&t-cur.last>.09){segments.push(cur);cur=null}continue}if(!cur){cur={start:t,last:t,p:[p.midi],c:[p.confidence]};continue}let z=[...cur.p].sort((a,b)=>a-b),med=z[Math.floor(z.length/2)];if(Math.abs(p.midi-med)>1.25&&t-cur.start>.08){segments.push(cur);cur={start:t,last:t,p:[p.midi],c:[p.confidence]}}else{cur.last=t;cur.p.push(p.midi);cur.c.push(p.confidence)}}if(cur)segments.push(cur);let beat=60/(Number($('#tempo').value)||90),grid=Number($('#grid').value);return segments.flatMap(s=>{let dur=s.last+hop/sr-s.start;if(dur<.06)return[];let p=[...s.p].sort((a,b)=>a-b);return[{midi:Math.round(p[Math.floor(p.length/2)]),beats:Math.max(grid,Math.round(dur/beat/grid)*grid),confidence:s.c.reduce((a,b)=>a+b,0)/s.c.length,start:s.start}]})}
$('#transcribe').onclick=()=>{if(!buffer)return;$('#analysis-progress').hidden=false;$('#transcribe').disabled=true;setTimeout(()=>{notes=analyze();$('#analysis-progress').hidden=true;$('#transcribe').disabled=false;if(!notes.length)return status('没有找到稳定音高，请换用更清晰的单旋律。',true);selected=-1;$('#note-editor').hidden=true;resetEditHistory();render();$('#score-section').hidden=false;$('#save-score').disabled=false;status(`识别到 ${notes.length} 个音符，请边听原音频边校对。`);$('#score-section').scrollIntoView({behavior:'smooth'})},30)};
const scale=[0,2,4,5,7,9,11];function sign(n){if(n.rest)return{num:'0',acc:'',oct:0};let root=Number($('#key-select').value),rel=n.midi-(60+root),oct=Math.floor(rel/12),pc=(rel%12+12)%12,best=0,delta=99;scale.forEach((v,i)=>{let x=pc-v;if(Math.abs(x)<Math.abs(delta)){delta=x;best=i}});return{num:String(best+1),acc:delta===1?'♯':delta===-1?'♭':'',oct}}
function notationMeasures(){let meter=Number($('#meter').value),measures=[[]],used=0;for(let index=0;index<notes.length;index++){let note=notes[index],remaining=note.beats,continued=false;while(remaining>.0001){let space=meter-used,beats=Math.min(remaining,space);measures.at(-1).push({note,index,beats,continued,continues:remaining-beats>.0001});used+=beats;remaining-=beats;continued=true;if(Math.abs(used-meter)<.0001){used=0;if(index<notes.length-1||remaining>.0001)measures.push([])}}}return measures.filter(measure=>measure.length)}
function render(){let meter=Number($('#meter').value),grid=Number($('#grid').value);$('#score-key').textContent=`1=${$('#key-select').selectedOptions[0].textContent}`;$('#score-tempo').textContent=`♩=${$('#tempo').value}`;$('#score-meter').textContent=`${meter}/4`;let score=$('#score');score.replaceChildren();score.className='score jianpu-score';notationMeasures().forEach((parts,measureIndex)=>{let measure=document.createElement('div'),usedSlots=0,slots=Math.round(meter/grid);measure.className='jianpu-measure';measure.style.setProperty('--slots',slots);measure.dataset.measure=measureIndex+1;parts.forEach(part=>{let slotCount=Math.max(1,Math.round(part.beats/grid)),wrap=document.createElement('span'),n=part.note,x=sign(n),b=document.createElement('button'),beam=part.beats<=.25?' beam-two':part.beats<1?' beam-one':'',isDotted=[.375,.75,1.5,3].some(value=>Math.abs(value-part.beats)<.001);wrap.className='jianpu-cell'+beam+(part.continued?' continuation':'')+(part.continues?' continues':'');wrap.style.gridColumn=`span ${slotCount}`;usedSlots+=slotCount;b.className='score-note'+(n.confidence<.75?' low-confidence':'')+(part.index===selected?' selected':'');b.type='button';b.title=`第 ${part.index+1} 个音，${part.beats} 拍`;b.setAttribute('aria-label',b.title);let wholeBeats=isDotted&&part.beats>=2?Math.floor(part.beats/1.5):Math.floor(part.beats),hold=wholeBeats>=2?`<span class="hold">${'—'.repeat(wholeBeats-1)}</span>`:'',dot=isDotted?'<span class="augmentation-dot">·</span>':'';b.innerHTML=part.continued?'<span class="continued-dash">—</span>':`<span class="accidental">${x.acc}</span><span class="numeral">${x.num}</span>${hold}${dot}${x.oct?`<span class="octave ${x.oct>0?'high':'low'}">${'·'.repeat(Math.min(2,Math.abs(x.oct)))}</span>`:''}`;b.onclick=()=>{selected=part.index;$('#note-editor').hidden=false;$('#editor-position').textContent=`第 ${part.index+1} 个音`;render()};wrap.append(b);measure.append(wrap)});if(usedSlots<slots){let spacer=document.createElement('span');spacer.className='measure-space';spacer.style.gridColumn=`span ${slots-usedSlots}`;measure.append(spacer)}score.append(measure)});let q=notes.reduce((s,n)=>s+n.confidence,0)/notes.length;$('#confidence-label').textContent=q>.82?'整体较清晰':q>.7?'需要校对':'识别把握较低'}
const cloneNotes=()=>JSON.parse(JSON.stringify(notes));
function syncEditHistory(message=''){ $('#undo-edit').disabled=!undoStack.length;$('#redo-edit').disabled=!redoStack.length;$('#edit-status').textContent=message }
function resetEditHistory(){undoStack=[];redoStack=[];syncEditHistory()}
function rememberEdit(){undoStack.push(cloneNotes());if(undoStack.length>50)undoStack.shift();redoStack=[]}
function restoreNotes(snapshot,message){notes=snapshot;if(selected>=notes.length)selected=-1;$('#note-editor').hidden=selected<0;render();syncEditHistory(message)}
$('#undo-edit').onclick=()=>{if(!undoStack.length)return;redoStack.push(cloneNotes());restoreNotes(undoStack.pop(),'已撤销上一步')};
$('#redo-edit').onclick=()=>{if(!redoStack.length)return;undoStack.push(cloneNotes());restoreNotes(redoStack.pop(),'已恢复上一步')};
document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{if(selected<0)return;rememberEdit();let n=notes[selected],g=Number($('#grid').value),a=b.dataset.edit;if(a==='up')n.midi++;if(a==='down')n.midi--;if(a==='longer')n.beats+=g;if(a==='shorter')n.beats=Math.max(g,n.beats-g);if(a==='rest')n.rest=!n.rest;if(a==='delete'){notes.splice(selected,1);selected=-1;$('#note-editor').hidden=true}render();syncEditHistory('已修改，记得保存')});['key-select','tempo','meter'].forEach(id=>$(`#${id}`).onchange=()=>notes.length&&render());
function stopPlayback(){playNodes.forEach(n=>{try{n.stop()}catch{}});playNodes=[];let source=$('#source-audio');if(!source.paused)source.pause();$('#stop-score').disabled=true}$('#stop-score').onclick=stopPlayback;$('#play-source').onclick=async()=>{stopPlayback();let source=$('#source-audio');source.currentTime=0;await source.play();$('#stop-score').disabled=false;source.onended=()=>$('#stop-score').disabled=true};$('#play-score').onclick=async()=>{stopPlayback();await context().resume();let t=ac.currentTime+.08,beat=60/(Number($('#tempo').value)||90);for(let n of notes){let d=n.beats*beat;if(!n.rest){let o=ac.createOscillator(),g=ac.createGain();o.type='triangle';o.frequency.value=440*2**((n.midi-69)/12);g.gain.setValueAtTime(.001,t);g.gain.exponentialRampToValueAtTime(.18,t+.015);g.gain.exponentialRampToValueAtTime(.001,t+Math.max(.04,d*.85));o.connect(g).connect(ac.destination);o.start(t);o.stop(t+d);playNodes.push(o)}t+=d}$('#stop-score').disabled=false;setTimeout(stopPlayback,(t-ac.currentTime)*1000+50)};
const scoreTitle=()=>$('#score-title').value.trim()||$('#audio-name').textContent.replace(/\.[^.]+$/,'')||'未命名曲谱';
const safeFileName=()=>scoreTitle().replace(/[\\/:*?"<>|]/g,'-').slice(0,60);
function scoreText(){let meter=Number($('#meter').value),total=0,p=[];for(let n of notes){if(p.length&&Math.abs(total/meter-Math.round(total/meter))<.001)p.push('|');let x=sign(n),s=x.acc+x.num+(x.oct>0?'̇'.repeat(x.oct):x.oct<0?'̣'.repeat(-x.oct):'');if(n.beats>1)s+=' '+'— '.repeat(Math.round(n.beats)-1);if(n.beats<1)s+='_'.repeat(n.beats<=.25?2:1);p.push(s);total+=n.beats}return`${scoreTitle()}\n1=${$('#key-select').selectedOptions[0].textContent}  ${$('#meter').value}/4  ♩=${$('#tempo').value}\n${p.join(' ')}`}
function download(name,data,type){let u=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),500)}$('#export-text').onclick=()=>download(`${safeFileName()}.txt`,scoreText(),'text/plain;charset=utf-8');
const xmlEscape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]));
function musicXml(){
  const names=['C','C','D','D','E','F','F','G','G','A','A','B'],alter=[0,1,0,1,0,0,1,0,1,0,1,0],meter=Number($('#meter').value),fifths={0:0,7:1,2:2,9:3,4:4,11:5,5:-1,10:-2,3:-3}[Number($('#key-select').value)]||0;
  let measures=[],current=[],used=0;
  const noteXml=(note,beats,tieStart,tieStop)=>{let pc=(note.midi%12+12)%12,ties=!note.rest?`${tieStop?'<tie type="stop"/>':''}${tieStart?'<tie type="start"/>':''}`:'',notations=!note.rest&&(tieStart||tieStop)?`<notations>${tieStop?'<tied type="stop"/>':''}${tieStart?'<tied type="start"/>':''}</notations>`:'';return`<note>${note.rest?'<rest/>':`<pitch><step>${names[pc]}</step>${alter[pc]?'<alter>1</alter>':''}<octave>${Math.floor(note.midi/12)-1}</octave></pitch>`}<duration>${Math.max(1,Math.round(beats*4))}</duration>${ties}${notations}</note>`};
  for(const note of notes){let remaining=note.beats,continued=false;while(remaining>.0001){let space=meter-used,part=Math.min(remaining,space),continues=remaining-part>.0001;current.push(noteXml(note,part,continues,continued));used+=part;remaining-=part;continued=true;if(Math.abs(used-meter)<.0001){measures.push(current);current=[];used=0}}}
  if(current.length)measures.push(current);
  let body=measures.map((content,index)=>`<measure number="${index+1}">${index===0?`<attributes><divisions>4</divisions><key><fifths>${fifths}</fifths></key><time><beats>${meter}</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><direction><sound tempo="${Number($('#tempo').value)||90}"/></direction>`:''}${content.join('')}</measure>`).join('');
  return`<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><work><work-title>${xmlEscape(scoreTitle())}</work-title></work><part-list><score-part id="P1"><part-name>旋律</part-name></score-part></part-list><part id="P1">${body}</part></score-partwise>`
}
$('#export-xml').onclick=()=>download(`${safeFileName()}.musicxml`,musicXml(),'application/vnd.recordare.musicxml+xml');
$('#print-score').onclick=()=>{document.body.classList.add('printing-score');setTimeout(()=>window.print(),50)};
addEventListener('afterprint',()=>document.body.classList.remove('printing-score'));
const STORE='audio-to-score-library';const saved=()=>{try{return JSON.parse(localStorage.getItem(STORE)||'[]')}catch{return[]}};function library(){let list=$('#library-list'),items=saved();list.replaceChildren();if(!items.length){list.textContent='还没有保存的曲谱。';return}items.forEach(item=>{let e=document.createElement('article');e.className='library-entry';let h=document.createElement('h3');h.textContent=item.name;e.append(h);let p=document.createElement('p');p.textContent=`${new Date(item.date).toLocaleString()} · ${item.notes.length} 个音符`;e.append(p);[['打开',()=>{notes=JSON.parse(JSON.stringify(item.notes));$('#score-title').value=item.name;$('#key-select').value=item.key;$('#tempo').value=item.tempo;$('#meter').value=item.meter;selected=-1;$('#note-editor').hidden=true;resetEditHistory();render();$('#score-section').hidden=false;showScreen('transcribe')}],['删除',()=>{localStorage.setItem(STORE,JSON.stringify(saved().filter(x=>x.id!==item.id)));library()}]].forEach(([t,f])=>{let b=document.createElement('button');b.textContent=t;b.onclick=f;e.append(b)});list.append(e)})}
function saveCurrentScore(){if(!notes.length)return;let a=saved(),id=crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`;a.unshift({id,name:scoreTitle(),date:new Date().toISOString(),key:$('#key-select').value,tempo:$('#tempo').value,meter:$('#meter').value,notes:cloneNotes()});localStorage.setItem(STORE,JSON.stringify(a.slice(0,20)));$('#library-status').textContent='已保存到当前浏览器。';syncEditHistory('已保存');library()}
$('#save-score').onclick=saveCurrentScore;$('#save-score-direct').onclick=saveCurrentScore;library();
// The interactive path uses a smaller frame than the reference implementation above.
// It keeps analysis responsive on phones while retaining enough cycles for 70 Hz.
function analyzeFast(){
  let d=mono(),sr=buffer.sampleRate,size=1024,hop=512,segments=[],cur=null;
  for(let i=0;i+size<d.length;i+=hop){
    let p=detectPitchYin(d.subarray(i,i+size),sr),t=i/sr;
    if(!p){if(cur&&t-cur.last>.09){segments.push(cur);cur=null}continue}
    if(!cur){cur={start:t,last:t,p:[p.midi],c:[p.confidence]};continue}
    let sorted=[...cur.p].sort((a,b)=>a-b),median=sorted[Math.floor(sorted.length/2)];
    if(Math.abs(p.midi-median)>1.25&&t-cur.start>.08){segments.push(cur);cur={start:t,last:t,p:[p.midi],c:[p.confidence]}}
    else{cur.last=t;cur.p.push(p.midi);cur.c.push(p.confidence)}
  }
  if(cur)segments.push(cur);
  let beat=60/(Number($('#tempo').value)||90),grid=Number($('#grid').value);
  return segments.flatMap(s=>{
    let duration=s.last+hop/sr-s.start;if(duration<.06)return[];
    let values=[...s.p].sort((a,b)=>a-b);
    return[{midi:Math.round(values[Math.floor(values.length/2)]),beats:Math.max(grid,Math.round(duration/beat/grid)*grid),confidence:s.c.reduce((a,b)=>a+b,0)/s.c.length,start:s.start}];
  });
}
function detectPitchYin(frame,sr){
  let rms=Math.sqrt(frame.reduce((sum,x)=>sum+x*x,0)/frame.length);
  if(rms<.012)return null;
  let min=Math.floor(sr/1200),max=Math.min(Math.floor(sr/70),frame.length/2),diff=new Float32Array(max+1),running=0;
  for(let tau=1;tau<=max;tau++){
    let value=0;
    for(let i=0;i<frame.length-tau;i+=4){let delta=frame[i]-frame[i+tau];value+=delta*delta}
    diff[tau]=value;running+=value;
    if(tau>=min){
      let normalized=value*tau/(running||1);
      if(normalized<.14){
        let next=0;
        for(let i=0;i<frame.length-tau-1;i+=4){let delta=frame[i]-frame[i+tau+1];next+=delta*delta}
        if(next*(tau+1)/(running+next||1)>normalized){
          let frequency=sr/tau;
          return{midi:69+12*Math.log2(frequency/440),confidence:Math.max(0,1-normalized)};
        }
      }
    }
  }
  return null;
}
analyze=analyzeFast;
addEventListener('pagehide',()=>{stopPlayback();if(recorder?.state==='recording')recorder.stop();stream?.getTracks().forEach(t=>t.stop())});
