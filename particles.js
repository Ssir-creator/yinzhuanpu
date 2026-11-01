'use strict';
const canvas=document.querySelector('#stage'),ctx=canvas.getContext('2d'),$=s=>document.querySelector(s);
let w,h,dpr,ac,analyser,source,stream,audio,blobUrl,timer,mode='idle',style='galaxy',energy=0,bass=0,treble=0,previous=0,lastAttack=0,time=0,rotation=0,targetRotation=0,waves=[],raf,lastTime=0,touring=false,tourStarted=0,sceneStarted=0,showStep=0,showNodes=[],demoTimeouts=[];
const points=Array.from({length:14000},(_,i)=>({u:Math.random(),v:Math.random(),seed:Math.random(),line:i%4}));
function resize(){dpr=Math.min(devicePixelRatio||1,2);w=innerWidth;h=innerHeight;canvas.width=w*dpr;canvas.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0)}
addEventListener('resize',resize);resize();
function audioContext(){return ac||(ac=new AudioContext())}
function setupAnalyser(){analyser=audioContext().createAnalyser();analyser.fftSize=2048;analyser.smoothingTimeConstant=.65;return analyser}
function attack(strength=1){waves.push({born:time,strength});if(waves.length>20)waves.shift()}
function stop(){touring=false;$('#tour').textContent='▶ 一键巡演 · 五种效果';demoTimeouts.forEach(clearTimeout);demoTimeouts=[];showNodes.forEach(n=>{try{n.stop()}catch{}});showNodes=[];clearInterval(timer);timer=null;if(audio){audio.pause();audio.src='';audio=null}source?.disconnect();source=null;stream?.getTracks().forEach(t=>t.stop());stream=null;if(blobUrl){URL.revokeObjectURL(blobUrl);blobUrl=null}analyser?.disconnect();analyser=null;mode='idle';$('#mode').textContent='待机 / 余音消散';$('#status').textContent='可以切换形态，再听一次。';$('#stop').disabled=true;$('#demo').textContent='▶ 播放演示';$('#mic').textContent='打开麦克风'}
function active(kind){mode=kind;$('#stop').disabled=false;$('#mode').textContent=kind==='mic'?'LIVE / 麦克风':kind==='file'?'AUDIO / 导入音频':'DEMO / 合成拨弦';$('#status').textContent=kind==='mic'?'正在聆听。弹奏单音或连续拨弦，观察粒子变化。':kind==='file'?'粒子由当前音频的音量、频谱与起音驱动。':'合成拨弦演示。可打开麦克风换成你的琵琶。'}
function pluck(freq,length=.65,volume=.55){const a=audioContext(),rate=a.sampleRate,n=Math.floor(rate*length),buffer=a.createBuffer(1,n,rate),data=buffer.getChannelData(0),period=Math.max(2,Math.round(rate/freq));for(let i=0;i<period;i++)data[i]=Math.random()*2-1;for(let i=period;i<n;i++)data[i]=.495*(data[i-period]+data[Math.max(0,i-period-1)]);const s=a.createBufferSource(),g=a.createGain();s.buffer=buffer;g.gain.value=volume;s.connect(g).connect(analyser);g.connect(a.destination);s.start();showNodes.push(s);s.onended=()=>{s.disconnect();g.disconnect()}}
function performStep(){
 const elapsed=time-sceneStarted,phase=elapsed<4?'轻拨 · 观察单次回应':elapsed<10?'渐密 · 织起空间纹理':elapsed<15?'强奏 · 展开全部气势':'余韵 · 看粒子消散';
 $('#chapter').textContent=`${Object.keys(schemes).indexOf(style)+1} / 5 · ${phase}`;
 $('#chapter-progress').style.width=`${Math.min(100,elapsed/18*100)}%`;
 const melody=[293.66,440,587.33,659.25,587.33,440,392,329.63,293.66,392,440,587.33],freq=melody[showStep%melody.length];
 if(elapsed<15){const strong=elapsed>=10,volume=strong?.85:elapsed<4?.35:.55;pluck(freq,.9,volume);
 if(elapsed>=4){const repeats=strong?3:1;for(let j=1;j<=repeats;j++)demoTimeouts.push(setTimeout(()=>{if(mode==='demo')pluck(freq*(j%2?1:2),.45,volume*.7)},j*95));}
 if(strong&&showStep%3===0){pluck(freq/2,1.1,.7);attack(1.5)}
 }
 showStep++;
 if(elapsed>=18){if(touring){const keys=Object.keys(schemes),next=keys.indexOf(style)+1;if(next<keys.length){selectStyle(keys[next]);sceneStarted=time;showStep=0;$('#status').textContent=`自动巡演 ${next+1}/5：${schemes[keys[next]][0].replace(/<br>|。/g,'')}`;}else{stop();$('#chapter').textContent='五幕结束 · 点击方案按钮重看，或再次巡演';$('#chapter-progress').style.width='100%';$('#status').textContent='五种效果已展示完毕。告诉我最喜欢的编号。'}}else{sceneStarted=time;showStep=0}}
}
async function startShow(all){stop();try{await audioContext().resume();setupAnalyser();active('demo');touring=all;if(all)selectStyle('galaxy');sceneStarted=time;tourStarted=time;showStep=0;$('#tour').textContent=all?'■ 停止巡演':'▶ 一键巡演 · 五种效果';$('#demo').textContent='↻ 重看当前方案';$('#status').textContent=all?'自动巡演中，每幕18秒；无需麦克风。':'当前方案循环演示：轻拨 → 渐密 → 强奏 → 余韵。';performStep();timer=setInterval(performStep,450)}catch(e){stop();$('#status').textContent='无法播放声音，请在 Chrome 或 Edge 中打开重试。'}}
$('#demo').onclick=()=>startShow(false);
$('#tour').onclick=()=>touring?stop():startShow(true);
$('#mic').onclick=async()=>{stop();$('#status').textContent='正在请求麦克风权限…';try{if(!navigator.mediaDevices?.getUserMedia)throw Error('需要在 HTTPS 页面或本机浏览器中使用麦克风');await audioContext().resume();const incoming=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});stream=incoming;setupAnalyser();source=ac.createMediaStreamSource(stream);source.connect(analyser);active('mic');$('#mic').textContent='● 麦克风已连接'}catch(e){stop();$('#status').textContent=e.name==='NotAllowedError'?'未获得麦克风权限。可以先使用演示或导入音频。':e.message}};
$('#file').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;stop();try{await audioContext().resume();setupAnalyser();blobUrl=URL.createObjectURL(f);audio=new Audio(blobUrl);source=ac.createMediaElementSource(audio);source.connect(analyser);analyser.connect(ac.destination);await audio.play();active('file');$('#status').textContent=`正在播放：${f.name}`;audio.onended=stop}catch(e){stop();$('#status').textContent='无法播放此音频，请尝试 WAV 或 MP3。'}};
$('#stop').onclick=stop;
const schemes={galaxy:['星河<br>风暴。','置身旋转星系，让每次拨弦<br>掀起一场向外蔓延的风暴。'],mountains:['万仞<br>山海。','声音抬升群山，拨弦卷起云海。<br>在山脊与潮汐之间，看见余韵。'],dragon:['游龙<br>入海。','金色长带穿越深空，<br>连续拨弦，让游龙奔涌。'],aurora:['天幕<br>极光。','声音撑开垂落的天幕，<br>每一次起伏，都是一道光。'],rift:['弦裂<br>天地。','四弦悬于暗场。<br>一声拨响，粒子洪流破空而出。']};
function selectStyle(name){style=name;waves=[];ctx.fillStyle='#080c13';ctx.fillRect(0,0,w,h);document.querySelectorAll('[data-style]').forEach(x=>x.setAttribute('aria-pressed',x.dataset.style===name));$('.intro h1').innerHTML=schemes[name][0];$('.intro p').innerHTML=schemes[name][1];sceneStarted=time;attack(1.25)}
document.querySelectorAll('[data-style]').forEach(b=>b.onclick=()=>{selectStyle(b.dataset.style);if(mode==='demo'){touring=false;sceneStarted=time;showStep=0;$('#tour').textContent='▶ 一键巡演 · 五种效果'}else startShow(false)});
$('#burst').onclick=()=>attack(2.5);
const initialStyle=new URLSearchParams(location.search).get('style');if(schemes[initialStyle])selectStyle(initialStyle);
$('#fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()}catch{$('#status').textContent='当前窗口不支持全屏，可以在浏览器中打开。'}};
$('#capture').onclick=()=>{const a=document.createElement('a');a.download=`弦生-${Date.now()}.png`;a.href=canvas.toDataURL('image/png');a.click()};
canvas.addEventListener('pointermove',e=>targetRotation=(e.clientX/w-.5)*.8);
canvas.addEventListener('pointerdown',()=>attack(1.1));
let bins=new Uint8Array(1024),samples=new Float32Array(2048);
function analyze(){let target=0,lo=0,hi=0;if(analyser){analyser.getByteFrequencyData(bins);analyser.getFloatTimeDomainData(samples);target=Math.min(1,Math.sqrt(samples.reduce((s,v)=>s+v*v,0)/samples.length)*5);for(let i=2;i<22;i++)lo+=bins[i]/255/20;for(let i=70;i<260;i++)hi+=bins[i]/255/190;if(target>Math.max(.06,previous*1.32)&&time-lastAttack>.13){attack(Math.min(1,target*1.7));lastAttack=time}previous=previous*.65+target*.35}energy+=(target-energy)*.15;bass+=(lo-bass)*.12;treble+=(hi-treble)*.12;$('#energy').textContent=String(Math.round(energy*99)).padStart(2,'0');$('#meter').style.width=`${energy*100}%`}
function draw(now){
const dt=lastTime?Math.min(.05,(now-lastTime)/1000):.016;lastTime=now;time+=dt;analyze();rotation+=(targetRotation-rotation)*.035;
ctx.globalCompositeOperation='source-over';ctx.fillStyle='rgba(5,8,16,.35)';ctx.fillRect(0,0,w,h);
const cx=w*(w<750?.5:.56),cy=h*(w<750?.52:.48),scale=Math.min(w*.55,h*.65);
waves=waves.filter(v=>time-v.born<3.5);const shocks=waves.map(v=>({age:time-v.born,s:v.strength}));let impact=shocks.reduce((sum,v)=>sum+v.s*Math.exp(-v.age*2),0);
const haze=ctx.createRadialGradient(cx,cy,0,cx,cy,scale);haze.addColorStop(0,style==='rift'?'rgba(110,40,12,.16)':'rgba(35,55,105,.12)');haze.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=haze;ctx.fillRect(0,0,w,h);ctx.globalCompositeOperation='lighter';
for(const p of points){const u=p.u,v=p.v,seed=p.seed;let x,y,z,hue,sat=75,light=65,pulse=0;
for(const wave of shocks){const d=u-wave.age*.5;pulse+=Math.exp(-d*d*100)*wave.s*Math.exp(-wave.age*.65)}
if(style==='galaxy'){
 const r=.04+Math.sqrt(u)*1.12,a=v*Math.PI*2+time*(.06+.09/(r+.2))+r*4.2,arm=Math.floor(v*5)*Math.PI*2/5+r*4.2+time*.08+(seed-.5)*.48;
 const angle=seed>.14?arm:a,rr=r+pulse*.22;
 x=Math.cos(angle)*rr;y=Math.sin(angle)*rr*.48;z=(seed-.5)*(.14+u*.5)+Math.sin(angle)*rr*.35;
 hue=seed>.5?210+u*45:30+u*20;light=62+(1-u)*25;
}else if(style==='mountains'){
 x=(u-.5)*3.1;z=(v-.5)*2.5;const ridge=Math.pow(Math.max(0,Math.sin(u*12+v*5)+.5*Math.sin(u*24-v*8)),2)*.19;
 y=.38-ridge*(.8+v*.6)-pulse*.27-bass*.23+Math.sin(u*16-v*7+time*.45)*.055;
 hue=seed>.6?175:37;light=45+ridge*75+v*15;
}else if(style==='dragon'){
 const a=u*Math.PI*3.5-time*.65+p.line*.72,thick=.025+v*.13;
 x=(u-.5)*2.9;y=Math.sin(a)*(.27+pulse*.22)+Math.cos(v*Math.PI*2)*thick;z=Math.cos(a)*.5+Math.sin(v*Math.PI*2)*thick;
 hue=p.line===0?185:26+seed*23;light=53+seed*25;
}else if(style==='aurora'){
 const a=u*7+time*.2;x=(u-.5)*2.9;z=Math.sin(a)*.35+p.line*.045;
 y=(v-.5)*(1.2+.3*Math.sin(a*1.4)+pulse*.9)+Math.sin(a*1.6)*.17;
 x+=Math.sin(v*4+a)*.1;hue=145+u*110+p.line*9;light=48+seed*20;
}else{
 const along=(u-.5)*2.5,theta=v*Math.PI*2;
 x=(p.line-1.5)*.26+Math.sin(along*9-time)*(.006+energy*.05)+Math.cos(theta)*pulse*.8;
 y=along;z=Math.sin(theta)*pulse*.8+(seed-.5)*.035;
 if(seed<.32){const travel=((u+time*.07)%1);x=(p.line-1.5)*.26+Math.cos(theta)*travel*(.15+impact*.3);y=(v-.5)*2.6;z=Math.sin(theta)*travel*.5;}
 hue=seed>.6?195:24+seed*27;light=58+seed*24;
}
const turn=rotation+Math.sin(time*.07)*.12,xx=x*Math.cos(turn)-z*Math.sin(turn),zz=x*Math.sin(turn)+z*Math.cos(turn),depth=3.2/(3.2+zz);
const sx=cx+xx*scale*depth,sy=cy+y*scale*depth;let alpha=Math.min(.85,(.13+seed*.48+pulse*.22+energy*.2)),size=(.45+seed*.8+pulse*.7+energy*.5)*depth;
ctx.fillStyle=`hsla(${hue},${sat}%,${Math.min(92,light)}%,${alpha})`;ctx.fillRect(sx,sy,size,size);
if(seed>.993){ctx.fillStyle=`hsla(${hue},85%,75%,.09)`;ctx.beginPath();ctx.arc(sx,sy,size*5,0,Math.PI*2);ctx.fill()}
}
// Expanding shock fronts distinguish individual plucks from ambient movement.
if(style==='galaxy'||style==='rift')for(const wave of shocks){let r=wave.age*scale*.65;if(r<3)continue;ctx.strokeStyle=`rgba(210,180,130,${Math.max(0,.2-wave.age*.07)*wave.s})`;ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(cx,cy,r,style==='galaxy'?r*.48:r*.75,rotation,0,Math.PI*2);ctx.stroke()}
ctx.globalCompositeOperation='source-over';raf=requestAnimationFrame(draw)}
ctx.fillStyle='#080c13';ctx.fillRect(0,0,w,h);raf=requestAnimationFrame(draw);addEventListener('pagehide',()=>{stop();cancelAnimationFrame(raf)});
