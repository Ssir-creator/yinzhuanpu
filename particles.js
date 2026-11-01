'use strict';
const canvas=document.querySelector('#stage'),ctx=canvas.getContext('2d'),$=s=>document.querySelector(s);
let w,h,dpr,ac,analyser,source,stream,audio,blobUrl,timer,mode='idle',style='cloud',energy=0,bass=0,treble=0,previous=0,lastAttack=0,time=0,rotation=0,targetRotation=0,waves=[],raf,lastTime=0,touring=false,tourStarted=0,sceneStarted=0,showStep=0,showNodes=[],demoTimeouts=[],tension=1.2,galaxyDrive=0;
const points=Array.from({length:14000},(_,i)=>({u:Math.random(),v:Math.random(),seed:Math.random(),line:i%4}));
function resize(){dpr=Math.min(devicePixelRatio||1,2);w=innerWidth;h=innerHeight;canvas.width=w*dpr;canvas.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0)}
addEventListener('resize',resize);resize();
function audioContext(){return ac||(ac=new AudioContext())}
function setupAnalyser(){analyser=audioContext().createAnalyser();analyser.fftSize=2048;analyser.smoothingTimeConstant=.65;return analyser}
function attack(strength=1){waves.push({born:time,strength});if(waves.length>20)waves.shift()}
function stop(){touring=false;$('#tour').textContent='▶ 一键巡演 · 六种效果';demoTimeouts.forEach(clearTimeout);demoTimeouts=[];showNodes.forEach(n=>{try{n.stop()}catch{}});showNodes=[];clearInterval(timer);timer=null;if(audio){audio.pause();audio.src='';audio=null}source?.disconnect();source=null;stream?.getTracks().forEach(t=>t.stop());stream=null;if(blobUrl){URL.revokeObjectURL(blobUrl);blobUrl=null}analyser?.disconnect();analyser=null;mode='idle';$('#mode').textContent='待机 / 余音消散';$('#status').textContent='可以切换形态，再听一次。';$('#stop').disabled=true;$('#demo').textContent=style==='galaxy'?'▶ 观看星河风暴':'▶ 观看当前方案';$('#mic').textContent='打开麦克风'}
function active(kind){mode=kind;$('#stop').disabled=false;$('#mode').textContent=kind==='mic'?'LIVE / 麦克风':kind==='file'?'AUDIO / 导入音频':'DEMO / 合成拨弦';$('#status').textContent=kind==='mic'?'正在聆听。弹奏单音或连续拨弦，观察粒子变化。':kind==='file'?'粒子由当前音频的音量、频谱与起音驱动。':'合成拨弦演示。可打开麦克风换成你的琵琶。'}
function pluck(freq,length=.65,volume=.55){const a=audioContext(),rate=a.sampleRate,n=Math.floor(rate*length),buffer=a.createBuffer(1,n,rate),data=buffer.getChannelData(0),period=Math.max(2,Math.round(rate/freq));for(let i=0;i<period;i++)data[i]=Math.random()*2-1;for(let i=period;i<n;i++)data[i]=.495*(data[i-period]+data[Math.max(0,i-period-1)]);const s=a.createBufferSource(),g=a.createGain();s.buffer=buffer;g.gain.value=volume;s.connect(g).connect(analyser);g.connect(a.destination);s.start();showNodes.push(s);s.onended=()=>{s.disconnect();g.disconnect();showNodes=showNodes.filter(node=>node!==s)}}
function performStep(){
 const elapsed=time-sceneStarted,phase=elapsed<4?'轻拨 · 观察单次回应':elapsed<10?'渐密 · 织起空间纹理':elapsed<15?'强奏 · 展开全部气势':'余韵 · 看粒子消散';
 $('#chapter').textContent=`${Object.keys(schemes).indexOf(style)+1} / 6 · ${phase}`;
 $('#chapter-progress').style.width=`${Math.min(100,elapsed/18*100)}%`;
 const melody=[293.66,440,587.33,659.25,587.33,440,392,329.63,293.66,392,440,587.33],freq=melody[showStep%melody.length];
 if(elapsed<15){const strong=elapsed>=10,volume=strong?.85:elapsed<4?.35:.55;pluck(freq,.9,volume);
 if(elapsed>=4){const repeats=strong?3:1;for(let j=1;j<=repeats;j++)demoTimeouts.push(setTimeout(()=>{if(mode==='demo')pluck(freq*(j%2?1:2),.45,volume*.7)},j*95));}
 if(strong&&showStep%3===0){pluck(freq/2,1.1,.7);attack(1.5)}
 }
 showStep++;
 if(elapsed>=18){if(touring){const keys=Object.keys(schemes),next=keys.indexOf(style)+1;if(next<keys.length){selectStyle(keys[next]);sceneStarted=time;showStep=0;$('#status').textContent=`自动巡演 ${next+1}/6：${schemes[keys[next]][0].replace(/<br>|。/g,'')}`;}else{stop();$('#chapter').textContent='六幕结束 · 点击方案按钮重看，或再次巡演';$('#chapter-progress').style.width='100%';$('#status').textContent='六种效果已展示完毕。告诉我最喜欢的编号。'}}else{sceneStarted=time;showStep=0}}
}
async function startShow(all){stop();try{await audioContext().resume();setupAnalyser();active('demo');touring=all;if(all)selectStyle('cloud');sceneStarted=time;tourStarted=time;showStep=0;$('#tour').textContent=all?'■ 停止巡演':'▶ 一键巡演 · 六种效果';$('#demo').textContent='↻ 重看当前方案';$('#status').textContent=all?'自动巡演中，每幕18秒；无需麦克风。':'当前方案循环演示：轻拨 → 渐密 → 强奏 → 余韵。';performStep();timer=setInterval(performStep,450)}catch(e){stop();$('#status').textContent='无法播放声音，请在 Chrome 或 Edge 中打开重试。'}}
$('#demo').onclick=()=>startShow(false);
$('#tension').oninput=e=>tension=Number(e.target.value);
$('#immersive').onclick=()=>{const enabled=document.body.classList.toggle('immersive');$('#immersive').setAttribute('aria-pressed',String(enabled));$('#immersive').textContent=enabled?'退出沉浸':'沉浸模式'};
$('#tour').onclick=()=>touring?stop():startShow(true);
$('#mic').onclick=async()=>{stop();$('#status').textContent='正在请求麦克风权限…';try{if(!navigator.mediaDevices?.getUserMedia)throw Error('需要在 HTTPS 页面或本机浏览器中使用麦克风');await audioContext().resume();const incoming=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});stream=incoming;setupAnalyser();source=ac.createMediaStreamSource(stream);source.connect(analyser);active('mic');$('#mic').textContent='● 麦克风已连接'}catch(e){stop();$('#status').textContent=e.name==='NotAllowedError'?'未获得麦克风权限。可以先使用演示或导入音频。':e.message}};
$('#file').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;stop();try{await audioContext().resume();setupAnalyser();blobUrl=URL.createObjectURL(f);audio=new Audio(blobUrl);source=ac.createMediaElementSource(audio);source.connect(analyser);analyser.connect(ac.destination);await audio.play();active('file');$('#status').textContent=`正在播放：${f.name}`;audio.onended=stop}catch(e){stop();$('#status').textContent='无法播放此音频，请尝试 WAV 或 MP3。'}};
$('#stop').onclick=stop;
const schemes={cloud:['呼吸<br>粒子云。','一团光尘随声音聚散。<br>听见轻拨，看见呼吸。'],ribbon:['丝带<br>流场。','起音沿光丝传播，<br>余韵在空间里舒展、缠绕。'],water:['粒子<br>水面。','每一次拨弦，激起一圈涟漪。<br>让声波相遇，然后平息。'],ring:['声纹<br>光环。','频谱在环上展开，<br>让声音的明暗有迹可循。'],sand:['共振<br>沙场。','声音牵引光沙，聚成共振意象。<br>艺术化频谱映射，非物理声场模拟。'],galaxy:['星河<br>风暴。','保留你选择的星河。<br>拨弦唤起旋臂与星尘冲击波。']};
function selectStyle(name){style=name;waves=[];ctx.fillStyle='#080c13';ctx.fillRect(0,0,w,h);document.querySelectorAll('[data-style]').forEach(x=>x.setAttribute('aria-pressed',x.dataset.style===name));$('.intro h1').innerHTML=schemes[name][0];$('.intro p').innerHTML=schemes[name][1];sceneStarted=time;resetField();attack(.5)}
document.querySelectorAll('[data-style]').forEach(b=>b.onclick=()=>{selectStyle(b.dataset.style);if(mode==='demo'){touring=false;sceneStarted=time;showStep=0;$('#tour').textContent='▶ 一键巡演 · 六种效果'}else if(mode==='idle')startShow(false)});
$('#burst').onclick=()=>attack(2.5);

