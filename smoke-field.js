'use strict';
/** Stateful particle advection. Position and velocity live in two floating-point MRT buffers. */
class SmokeFieldRenderer {
 constructor(canvas){
  this.canvas=canvas;this.gl=canvas.getContext('webgl2',{alpha:false,antialias:false,preserveDrawingBuffer:true});
  const gl=this.gl;if(!gl||!gl.getExtension('EXT_color_buffer_float'))throw Error('烟纱流场需要 WebGL 2 和浮点渲染支持，请在开启硬件加速的 Chrome / Edge 中打开。');
  this.size=innerWidth<750?256:448;this.count=this.size*this.size;this.front=0;this.elapsed=0;this.accumulator=0;this.level=.18;this.events=[];this.lastImpulse=0;this.steps=0;this.droppedTime=0;this.vao=gl.createVertexArray();gl.bindVertexArray(this.vao);
  const fullscreen=`#version 300 es
  precision highp float;out vec2 vUv;void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));vUv=p;gl_Position=vec4(p*2.-1.,0.,1.);}`;
  const update=`#version 300 es
  precision highp float;
  uniform sampler2D uPosition,uVelocity,uSeed;uniform float uTime,uDt,uEnergy,uLow,uMid,uHigh,uActive;
  uniform vec4 uEvents[8];
  layout(location=0)out vec4 outPosition;layout(location=1)out vec4 outVelocity;
  float hash(float v){return fract(sin(v*127.1+311.7)*43758.5453123);}
  vec3 membrane(float id,float time,float energy,float low,float mid,float enabled,vec4 birth){
   float seed=birth.w,angle=birth.x*6.2831853,r=sqrt(birth.y),layer=birth.z;
   float t=time*.70;
   float contour=.64+.22*sin(angle*3.+sin(angle*2.-t*.7)*1.4+t*.65)+.18*cos(angle*2.-t*.5)+.07*sin(angle*7.+t*.3);
   vec3 p=vec3(cos(angle)*r*contour,sin(angle)*r*contour,0.);
   p.x+=.36*sin(p.y*5.+t*.8+layer*.8)*r;
   p.y+=.28*sin(p.x*4.7-t*.7+layer*1.2)*r;
   p.z=.40*sin(angle*2.+r*4.+t*.45)+(layer-1.)*.13+.08*cos(angle*5.-r*5.+t);
   p.xy+=vec2(sin(angle*7.+t),cos(angle*6.-t))*.025*r*(.3+mid);
   if(seed<.12)p*=.32;
   if(seed>.94)p*=1.1+hash(id+12.)*.45;
   float swell=.28+enabled*(.25+min(.85,energy*.9+low*.5));
   return p*swell;
  }
  vec3 curl(vec3 p,float t,float k){p*=k;return -vec3(sin(p.x+t)*sin(p.y)+cos(p.z+t)*cos(p.x),sin(p.y+t)*sin(p.z)+cos(p.x+t)*cos(p.y),sin(p.z+t)*sin(p.x)+cos(p.y+t)*cos(p.z));}
  void main(){ivec2 cell=ivec2(gl_FragCoord.xy);vec4 state=texelFetch(uPosition,cell,0),motion=texelFetch(uVelocity,cell,0);float id=float(cell.y*textureSize(uPosition,0).x+cell.x),seed=hash(id+1.);vec3 p=state.xyz,velocity=motion.xyz;float age=state.w+uDt;
   float life=8.+hash(id+9.)*5.;
   vec4 birth=texelFetch(uSeed,cell,0);vec3 rest=membrane(id,uTime,uEnergy,uLow,uMid,uActive,birth);
   if(age>life||length(p)>4.5){p=rest;velocity=vec3(0.);age=0.;}
   float t=uTime*.085;
   vec3 field=(curl(p+vec3(0.,0.,t),t,1.15)-curl(vec3(0.,0.,t),t,1.15))*.15;
   field+=(curl(p+vec3(3.,-1.,0.),t*.7,2.7)-curl(vec3(3.,-1.,0.),t*.7,2.7))*(.022+uMid*.075);
   if(motion.w>.975)field+=normalize(p+vec3(.001))*(.018+uHigh*.12);
   field+=vec3(0.,-p.z*.16,p.y*.16);
   field-=p*vec3(.035,.075,.065);
   float vigor=.06+uActive*(.42+uEnergy*.32+uLow*.14);
   if(motion.w<.12)field*=.42;
   vec3 target=field*vigor*.55+(rest-p)*1.8;
   velocity+=(target-velocity)*(1.-exp(-uDt*2.2));
   for(int i=0;i<8;i++){
    vec4 event=uEvents[i];float elapsed=uTime-event.z;
    if(event.w>.001&&elapsed>=0.&&elapsed<3.){
     vec3 delta=p-vec3(event.xy,0.);float distance=length(delta),front=distance-elapsed*.85;
     float wave=exp(-front*front*24.)*exp(-elapsed*1.2)*event.w;
     velocity+=normalize(delta+vec3(.001))*wave*uDt*.9;
     velocity+=vec3(-delta.y,delta.x,.12)*wave*uDt*.18;
    }
   }
   float speed=length(velocity);if(speed>1.25)velocity*=1.25/speed;
   p+=velocity*uDt;
   outPosition=vec4(p,age);outVelocity=vec4(velocity,motion.w);
  }`;
  const points=`#version 300 es
  precision highp float;
  uniform sampler2D uPosition,uVelocity;uniform float uAspect,uScale,uTurn,uPixel,uPalette,uPass,uLevel,uTimbre,uDensity,uColorTime,uHigh,uBreath;
  out vec3 vColor;out float vAlpha;out float vHalo;
  vec3 spectrum(float phase){float h=fract(phase)*5.;vec3 a,b;if(h<1.){a=vec3(.015,.68,.76);b=vec3(.015,.28,1.);}else if(h<2.){a=vec3(.015,.28,1.);b=vec3(.40,.025,.96);}else if(h<3.){a=vec3(.40,.025,.96);b=vec3(.94,.025,.52);}else if(h<4.){a=vec3(.94,.025,.52);b=vec3(.025,.64,.20);}else{a=vec3(.025,.64,.20);b=vec3(.015,.68,.76);}return mix(a,b,smoothstep(0.,1.,fract(h)));}
  float hash(float v){return fract(sin(v*127.1+311.7)*43758.5453123);}
  void main(){ivec2 cell=ivec2(gl_VertexID%textureSize(uPosition,0).x,gl_VertexID/textureSize(uPosition,0).x);vec4 state=texelFetch(uPosition,cell,0),motion=texelFetch(uVelocity,cell,0);vec3 p=state.xyz;float seed=motion.w;
   float rot=uTurn*.55+sin(uColorTime*.045)*.15,x=p.x*cos(rot)-p.z*sin(rot),z=p.x*sin(rot)+p.z*cos(rot);
   float depth=4.5/(4.5-z);vec2 projected=vec2(x,p.y)*depth*uScale*uBreath;
   gl_Position=vec4(projected.x/uAspect,projected.y,clamp(-z*.1,-.9,.9),1.);
   float entrance=smoothstep(0.,.7,state.w),exitFade=1.-smoothstep(7.+hash(float(gl_VertexID)+9.)*5.,8.+hash(float(gl_VertexID)+9.)*5.,state.w);
   float distanceFade=clamp(.72+z*.22,.25,1.);float lifeAlpha=entrance*exitFade;
   vec3 blue=vec3(.12,.50,.98),violet=vec3(.67,.23,.95),gold=vec3(1.,.65,.26),white=vec3(.83,.90,.95),teal=vec3(.10,.72,.82),coral=vec3(.98,.35,.28);
   float gradient=clamp((p.x+1.5)/3.+(uTimbre-.2)*.3,0.,1.);
   if(uPalette<1.5)vColor=spectrum(.43+.16*sin(uColorTime*.28)+.08*cos(uColorTime*.14)+(p.x+p.y*.6+p.z*.3)*.17+uTimbre*.12);
   else if(uPalette<3.5)vColor=mix(gold,white,gradient);
   else vColor=seed>.5?teal:coral;
   vColor*=distanceFade*(.85+seed*.25);
   float emphasis=smoothstep(.82,.995,seed)*.08;vColor=mix(vColor,white,emphasis);
   vHalo=uPass;
   if(uPass<.5){gl_PointSize=clamp((3.8+seed*1.4)*uPixel*depth,2.,14.);vAlpha=lifeAlpha*(.035+uLevel*.055)*distanceFade;}
   else{gl_PointSize=clamp((.72+seed*.65)*uPixel*depth,1.,2.6);vAlpha=lifeAlpha*(.24+uLevel*.38)*distanceFade;}
   float center=exp(-dot(p,p)*2.);float edge=1.-smoothstep(1.05,1.85,length(p));
   vAlpha*=uDensity*(.18+.82*smoothstep(.03,.4,uLevel))*(.55+center*.7)*edge;
   if(seed>.94){if(uPass<.5)vAlpha=0.;gl_PointSize=max(1.,gl_PointSize*.7);vColor=mix(vColor,white,.35);vAlpha*=.18;vAlpha*=.8+.2*sin(uColorTime*.9+seed*200.)*uHigh;}
  }`;
  const pointFragment=`#version 300 es
  precision highp float;in vec3 vColor;in float vAlpha;in float vHalo;out vec4 color;
  void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;float softness=exp(-r*r*(vHalo<.5?3.:4.));color=vec4(vColor,vAlpha*softness);}`;
  const composite=`#version 300 es
  precision highp float;uniform sampler2D uImage;uniform vec2 uTexel;in vec2 vUv;out vec4 color;
  void main(){vec3 base=texture(uImage,vUv).rgb;
   vec3 glow=(texture(uImage,vUv+uTexel*vec2(3.,0.)).rgb+texture(uImage,vUv-uTexel*vec2(3.,0.)).rgb+texture(uImage,vUv+uTexel*vec2(0.,3.)).rgb+texture(uImage,vUv-uTexel*vec2(0.,3.)).rgb)*.25;
   vec3 light=max(base,vec3(0.))+max(glow-vec3(.025),vec3(0.))*.12;
   light=vec3(1.)-exp(-light*1.25);
   light=pow(light,vec3(.454545));
   float vignette=1.-smoothstep(.35,.9,length(vUv-.5))*.28;
   color=vec4(light*vignette,1.);
  }`;
  this.sim=this.program(fullscreen,update);this.draw=this.program(points,pointFragment);this.composite=this.program(fullscreen,composite);
  this.simUniforms=this.uniforms(this.sim,['Position','Velocity','Seed','Time','Dt','Energy','Low','Mid','High','Active','Events[0]']);
  this.drawUniforms=this.uniforms(this.draw,['Position','Velocity','Aspect','Scale','Turn','Pixel','Palette','Pass','Level','Timbre','Density','ColorTime','High','Breath']);
  this.postUniforms=this.uniforms(this.composite,['Image','Texel']);
  this.banks=[this.bank(),this.bank()];this.scene={texture:gl.createTexture(),fbo:gl.createFramebuffer()};
  gl.bindTexture(gl.TEXTURE_2D,this.scene.texture);this.textureParameters(gl.LINEAR);gl.bindFramebuffer(gl.FRAMEBUFFER,this.scene.fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,this.scene.texture,0);
  this.initFeatures();this.reset();this.resize();
  this.ready=true;
 }
 program(vertex,fragment){const gl=this.gl,program=gl.createProgram();for(const [type,source]of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]){const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));gl.attachShader(program,shader)}gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));return program}
 uniforms(program,names){const out={};for(const name of names)out[name]=this.gl.getUniformLocation(program,'u'+name);return out}
 textureParameters(filter){const g=this.gl;g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,filter);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,filter);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.CLAMP_TO_EDGE);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,g.CLAMP_TO_EDGE)}
 bank(){const gl=this.gl,bank={textures:[],fbo:gl.createFramebuffer()};gl.bindFramebuffer(gl.FRAMEBUFFER,bank.fbo);for(let i=0;i<2;i++){const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);this.textureParameters(gl.NEAREST);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,this.size,this.size,0,gl.RGBA,gl.FLOAT,null);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0+i,gl.TEXTURE_2D,texture,0);bank.textures.push(texture)}gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('设备无法创建粒子位置与速度缓冲');return bank}
 reset(){const g=this.gl,pos=new Float32Array(this.count*4),vel=new Float32Array(this.count*4),seeds=new Float32Array(this.count*4);let state=3701;const random=()=>{state=(state*1664525+1013904223)>>>0;return state/4294967296};for(let i=0;i<this.count;i++){const seed=Math.fround(random()),u=Math.fround(random()),v=Math.fround(random()),layer=Math.floor(random()*3),a=u*Math.PI*2,r=Math.sqrt(v),contour=.64+.22*Math.sin(a*3+Math.sin(a*2)*1.4)+.18*Math.cos(a*2)+.07*Math.sin(a*7),offset=i*4;seeds.set([u,v,layer,seed],offset);let x=Math.cos(a)*r*contour,y=Math.sin(a)*r*contour;x+=.36*Math.sin(y*5+layer*.8)*r;y+=.28*Math.sin(x*4.7+layer*1.2)*r;let z=.40*Math.sin(a*2+r*4)+(layer-1)*.13+.08*Math.cos(a*5-r*5);const scale=seed<.12?.32:seed>.94?1.1+random()*.45:1;pos[offset]=x*scale*.72;pos[offset+1]=y*scale*.72;pos[offset+2]=z*scale*.72;pos[offset+3]=.8+random()*6.;vel[offset+3]=seed;}if(!this.seedTexture)this.seedTexture=g.createTexture();g.bindTexture(g.TEXTURE_2D,this.seedTexture);this.textureParameters(g.NEAREST);g.texImage2D(g.TEXTURE_2D,0,g.RGBA32F,this.size,this.size,0,g.RGBA,g.FLOAT,seeds);for(const bank of this.banks){for(let i=0;i<2;i++){g.bindTexture(g.TEXTURE_2D,bank.textures[i]);g.texSubImage2D(g.TEXTURE_2D,0,0,0,this.size,this.size,g.RGBA,g.FLOAT,i===0?pos:vel)}}this.front=0;this.events=[];this.elapsed=0;this.accumulator=0;this.steps=0;this.lastImpulse=0;this.level=.18;this.breath=1.;this.bandLow=this.bandMid=this.bandHigh=0;}

 resize(){const g=this.gl,pixel=Math.min(devicePixelRatio||1,1.5);this.canvas.width=Math.round(innerWidth*pixel);this.canvas.height=Math.round(innerHeight*pixel);g.bindTexture(g.TEXTURE_2D,this.scene.texture);g.texImage2D(g.TEXTURE_2D,0,g.RGBA16F,this.canvas.width,this.canvas.height,0,g.RGBA,g.HALF_FLOAT,null);g.bindFramebuffer(g.FRAMEBUFFER,this.scene.fbo);if(g.checkFramebufferStatus(g.FRAMEBUFFER)!==g.FRAMEBUFFER_COMPLETE)throw Error('无法创建全分辨率烟纱画面');}
 texture(unit,texture){const gl=this.gl;gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture)}
 advance(dt,audio){
  const gl=this.gl,read=this.banks[this.front],write=this.banks[1-this.front],u=this.simUniforms;
  this.elapsed+=dt;
  gl.bindVertexArray(this.vao);gl.bindFramebuffer(gl.FRAMEBUFFER,write.fbo);gl.viewport(0,0,this.size,this.size);gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);gl.disable(gl.BLEND);gl.useProgram(this.sim);
  this.texture(0,read.textures[0]);this.texture(1,read.textures[1]);gl.uniform1i(u.Position,0);gl.uniform1i(u.Velocity,1);this.texture(2,this.seedTexture);gl.uniform1i(u.Seed,2);gl.uniform1f(u.Time,this.elapsed);gl.uniform1f(u.Dt,dt);gl.uniform1f(u.Energy,audio.energy);gl.uniform1f(u.Low,audio.low);gl.uniform1f(u.Mid,audio.mid||0);gl.uniform1f(u.High,audio.high);gl.uniform1f(u.Active,audio.active?1:0);
  const values=new Float32Array(32);for(let i=0;i<8;i++){const event=this.events[i];values[i*4+2]=-100;if(event)values.set(event,i*4)}gl.uniform4fv(u['Events[0]'],values);gl.drawArrays(gl.TRIANGLES,0,3);this.front=1-this.front;this.steps++;
 }
 update(dt,audio){
  this.bandLow=audio.low||0;this.bandMid=audio.mid||0;this.bandHigh=audio.high||0;this.breath+=(1.+this.bandLow*.20+audio.energy*.08-this.breath)*(1.-Math.exp(-dt*2.));
  if(audio.impulse>this.lastImpulse+.07){const x=-.9+Math.min(1,audio.centroid*2.5)*1.6;this.events.push([x,Math.sin(this.elapsed*.8)*.18,this.elapsed,Math.min(1.5,audio.impulse)*audio.strength]);this.events=this.events.slice(-8)}this.lastImpulse=audio.impulse;
  this.events=this.events.filter(event=>this.elapsed-event[2]<3.);
  const targetLevel=audio.active?.08+audio.energy*.9:.015;this.level+=(targetLevel-this.level)*(1-Math.exp(-dt*(targetLevel>this.level?5.:2.2)));
  this.accumulator+=Math.min(.1,dt);let steps=0;while(this.accumulator>=1/60&&steps<4){this.advance(1/60,audio);this.accumulator-=1/60;steps++}if(this.accumulator>.1){this.droppedTime+=this.accumulator;this.accumulator=0}
 }
 render({turn=0,magnitude=1.4,palette=1,centroid=0}={}){
  const gl=this.gl,u=this.drawUniforms;gl.bindVertexArray(this.vao);gl.bindFramebuffer(gl.FRAMEBUFFER,this.scene.fbo);gl.drawBuffers([gl.COLOR_ATTACHMENT0]);gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT);gl.disable(gl.DEPTH_TEST);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.useProgram(this.draw);this.texture(0,this.banks[this.front].textures[0]);this.texture(1,this.banks[this.front].textures[1]);gl.uniform1i(u.Position,0);gl.uniform1i(u.Velocity,1);gl.uniform1f(u.Aspect,innerWidth/innerHeight);
  const scale=Math.min(.60,innerWidth/innerHeight*.46)*(magnitude/1.4);gl.uniform1f(u.Scale,scale);gl.uniform1f(u.Density,Math.max(.9,Math.min(3.2,Math.pow(innerHeight*scale,2)/this.count*1.15)));gl.uniform1f(u.Turn,turn);gl.uniform1f(u.Pixel,Math.min(devicePixelRatio||1,1.5));gl.uniform1f(u.Palette,palette);gl.uniform1f(u.Level,this.level);gl.uniform1f(u.Timbre,centroid);gl.uniform1f(u.ColorTime,this.elapsed);gl.uniform1f(u.High,this.bandHigh||0);gl.uniform1f(u.Breath,this.breath);
  gl.uniform1f(u.Pass,0);gl.drawArrays(gl.POINTS,0,this.count);
  gl.blendFunc(gl.SRC_ALPHA,gl.ONE);gl.uniform1f(u.Pass,1);gl.drawArrays(gl.POINTS,0,this.count);
  this.renderFeatures(scale);gl.bindVertexArray(this.vao);
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.disable(gl.BLEND);gl.useProgram(this.composite);this.texture(0,this.scene.texture);gl.uniform1i(this.postUniforms.Image,0);gl.uniform2f(this.postUniforms.Texel,1/this.canvas.width,1/this.canvas.height);gl.drawArrays(gl.TRIANGLES,0,3);
 }
 initFeatures(){
  const gl=this.gl;
  const vertex=`#version 300 es
  precision highp float;in vec4 aFeature;uniform float uAspect,uScale,uTime,uPixel,uLow;uniform vec2 uViewport;out vec4 vColor;out float vKind;
  void main(){vec3 p=aFeature.xyz;float kind=aFeature.w;vKind=kind;
   if(kind>2.5&&kind<3.5){float id=p.z;p.z=0.;float ax=.55+id*.8+sin(uTime*.06)*.12,az=id*1.05+uTime*.11,ay=.35+uTime*.08;p.yz=mat2(cos(ax),-sin(ax),sin(ax),cos(ax))*p.yz;p.xz=mat2(cos(ay),-sin(ay),sin(ay),cos(ay))*p.xz;p.xy=mat2(cos(az),-sin(az),sin(az),cos(az))*p.xy;}
   float depth=4.5/(4.5-p.z);vec2 xy=p.xy*depth*uScale;gl_Position=vec4(xy.x/uAspect,xy.y,0.,1.);if(kind<2.5||kind>3.5){vec2 pixel=(gl_Position.xy*.5+.5)*uViewport;pixel=floor(pixel)+.5;gl_Position.xy=(pixel/uViewport*2.-1.);}
   if(kind<.5){float near=exp(-p.y*p.y*4.);gl_PointSize=(2.+near*.9)*uPixel;vColor=vec4(.80,.90,.96,.4+near*.4);}
   else if(kind<1.5){gl_PointSize=(1.35+fract(p.x*117.)*.9)*uPixel;vColor=vec4(.75,.84,.94,.13+.25*fract(p.y*59.));}
   else if(kind<2.5){gl_PointSize=(18.+uLow*8.)*uPixel;vColor=vec4(.24,.72,.88,.13+uLow*.12);}
   else if(kind<3.5){gl_PointSize=1.;vColor=vec4(.74,.89,.94,.22);}
   else{gl_PointSize=(3.+uLow*1.5)*uPixel;vColor=vec4(.8,.94,1.,.65);}
  }`;
  const fragment=`#version 300 es
  precision highp float;in vec4 vColor;in float vKind;out vec4 color;void main(){float alpha=vColor.a;if(vKind<2.5||vKind>3.5){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;alpha*=exp(-r*r*(vKind>1.5&&vKind<2.5?4.:2.));}color=vec4(vColor.rgb,alpha);}`;
  this.featureProgram=this.program(vertex,fragment);this.featureUniforms=this.uniforms(this.featureProgram,['Aspect','Scale','Time','Pixel','Low','Viewport']);
  const values=[];for(let i=0;i<49;i++)values.push(0,(i-24)*.03,0,0);
  let seed=991;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
  for(let i=0;i<38;i++){const angle=random()*Math.PI*2,r=.92+random()*.85;values.push(Math.cos(angle)*r,Math.sin(angle)*r*.85,(random()-.5)*.4,1);}
  values.push(0,0,0,2,0,0,0,4);this.featurePointCount=values.length/4;
  for(let orbit=0;orbit<3;orbit++)for(let i=0;i<=180;i++){const a=i/180*Math.PI*2;values.push(Math.cos(a)*.11,Math.sin(a)*.11,orbit,3);}
  this.featureVao=gl.createVertexArray();gl.bindVertexArray(this.featureVao);this.featureBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.featureBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(values),gl.STATIC_DRAW);const a=gl.getAttribLocation(this.featureProgram,'aFeature');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,4,gl.FLOAT,false,0,0);gl.bindVertexArray(this.vao);
 }
 renderFeatures(scale){const gl=this.gl,u=this.featureUniforms;gl.useProgram(this.featureProgram);gl.bindVertexArray(this.featureVao);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);gl.uniform1f(u.Aspect,innerWidth/innerHeight);gl.uniform1f(u.Scale,scale);gl.uniform1f(u.Time,this.elapsed);gl.uniform1f(u.Pixel,Math.min(devicePixelRatio||1,1.5));gl.uniform1f(u.Low,this.bandLow||0);gl.uniform2f(u.Viewport,this.canvas.width,this.canvas.height);gl.drawArrays(gl.POINTS,0,this.featurePointCount);for(let orbit=0;orbit<3;orbit++)gl.drawArrays(gl.LINE_STRIP,this.featurePointCount+orbit*181,181);}
 snapshot(){const gl=this.gl,position=new Float32Array(4),velocity=new Float32Array(4);gl.bindFramebuffer(gl.FRAMEBUFFER,this.banks[this.front].fbo);gl.readBuffer(gl.COLOR_ATTACHMENT0);gl.readPixels(11,17,1,1,gl.RGBA,gl.FLOAT,position);gl.readBuffer(gl.COLOR_ATTACHMENT1);gl.readPixels(11,17,1,1,gl.RGBA,gl.FLOAT,velocity);gl.readBuffer(gl.COLOR_ATTACHMENT0);return{position:Array.from(position),velocity:Array.from(velocity),steps:this.steps,time:this.elapsed}}
}
