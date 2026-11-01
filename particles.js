'use strict';
const canvas=document.querySelector('#stage'),ctx=canvas.getContext('2d'),$=s=>document.querySelector(s);
let w,h,dpr,ac,analyser,source,stream,audio,blobUrl,timer,mode='idle',style='galaxy',energy=0,bass=0,treble=0,previous=0,lastAttack=0,time=0,rotation=0,targetRotation=0,waves=[],raf,lastTime=0,touring=false,tourStarted=0,sceneStarted=0,showStep=0,showNodes=[],demoTimeouts=[],tension=1.2,galaxyDrive=0;
const points=Array.from({length:14000},(_,i)=>({u:Math.random(),v:Math.random(),seed:Math.random(),line:i%4}));
function resize(){dpr=Math.min(devicePixelRatio||1,2);w=innerWidth;h=innerHeight;canvas.width=w*dpr;canvas.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0)}
addEventListener('resize',resize);resize();
function audioContext(){return ac||(ac=new AudioContext())}
function setupAnalyser(){analyser=audioContext().createAnalyser();analyser.fftSize=2048;analyser.smoothingTimeConstant=.65;return analyser}
function attack(strength=1){waves.push({born:time,strength});if(waves.length>20)waves.shift()}
function stop(){touring=false;$('#tour').textContent='▶ 一键巡演 · 五种效果';demoTimeouts.forEach(clearTimeout);demoTimeouts=[];showNodes.forEach(n=>{try{n.stop()}catch{}});showNodes=[];clearInterval(timer);timer=null;if(audio){audio.pause();audio.src='';audio=null}source?.disconnect();source=null;stream?.getTracks().forEach(t=>t.stop());stream=null;if(blobUrl){URL.revokeObjectURL(blobUrl);blobUrl=null}analyser?.disconnect();analyser=null;mode='idle';$('#mode').textContent='待机 / 余音消散';$('#status').textContent='可以切换形态，再听一次。';$('#stop').disabled=true;$('#demo').textContent=style==='galaxy'?'▶ 观看星河风暴':'▶ 观看当前方案';$('#mic').textContent='打开麦克风'}
function active(kind){mode=kind;$('#stop').disabled=false;$('#mode').textContent=kind==='mic'?'LIVE / 麦克风':kind==='file'?'AUDIO / 导入音频':'DEMO / 合成拨弦';$('#status').textContent=kind==='mic'?'正在聆听。弹奏单音或连续拨弦，观察粒子变化。':kind==='file'?'粒子由当前音频的音量、频谱与起音驱动。':'合成拨弦演示。可打开麦克风换成你的琵琶。'}
function pluck(freq,length=.65,volume=.55){const a=audioContext(),rate=a.sampleRate,n=Math.floor(rate*length),buffer=a.createBuffer(1,n,rate),data=buffer.getChannelData(0),period=Math.max(2,Math.round(rate/freq));for(let i=0;i<period;i++)data[i]=Math.random()*2-1;for(let i=period;i<n;i++)data[i]=.495*(data[i-period]+data[Math.max(0,i-period-1)]);const s=a.createBufferSource(),g=a.createGain();s.buffer=buffer;g.gain.value=volume;s.connect(g).connect(analyser);g.connect(a.destination);s.start();showNodes.push(s);s.onended=()=>{s.disconnect();g.disconnect();showNodes=showNodes.filter(node=>node!==s)}}
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
$('#tension').oninput=e=>tension=Number(e.target.value);
$('#immersive').onclick=()=>{const enabled=document.body.classList.toggle('immersive');$('#immersive').setAttribute('aria-pressed',String(enabled));$('#immersive').textContent=enabled?'退出沉浸':'沉浸模式'};
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
if(style==='galaxy'){drawGalaxy(dt);raf=requestAnimationFrame(draw);return}
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
ctx.fillStyle='#080c13';ctx.fillRect(0,0,w,h);raf=requestAnimationFrame(draw);addEventListener('pagehide',()=>{stop();cancelAnimationFrame(raf)});