$('#fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()}catch{$('#status').textContent='当前窗口不支持全屏，可以在浏览器中打开。'}};
$('#capture').onclick=()=>{const a=document.createElement('a');a.download=`弦生-${Date.now()}.png`;a.href=canvas.toDataURL('image/png');a.click()};
canvas.addEventListener('pointermove',e=>targetRotation=(e.clientX/w-.5)*.8);
canvas.addEventListener('pointerdown',()=>attack(1.1));
let bins=new Uint8Array(1024),samples=new Float32Array(2048);
function analyze(){let target=0,lo=0,hi=0;if(analyser){analyser.getByteFrequencyData(bins);analyser.getFloatTimeDomainData(samples);target=Math.min(1,Math.sqrt(samples.reduce((s,v)=>s+v*v,0)/samples.length)*5);for(let i=2;i<22;i++)lo+=bins[i]/255/20;for(let i=70;i<260;i++)hi+=bins[i]/255/190;if(target>Math.max(.06,previous*1.32)&&time-lastAttack>.13){attack(Math.min(1,target*1.7));lastAttack=time}previous=previous*.65+target*.35}energy+=(target-energy)*.15;bass+=(lo-bass)*.12;treble+=(hi-treble)*.12;$('#energy').textContent=String(Math.round(energy*99)).padStart(2,'0');$('#meter').style.width=`${energy*100}%`}
function draw(now){
const elapsed=lastTime?Math.max(0,(now-lastTime)/1000):.016,dt=Math.min(.05,elapsed);lastTime=now;time+=elapsed;analyze();rotation+=(targetRotation-rotation)*(1-Math.exp(-dt*3));
if(style==='galaxy')drawGalaxy(dt);else drawField(dt);
raf=requestAnimationFrame(draw)}
// Stable particles and cached glow sprites keep the layered star field coherent.
const starPalettes=['190,218,255','112,154,255','177,133,244','255,206,147','239,246,255'];
const glowSprites=starPalettes.map(rgb=>{const sprite=document.createElement('canvas');sprite.width=sprite.height=64;const c=sprite.getContext('2d'),g=c.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,`rgba(${rgb},.9)`);g.addColorStop(.12,`rgba(${rgb},.55)`);g.addColorStop(.4,`rgba(${rgb},.13)`);g.addColorStop(1,`rgba(${rgb},0)`);c.fillStyle=g;c.fillRect(0,0,64,64);return sprite});
const galaxyStars=Array.from({length:22000},(_,i)=>{const r=Math.pow(Math.random(),.7)*1.24,arm=i%4,jitter=(Math.random()+Math.random()-1)*(.11+r*.13);return{r,a:arm*Math.PI*.5+r*3.8+jitter,z:(Math.random()+Math.random()-1)*(.035+r*.095),lum:Math.random(),color:i%5,seed:Math.random(),px:null,py:null}});
const distantStars=Array.from({length:500},()=>({x:Math.random(),y:Math.random(),size:.3+Math.random(),phase:Math.random()*7}));
function drawGalaxy(dt){
 const mobile=w<750,scale=Math.min(w*(mobile?.67:.46),h*(mobile?.47:.65)),cx=w*(mobile?.5:.55),cy=h*(mobile?.49:.48);
 const impulse=waves.reduce((sum,wave)=>sum+wave.strength*Math.exp(-(time-wave.born)*2.8),0)*tension;
 const desired=Math.min(1.8,impulse*.58+energy*.8+bass*.25);galaxyDrive+=(desired-galaxyDrive)*(1-Math.exp(-dt*4));
 const drive=galaxyDrive,zoom=1+drive*.14,tilt=.72+Math.sin(time*.07)*.09+rotation*.25;
 ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;ctx.fillStyle='rgba(4,6,15,.52)';ctx.fillRect(0,0,w,h);
 for(const star of distantStars){ctx.fillStyle=`rgba(170,195,230,${.13+.17*(1+Math.sin(time*.4+star.phase))})`;ctx.fillRect(star.x*w,star.y*h,star.size,star.size)}
 ctx.globalCompositeOperation='lighter';
 const halo=ctx.createRadialGradient(cx,cy,0,cx,cy,scale*1.5);halo.addColorStop(0,`rgba(51,76,145,${.09+drive*.03})`);halo.addColorStop(.35,'rgba(49,29,91,.035)');halo.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=halo;ctx.fillRect(0,0,w,h);
 const ringWaves=waves.map(wave=>({radius:(time-wave.born)*.68,strength:wave.strength*Math.exp(-(time-wave.born)*1.1)}));
 // Volume haze runs along four spiral arms, with a warm center and cool edges.
 for(let arm=0;arm<4;arm++)for(let j=1;j<38;j++){const r=j/38*1.2,a=arm*Math.PI/2+r*3.8+time*.055,xx=Math.cos(a)*r,yy=Math.sin(a)*r;
 const perspective=3.4/(3.4+yy*Math.sin(tilt)),sx=cx+(xx*Math.cos(rotation)-yy*.17*Math.sin(rotation))*scale*perspective*zoom,sy=cy+yy*Math.cos(tilt)*scale*perspective*zoom;
 const size=scale*(.09+r*.15)*perspective;ctx.globalAlpha=.045;ctx.drawImage(glowSprites[r<.33?3:arm%3],sx-size,sy-size* .75,size*2,size*1.5)}
 ctx.globalAlpha=1;
 for(let i=0;i<galaxyStars.length;i++){
 if(mobile&&i%3===0)continue;
 const star=galaxyStars[i],r=star.r;let kick=0;
 for(const wave of ringWaves){const d=r-wave.radius;kick+=Math.exp(-d*d*150)*wave.strength}
 const a=star.a+time*(.045+.022/(r+.17)),rr=r+kick*.12*tension;
 let x=Math.cos(a)*rr,y=Math.sin(a)*rr,z=star.z+Math.sin(a*3+time*.6)*.012+kick*(star.seed-.5)*.16;
 // A small fraction of near stars streams outward during an attack.
 if(star.seed>.86){const flight=drive*(star.seed-.86)*7;x*=1+flight*.45;y*=1+flight*.45;z-=flight*.55;}
 const xx=x*Math.cos(rotation)-y*.2*Math.sin(rotation),yy=y*Math.cos(tilt)-z*Math.sin(tilt),zz=y*Math.sin(tilt)+z*Math.cos(tilt),depth=3.4/(3.4+zz);
 const sx=cx+xx*scale*depth*zoom,sy=cy+yy*scale*depth*zoom;
 if(sx<0||sx>w||sy<0||sy>h){star.px=star.py=null;continue}
 const palette=r<.22?3:star.color,alpha=Math.min(.92,(.14+star.lum*.56)*( .8+kick*.4+drive*.12)),size=(.38+star.lum*.72+kick*.36)*depth;
 if(star.px!==null&&drive>.3&&star.seed>.86){const dx=sx-star.px,dy=sy-star.py,dist=Math.hypot(dx,dy);if(dist<70){ctx.strokeStyle=`rgba(${starPalettes[palette]},${alpha*.45})`;ctx.lineWidth=Math.max(.5,size*.6);ctx.beginPath();ctx.moveTo(sx-dx*2.3,sy-dy*2.3);ctx.lineTo(sx,sy);ctx.stroke()}}
 ctx.fillStyle=`rgba(${starPalettes[palette]},${alpha})`;ctx.fillRect(sx,sy,size,size);
 if(star.lum>.978){const glowSize=(7+kick*6)*depth;ctx.globalAlpha=.32;ctx.drawImage(glowSprites[palette],sx-glowSize,sy-glowSize,glowSize*2,glowSize*2);ctx.globalAlpha=1}
 star.px=sx;star.py=sy;
 }
 // Compact luminous nucleus: preserve the spiral silhouette rather than whitening the frame.
 const coreSize=scale*(.2+drive*.045);ctx.globalAlpha=.65;ctx.drawImage(glowSprites[3],cx-coreSize,cy-coreSize*.5,coreSize*2,coreSize);ctx.globalAlpha=.8;const inner=scale*.055;ctx.drawImage(glowSprites[4],cx-inner,cy-inner*.55,inner*2,inner*1.1);ctx.globalAlpha=1;
 for(const wave of ringWaves){if(wave.radius<.03)continue;ctx.strokeStyle=`rgba(146,181,250,${Math.min(.25,wave.strength*.15)})`;ctx.lineWidth=.8;ctx.beginPath();ctx.ellipse(cx,cy,wave.radius*scale*zoom,wave.radius*scale*Math.cos(tilt)*zoom,0,0,Math.PI*2);ctx.stroke()}
 ctx.globalCompositeOperation='source-over';
 const vignette=ctx.createRadialGradient(cx,cy,scale*.4,cx,cy,Math.max(w,h)*.8);vignette.addColorStop(0,'rgba(0,0,0,0)');vignette.addColorStop(1,'rgba(0,2,8,.78)');ctx.fillStyle=vignette;ctx.fillRect(0,0,w,h);
}

