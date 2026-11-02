'use strict';
const $=s=>document.querySelector(s),canvas=$('#fluid'),legacyCanvas=$('#legacy'),legacyRenderer=new LegacyGalaxyRenderer(legacyCanvas);let legacyWaves=[],lastLegacyImpulse=0,magnitude=1.4;
const presets=[
{id:'S',name:'星河风暴 · 保留版',shape:-1,palette:0,desc:'恢复之前的星河旋臂、中心光核与近景星尘。'},
{id:'A',name:'幻彩粒子云',shape:0,palette:0,desc:'光尘聚拢、鼓起、卷曲，拨弦激起局部绽放。'},
{id:'B',name:'蓝紫烟纱',shape:1,palette:1,desc:'多层薄纱翻卷、折叠，显出半透明的流动褶皱。'},
{id:'C',name:'金白弦流',shape:2,palette:2,desc:'金白光丝横向舒展，起音沿丝带缓缓传播。'},
{id:'D',name:'青白流墨',shape:3,palette:3,desc:'青白烟墨向上涌动，边缘卷起细腻涡流。'},
{id:'E',name:'浮光伞幕',shape:4,palette:1,desc:'薄膜随声音呼吸，余音牵动细长的粒子流苏。'},
{id:'F',name:'双色交织',shape:5,palette:4,desc:'青蓝与珊瑚两股光流，相互穿插、盘旋。'},
{id:'BC',name:'烟纱 × 金白',shape:1,palette:2,desc:'B 的烟纱形态，加上 C 的金白色调。'},
{id:'BF',name:'烟纱 × 双色',shape:1,palette:4,desc:'B 的层叠烟纱，融入 F 的双色分层与交织。'},
{id:'H',name:'层叠粒子风暴',shape:6,palette:1,desc:'密集粒子卷成多层浪脊，保留清晰光点、暗部间隙和翻卷边缘。'}];
let gl=canvas.getContext('webgl',{alpha:false,antialias:false,preserveDrawingBuffer:true});
let selected=0,mode='idle',playing=false,touring=false,paused=false,phaseTime=0,visualTime=0,lastFrame=0,energy=0,low=0,high=0,centroid=0,impulse=0,strength=1.4,turn=0,targetTurn=0;
let ac,analyser,stream,source,media,mediaUrl,scheduler=null,noteStep=0,session=0,pending=[],voices=new Set();
const bins=new Uint8Array(512),waveform=new Float32Array(1024);
function feedback(text){$('#status').textContent=text}
function compile(type,code){const shader=gl.createShader(type);gl.shaderSource(shader,code);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));return shader}
const vertex=`
precision highp float;
attribute vec4 aData;
uniform float uTime,uEnergy,uLow,uHigh,uPulse,uStrength,uShape,uPalette,uTurn,uScale,uAspect,uPixel,uOpacity;
varying vec3 vColor;varying float vAlpha;
float hash(vec3 p){p=fract(p*.3183099+vec3(.1,.2,.3));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1)),f.x),f.y),f.z);}
float fbm(vec3 p){return noise(p)*.58+noise(p*2.03+4.)*.28+noise(p*4.07)*.14;}
void main(){
 float u=aData.x,v=aData.y,L=aData.z,seed=aData.w,t=uTime*.24,pi=3.14159265;
 float a=u*2.*pi,layer=L*1.5707963,width=(u-.5),swell=uEnergy*uStrength;
 float n=fbm(vec3(u*4.,v*4.,t*.45+L*.4));
 vec3 p;float thin=1.;
 if(uShape<.5){
  float b=v*pi,r=.67+.21*sin(a*3.+b*4.+t)+.13*sin(b*7.-a*2.+t*.7)+(n-.5)*.4;
  r*=1.+swell*.30+uPulse*.10*sin(b*5.-t*2.);
  p=vec3(cos(a)*sin(b),cos(b),sin(a)*sin(b))*r;
  p.x+=.13*sin(b*5.+t+layer);p.z+=.04*(L-1.5);
 }else if(uShape<1.5){
  float path=v*7.5+t*.6+layer;
  float band=width*(.65+.2*sin(v*9.+layer+t));
  p=vec3(.62*sin(path)+band*cos(path*.65), (v-.5)*1.85+.2*sin(u*5.+v*6.+t+layer),.35*cos(path)+band*sin(path*.65));
  p.y+=.14*sin(u*10.+v*15.-t*.5)*sin(u*pi);p.x+=.12*sin(v*18.+u*5.+t);
 }else if(uShape<2.5){
  float path=v*7.-t*.45+L*.55;
  p=vec3((v-.5)*3.,.28*sin(path)+width*.48*cos(path*.7),.24*cos(path)+width*.6*sin(path*.7)+(L-1.5)*.05);
  p.y+=.11*sin(u*9.+v*13.+t);p.z+=.08*sin(u*12.-v*9.+t*.7);
 }else if(uShape<3.5){
  float path=a+v*9.-t*.7+layer, r=(.15+v*.42)*(1.+.35*sin(v*15.+a*3.+t));
  p=vec3(cos(path)*r+.24*sin(v*7.+t),(v-.5)*2.5+.12*sin(a*4.+v*12.+t),sin(path)*r);
 }else if(uShape<4.5){
  if(L<1.5){float r=sin(v*pi*.5)*.83; p=vec3(cos(a)*r,.44*cos(v*pi*.7)+.14*sin(a*5.+t)*v,sin(a)*r);p.y+=.07*sin(v*16.+a*3.+t);}
  else{float strand=floor(u*22.)/22.*2.*pi;float r=.42+.1*sin(v*8.+t+strand);p=vec3(cos(strand)*r+.1*sin(v*12.+strand+t),.1-v*1.55,sin(strand)*r+.1*cos(v*9.+strand-t));p.x+=(fract(u*22.)-.5)*.015;thin=.65;}
 }else if(uShape<5.5){
  float path=v*7.-t*.5+(L<2.?0.:pi),band=width*(.28+.14*sin(v*12.+t));
  p=vec3((v-.5)*2.8,.43*sin(path)+band*cos(path),.43*cos(path)+band*sin(path));p.y+=.09*sin(u*12.+v*16.+t);
 }else{
 float b=v*pi;
 float r=.60+.16*sin(a*3.+b*4.-t*.55+layer*.4)+.09*sin(b*9.+a*2.+t*.25)+(n-.5)*.14;
 float foldAngle=a+.25*sin(b*4.+t*.4+layer);
 vec3 lobe=vec3(cos(foldAngle)*sin(b),cos(b),sin(foldAngle)*sin(b))*r;
 float tilt=(L-1.5)*.3;
 p=vec3(lobe.x*1.28+(L-1.5)*.32,lobe.y*.88+sin(layer+t*.2)*.19,lobe.z+cos(layer)*.12);
 p.y+=.13*sin(p.x*3.+t*.35+layer);
 p.x+=.08*sin(b*7.-t*.2);
 thin=.65+.35*pow(sin(b),.5);
 }
 vec3 warp=vec3(fbm(p*2.+vec3(t*.2,0,0)),fbm(p*2.+vec3(0,t*.2,7)),fbm(p*2.+vec3(3,0,t*.2)))-.5;
 p+=warp*(.23+swell*.24);
 p+=sin(p.yzx*7.+t+layer)*(.025+uHigh*.025);
 float pulse=exp(-pow((v-fract(uTime*.23))*5.,2.))*uPulse*.18*uStrength;p+=normalize(p+vec3(.001))*pulse;
 p*=1.+swell*.12;
 if(seed>.955){p*=1.15+(seed-.955)*5.+uPulse*.14;thin*=.3;}
 float rot=uTurn*.6+.13*sin(uTime*.07),xx=p.x*cos(rot)-p.z*sin(rot),zz=p.x*sin(rot)+p.z*cos(rot);
 float perspective=3.8/(3.8-zz);vec2 xy=vec2(xx,p.y)*perspective*uScale;
 gl_Position=vec4(xy.x/uAspect,xy.y,clamp(-zz*.12,-.9,.9),1.);
 float fold=.5+.5*sin(u*15.+v*24.+n*8.+t*.3+layer);
 vec3 c1,c2;
 if(uPalette<.5){c1=vec3(.17,.69,1.);c2=vec3(.93,.24,.81);}
 else if(uPalette<1.5){c1=vec3(.19,.49,1.);c2=vec3(.65,.36,.95);}
 else if(uPalette<2.5){c1=vec3(1.,.62,.23);c2=vec3(.93,.91,.80);}
 else if(uPalette<3.5){c1=vec3(.13,.68,.62);c2=vec3(.76,.94,.92);}
 else{c1=vec3(.13,.73,.87);c2=vec3(1.,.38,.29);}
 float colorMix=uPalette>3.5?step(1.5,L):clamp(.5+.4*sin(v*4.+t*.23+layer*.6),0.,1.);
 vColor=mix(c1,c2,colorMix)*( .8+fold*.4);
 float density=.45+.55*smoothstep(.2,.9,fold);
 vAlpha=(.30+seed*.26)*density*thin*(.68+uEnergy*.32);
 if(uShape>5.5){vAlpha*=1.6;vColor*=1.12;}
 vAlpha*=uOpacity;
 if(seed>.989){vAlpha*=1.2;}
 gl_PointSize=clamp((1.6+seed*.9+uPulse*.18)*uPixel*perspective,1.,4.);
}`;
const fragment=`precision mediump float;varying vec3 vColor;varying float vAlpha;void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;float core=exp(-r*r*4.5);gl_FragColor=vec4(pow(vColor,vec3(1.1))*1.05,vAlpha*core);}`;
let program,count=0,locations={},ready=false,sceneBuffer,sceneAttribute,postProgram,frameTexture,frameBuffer,quadBuffer,targetWidth=1,targetHeight=1;
try{
 if(!gl)throw Error('浏览器未启用 WebGL');program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
 const mobile=innerWidth<750,U=mobile?210:360,V=mobile?130:180,data=new Float32Array(U*V*4*4);let index=0;
 let rng=17;const random=()=>{rng=(rng*1664525+1013904223)>>>0;return rng/4294967296};
 for(let layer=0;layer<4;layer++)for(let y=0;y<V;y++)for(let x=0;x<U;x++){data[index++]=(x+random()*.9)/U;data[index++]=(y+random()*.9)/V;data[index++]=layer;data[index++]=random()}
 count=data.length/4;const buffer=gl.createBuffer();sceneBuffer=buffer;gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);const attrib=gl.getAttribLocation(program,'aData');sceneAttribute=attrib;gl.enableVertexAttribArray(attrib);gl.vertexAttribPointer(attrib,4,gl.FLOAT,false,0,0);
 for(const name of ['Time','Energy','Low','High','Pulse','Strength','Shape','Palette','Turn','Scale','Aspect','Pixel','Opacity'])locations[name]=gl.getUniformLocation(program,'u'+name);
 gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);gl.disable(gl.DEPTH_TEST);initPost();ready=true;$('#quality').textContent=`${Math.round(count/1000)}k GPU 粒子`;
}catch(error){feedback('无法启动粒子引擎：'+error.message);$('#play').disabled=$('#tour').disabled=true;}
function initPost(){
 const v=compile(gl.VERTEX_SHADER,'attribute vec2 aPosition;varying vec2 vUv;void main(){vUv=aPosition*.5+.5;gl_Position=vec4(aPosition,0.,1.);}');
 const f=compile(gl.FRAGMENT_SHADER,`precision mediump float;uniform sampler2D uImage;uniform vec2 uTexel;varying vec2 vUv;void main(){vec3 base=texture2D(uImage,vUv).rgb;vec3 blur=vec3(0.);blur+=texture2D(uImage,vUv+uTexel*vec2(-4.,0.)).rgb*.12;blur+=texture2D(uImage,vUv+uTexel*vec2(4.,0.)).rgb*.12;blur+=texture2D(uImage,vUv+uTexel*vec2(0.,-4.)).rgb*.12;blur+=texture2D(uImage,vUv+uTexel*vec2(0.,4.)).rgb*.12;blur+=texture2D(uImage,vUv+uTexel*vec2(-7.,-7.)).rgb*.08;blur+=texture2D(uImage,vUv+uTexel*vec2(7.,-7.)).rgb*.08;blur+=texture2D(uImage,vUv+uTexel*vec2(-7.,7.)).rgb*.08;blur+=texture2D(uImage,vUv+uTexel*vec2(7.,7.)).rgb*.08;blur+=base*.2;vec3 color=base*.94+blur*.23;gl_FragColor=vec4(color,1.);}`);
 postProgram=gl.createProgram();gl.attachShader(postProgram,v);gl.attachShader(postProgram,f);gl.linkProgram(postProgram);if(!gl.getProgramParameter(postProgram,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(postProgram));
 quadBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,quadBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
 frameTexture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,frameTexture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
 frameBuffer=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,frameBuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,frameTexture,0);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('无法创建辉光缓冲');gl.bindFramebuffer(gl.FRAMEBUFFER,null);
}
function postprocess(){gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,canvas.width,canvas.height);gl.disable(gl.BLEND);gl.useProgram(postProgram);gl.bindBuffer(gl.ARRAY_BUFFER,quadBuffer);const a=gl.getAttribLocation(postProgram,'aPosition');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,frameTexture);gl.uniform1i(gl.getUniformLocation(postProgram,'uImage'),0);gl.uniform2f(gl.getUniformLocation(postProgram,'uTexel'),1/targetWidth,1/targetHeight);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);}
function resize(){if(!gl)return;let pixel=Math.min(devicePixelRatio||1,1.75);canvas.width=Math.round(innerWidth*pixel);canvas.height=Math.round(innerHeight*pixel);legacyCanvas.width=canvas.width;legacyCanvas.height=canvas.height;legacyCanvas.getContext('2d').setTransform(pixel,0,0,pixel,0,0);const ratio=1;targetWidth=Math.max(1,Math.round(canvas.width*ratio));targetHeight=Math.max(1,Math.round(canvas.height*ratio));gl.viewport(0,0,canvas.width,canvas.height);if(frameTexture){gl.bindTexture(gl.TEXTURE_2D,frameTexture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,targetWidth,targetHeight,0,gl.RGBA,gl.UNSIGNED_BYTE,null)}}resize();addEventListener('resize',resize);
function choose(index){selected=index;legacyWaves=[];const p=presets[index];legacyCanvas.hidden=p.id!=='S';canvas.hidden=p.id==='S';$('#quality').textContent=p.id==='S'?'星河保留版 · 原绘制器':`${Math.round(count/1000)}k GPU 粒子`;resize();$('#title').textContent=p.name;$('#description').textContent=p.desc;$('#number').textContent=`STUDY ${p.id} / ${presets.length}`;document.querySelectorAll('[data-preset]').forEach(b=>b.setAttribute('aria-pressed',Number(b.dataset.preset)===index));phaseTime=0;noteStep=0;$('#phase').textContent=playing?'轻拨 · 起音回应':'等待启幕';}
presets.forEach((preset,index)=>{const button=document.createElement('button');button.textContent=`${preset.id} ${preset.name}`;button.dataset.preset=index;button.setAttribute('aria-pressed',index===0);button.onclick=()=>{touring=false;$('#tour').textContent='全部巡演 · 约3分钟';cancelPending();choose(index);if(mode==='idle')start(false)};$('#presets').append(button)});
const initial=new URLSearchParams(location.search).get('style');choose(initial?Math.max(0,presets.findIndex(p=>p.id===initial)):presets.findIndex(p=>p.id==='H'));
function context(){return ac||(ac=new AudioContext())}
function setupAudio(){analyser=context().createAnalyser();analyser.fftSize=1024;analyser.smoothingTimeConstant=.72;}
function cancelPending(){pending.forEach(clearTimeout);pending=[];}
function endInput(){session++;clearInterval(scheduler);scheduler=null;cancelPending();voices.forEach(s=>{try{s.stop()}catch{}});voices.clear();stream?.getTracks().forEach(t=>t.stop());stream=null;source?.disconnect();source=null;analyser?.disconnect();analyser=null;if(media){media.pause();media.src='';media=null}if(mediaUrl){URL.revokeObjectURL(mediaUrl);mediaUrl=null}playing=false;paused=false;mode='idle';$('#pause').disabled=true;$('#pause').textContent='暂停';}
function pluck(freq,gain=.5){if(!analyser)return;const c=context(),n=Math.round(c.sampleRate*.9),period=Math.round(c.sampleRate/freq),b=c.createBuffer(1,n,c.sampleRate),d=b.getChannelData(0);for(let i=0;i<period;i++)d[i]=Math.random()*2-1;for(let i=period;i<n;i++)d[i]=.496*(d[i-period]+d[i-period+1]);const node=c.createBufferSource(),g=c.createGain();node.buffer=b;g.gain.value=gain;node.connect(g);g.connect(analyser);g.connect(c.destination);node.start();voices.add(node);node.onended=()=>{node.disconnect();g.disconnect();voices.delete(node)}}
function step(){if(!playing||paused||mode!=='demo')return;const melody=[293.66,440,587.33,659.25,587.33,440,392,329.63,293.66,392,440,587.33],f=melody[noteStep++%melody.length];if(phaseTime<13){pluck(f,phaseTime<4?.32:phaseTime<9?.5:.75);if(phaseTime>4){const token=session;for(let j=1;j<=(phaseTime>9?3:1);j++)pending.push(setTimeout(()=>{if(session===token&&playing&&!paused)pluck(f*(j===2?2:1),.35)},j*100));}}
}
async function start(all){endInput();const token=session;try{await context().resume();if(token!==session)return;setupAudio();playing=true;mode='demo';touring=all;if(all)choose(0);phaseTime=0;noteStep=0;scheduler=setInterval(step,480);step();$('#play').textContent='↻ 重播当前效果';$('#tour').textContent=all?'■ 停止巡演':'全部巡演 · 约3分钟';$('#pause').disabled=false;$('#source-label').textContent='合成拨弦演示';feedback('每幕16秒：轻拨 → 渐密 → 强奏 → 余韵。无需麦克风。')}catch(e){endInput();feedback('音频启动失败：'+e.message)}}
$('#play').onclick=()=>start(false);$('#tour').onclick=()=>{if(touring){endInput();touring=false;$('#tour').textContent='全部巡演 · 约3分钟';feedback('巡演已停止。')}else start(true)};
$('#pause').onclick=async()=>{if(!playing)return;if(!paused){paused=true;cancelPending();if(ac)await ac.suspend();media?.pause();}else{if(ac)await ac.resume();if(media)await media.play();paused=false}$('#pause').textContent=paused?'继续':'暂停'};
$('#mic').onclick=async()=>{endInput();const token=session;touring=false;feedback('正在请求麦克风…');try{if(!navigator.mediaDevices?.getUserMedia)throw Error('请使用 HTTPS 页面和支持麦克风的浏览器');await context().resume();const incoming=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});if(token!==session){incoming.getTracks().forEach(t=>t.stop());return}stream=incoming;setupAudio();source=ac.createMediaStreamSource(stream);source.connect(analyser);mode='mic';playing=true;$('#pause').disabled=false;$('#source-label').textContent='LIVE / 麦克风';feedback('麦克风已连接，音量、频谱与起音正在驱动粒子。')}catch(e){feedback(e.name==='NotAllowedError'?'未获得麦克风权限，可先使用演示。':e.message)}};
$('#upload').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;endInput();const token=session;touring=false;try{await context().resume();if(token!==session)return;setupAudio();mediaUrl=URL.createObjectURL(file);media=new Audio(mediaUrl);source=ac.createMediaElementSource(media);source.connect(analyser);analyser.connect(ac.destination);await media.play();if(token!==session)return;mode='file';playing=true;$('#pause').disabled=false;$('#source-label').textContent='AUDIO / 导入';feedback(file.name);media.onended=()=>{endInput();feedback('播放结束，可选择其他形态重播。')}}catch(e){endInput();feedback('此音频无法播放，请试 WAV 或 MP3。')}};
$('#burst').onclick=()=>impulse=Math.min(2,impulse+.9);$('#strength').oninput=e=>strength=Number(e.target.value);$('#magnitude').oninput=e=>magnitude=Number(e.target.value);
$('#immersive').onclick=()=>{const on=document.body.classList.toggle('immersive');$('#immersive').textContent=on?'退出沉浸':'沉浸观看'};
$('#full').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()}catch{feedback('当前窗口不支持全屏，请在浏览器打开。')}};
$('#save').onclick=()=>{render();const a=document.createElement('a');a.href=(presets[selected].id==='S'?legacyCanvas:canvas).toDataURL('image/png');a.download=`弦生-${presets[selected].id}-${Date.now()}.png`;a.click()};
legacyCanvas.onpointerdown=()=>impulse=Math.min(2,impulse+.9);legacyCanvas.onpointermove=e=>targetTurn=(e.clientX/innerWidth-.5)*.8;let pointer=false,lastX=0;canvas.onpointerdown=e=>{pointer=true;lastX=e.clientX;canvas.setPointerCapture(e.pointerId)};canvas.onpointermove=e=>{if(pointer){targetTurn+=(e.clientX-lastX)/innerWidth*3;lastX=e.clientX}};canvas.onpointerup=canvas.onpointercancel=()=>pointer=false;
let prevEnergy=0,lastOnset=-1;
function analyze(dt){let target=0,lo=0,hi=0,center=0;if(analyser&&playing&&!paused){analyser.getFloatTimeDomainData(waveform);analyser.getByteFrequencyData(bins);target=Math.min(1,Math.sqrt(waveform.reduce((s,x)=>s+x*x,0)/waveform.length)*5);for(let i=2;i<22;i++)lo+=bins[i]/255/20;let total=0;for(let i=10;i<250;i++){hi+=i>70?bins[i]/255/180:0;total+=bins[i];center+=bins[i]*i}center=total?center/total/250:0;if(target>Math.max(.04,prevEnergy*1.4)&&visualTime-lastOnset>.13){impulse=Math.min(1.7,impulse+target*.9);lastOnset=visualTime}prevEnergy+=(target-prevEnergy)*(1-Math.exp(-dt*14))}const blend=1-Math.exp(-dt*7);energy+=(target-energy)*blend;low+=(lo-low)*blend;high+=(hi-high)*blend;centroid+=(center-centroid)*(1-Math.exp(-dt*2));impulse*=Math.exp(-dt*3);}
function render(){if(presets[selected].id==='S'){if(impulse>lastLegacyImpulse+.08)legacyWaves.push({born:visualTime,strength:impulse});lastLegacyImpulse=impulse;legacyWaves=legacyWaves.filter(wave=>visualTime-wave.born<3.5);legacyRenderer.render({w:innerWidth,h:innerHeight,time:visualTime,rotation:turn,waves:legacyWaves,energy,bass:low,tension:strength,magnitude,dt:paused?0:.016});return}if(!ready)return;gl.bindFramebuffer(gl.FRAMEBUFFER,frameBuffer);gl.viewport(0,0,targetWidth,targetHeight);gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,sceneBuffer);gl.enableVertexAttribArray(sceneAttribute);gl.vertexAttribPointer(sceneAttribute,4,gl.FLOAT,false,0,0);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);gl.clearColor(.012,.019,.032,1);gl.clear(gl.COLOR_BUFFER_BIT);const uniforms={Time:visualTime,Energy:energy,Low:low,High:high,Pulse:impulse,Strength:strength,Opacity:1,Shape:presets[selected].shape,Palette:presets[selected].palette,Turn:turn,Scale:Math.min((innerWidth<750?.8:1)*([.54,.45,.54,.42,.43,.54,.48][presets[selected].shape]),innerWidth/innerHeight*([2,5].includes(presets[selected].shape)?.55:.85))*magnitude*(document.body.classList.contains('immersive')?1.08:1),Aspect:innerWidth/innerHeight,Pixel:Math.min(devicePixelRatio||1,1.75)};for(const key in uniforms)gl.uniform1f(locations[key],uniforms[key]);gl.drawArrays(gl.POINTS,0,count);postprocess()}
function frame(now){const elapsed=lastFrame?Math.min(.15,(now-lastFrame)/1000):.016;lastFrame=now;if(!paused){visualTime+=elapsed;analyze(elapsed);turn+=(targetTurn-turn)*(1-Math.exp(-elapsed*4));if(playing&&mode==='demo'){phaseTime+=elapsed;if(phaseTime>=16){cancelPending();if(touring&&selected===presets.length-1){endInput();touring=false;$('#tour').textContent='全部巡演 · 约3分钟';$('#phase').textContent='十幕结束 · 选择字母单独重看';feedback('十种效果已展示完成。')}else if(touring)choose(selected+1);else{phaseTime=0;noteStep=0}}if(playing){$('#phase').textContent=`${presets[selected].id} · ${phaseTime<4?'轻拨':phaseTime<9?'渐密':phaseTime<13?'强奏':'余韵'}`;$('#progress').style.width=`${phaseTime/16*100}%`}}}$('#level').textContent=String(Math.round(energy*99)).padStart(2,'0');$('#level-bar').style.width=`${energy*100}%`;render();requestAnimationFrame(frame)}
requestAnimationFrame(frame);document.addEventListener('visibilitychange',()=>{lastFrame=0});addEventListener('pagehide',()=>endInput());canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();ready=false;endInput();feedback('图形上下文已中断，请刷新页面。')});