const fieldPoints=Array.from({length:8500},(_,i)=>({u:Math.random(),v:Math.random(),q:Math.random(),seed:Math.random(),lane:i%4,x:0,y:0,z:0,px:null,py:null,opacity:0}));
let fieldLevel=0,fieldBrightness=0,fieldHue=190;
// Precompute nodal silhouettes; particles ease toward the active frequency pattern.
const sandPatterns=[[2,3],[3,5],[4,7]].map(([m,n])=>{const result=[];while(result.length<8500){let x=Math.random()*2-1,y=Math.random()*2-1;const val=Math.cos(m*Math.PI*x)*Math.cos(n*Math.PI*y)-Math.cos(n*Math.PI*x)*Math.cos(m*Math.PI*y);if(Math.abs(val)<.075)result.push([x,y])}return result});
function resetField(){fieldPoints.forEach(p=>{p.px=p.py=null;p.opacity=0});fieldLevel=energy;}
function drawField(dt){
 const mobile=w<750,scale=Math.min(w*(mobile?.48:.36),h*(mobile?.28:.36)),cx=w*(mobile?.5:.55),cy=h*(mobile?.48:.48);
 fieldLevel+=(energy-fieldLevel)*(1-Math.exp(-dt*5));fieldBrightness+=(treble-fieldBrightness)*(1-Math.exp(-dt*2));
 const desiredHue=style==='sand'?36:style==='ribbon'?185+fieldBrightness*90:190+fieldBrightness*70;fieldHue+=(desiredHue-fieldHue)*(1-Math.exp(-dt*1.5));
 ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;ctx.fillStyle='rgba(5,9,17,.48)';ctx.fillRect(0,0,w,h);
 const events=waves.filter(wave=>time-wave.born<3);waves=events;const impulse=Math.min(1.8,events.reduce((s,event)=>s+event.strength*Math.exp(-(time-event.born)*4),0))*tension;
 const blend=1-Math.exp(-dt*5),breath=1+fieldLevel*.32*tension;
 ctx.globalCompositeOperation='lighter';
 for(let i=0;i<fieldPoints.length;i++){
  if(mobile&&i%3===0)continue;
  const p=fieldPoints[i],u=p.u,v=p.v,seed=p.seed;let x,y,z,local=0;
  if(style==='cloud'){
   const a=u*Math.PI*2,b=Math.acos(v*2-1),radius=Math.pow(p.q,.45)*.83;
   const ripple=events.reduce((s,event)=>{const d=radius-(time-event.born)*.7;return s+Math.exp(-d*d*100)*event.strength*.09},0);
   const r=radius*breath+ripple,flow=Math.sin(a*3+b*2+time*.18)*.06;
   x=Math.cos(a+time*.025)*Math.sin(b)*r*(1.18+flow);y=Math.cos(b)*r*.85;z=Math.sin(a+time*.025)*Math.sin(b)*r;
   x+=Math.sin(time*.24+v*7)*.025;local=ripple*3;
  }else if(style==='ribbon'){
   let pulse=0;for(const event of events){let d=u-(time-event.born)*.65;pulse+=Math.exp(-d*d*130)*event.strength}
   const phase=u*6.8+p.lane*.65+Math.sin(time*.2)*.3,thickness=(v-.5)*(.035+fieldLevel*.04),twist=time*.12;
   x=(u-.5)*2.7;y=Math.sin(phase+twist)*(.19+p.lane*.055)+thickness+Math.sin(v*6)*pulse*.07;
   z=Math.cos(phase)*.3+(p.lane-1.5)*.075+(p.q-.5)*.035;y+=Math.sin(u*13-time*.4)*fieldLevel*.09;local=pulse*.3;
  }else if(style==='water'){
   x=(u-.5)*2.6;z=(v-.5)*2.2;let height=0;
   for(let j=0;j<events.length;j++){const event=events[j],age=time-event.born,ox=Math.sin(event.born*1.7)*.4,oz=Math.cos(event.born*1.1)*.3,dist=Math.hypot(x-ox,z-oz),front=dist-age*.9;
   height+=Math.cos(front*15)*Math.exp(-front*front*7)*Math.exp(-age*.85)*event.strength*.13*tension;}
   y=.13+z*.28+height;local=Math.abs(height)*3;
  }else if(style==='ring'){
   const angle=u*Math.PI*2,bin=Math.min(500,Math.floor(u*260)+2),frequency=analyser?bins[bin]/255:0;
   const radius=.7+(v-.5)*.09+frequency*.32*tension+impulse*.035;
   x=Math.cos(angle)*radius;y=Math.sin(angle)*radius;z=(p.q-.5)*.1+Math.sin(angle*3+time*.1)*.025;local=frequency*.45;
  }else{
   const index=Math.min(2,Math.round(fieldBrightness*4+bass*.45)),a=sandPatterns[index][i];
   x=a[0]*.95;y=a[1]*.8;
   const scatter=impulse*.035;x+=Math.sin(seed*90+time)*scatter;y+=Math.cos(seed*70+time)*scatter;z=(p.q-.5)*.09;local=impulse*.1;
  }
  if(p.px===null){p.x=x;p.y=y;p.z=z}p.x+=(x-p.x)*blend;p.y+=(y-p.y)*blend;p.z+=(z-p.z)*blend;
  const opacityTarget=mode==='idle'?.22:(.25+fieldLevel*.55+local*.12),visible=p.q<.48+fieldLevel*.5||mode==='idle';p.opacity+=((visible?opacityTarget:.035)-p.opacity)*(1-Math.exp(-dt*4));
  const turn=rotation*.55,xx=p.x*Math.cos(turn)-p.z*Math.sin(turn),zz=p.x*Math.sin(turn)+p.z*Math.cos(turn),depth=3/(3+zz);
  const sx=cx+xx*scale*depth,sy=cy+p.y*scale*depth,size=(.45+seed*.65+local*.3)*depth;
  const hue=fieldHue+(seed-.5)*18+(p.lane===0?15:0),color=style==='sand'?'241,204,146':p.lane===0?'210,223,244':'139,196,218';
  if(p.px!==null&&local>.2){const dx=sx-p.px,dy=sy-p.py;if(Math.hypot(dx,dy)<15){ctx.strokeStyle=`rgba(${color},${p.opacity*.16})`;ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(p.px,p.py);ctx.lineTo(sx,sy);ctx.stroke()}}
  ctx.fillStyle=`hsla(${hue},${style==='sand'?52:40}%,${68+seed*15}%,${p.opacity})`;ctx.beginPath();ctx.arc(sx,sy,size*.7,0,Math.PI*2);ctx.fill();
  if(seed>.965){const gl=(4+seed*2+local*2)*depth;ctx.globalAlpha=p.opacity*.27;ctx.drawImage(glowSprites[style==='sand'?3:0],sx-gl,sy-gl,gl*2,gl*2);ctx.globalAlpha=1}
  p.px=sx;p.py=sy;
 }
 if(style==='ring')for(const event of events){const age=time-event.born,r=(.76+age*.23)*scale;ctx.strokeStyle=`rgba(170,210,235,${Math.max(0,.15-age*.08)*event.strength})`;ctx.lineWidth=.7;ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.stroke()}
 ctx.globalCompositeOperation='source-over';
}
const initialStyle=new URLSearchParams(location.search).get('style');if(schemes[initialStyle])selectStyle(initialStyle);
ctx.fillStyle='#080c13';ctx.fillRect(0,0,w,h);raf=requestAnimationFrame(draw);addEventListener('pagehide',()=>{stop();cancelAnimationFrame(raf)});
