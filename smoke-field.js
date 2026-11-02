'use strict';
/** Stateful particle advection. Position and velocity live in two floating-point MRT buffers. */
class SmokeFieldRenderer {
 constructor(canvas){
  this.canvas=canvas;this.gl=canvas.getContext('webgl2',{alpha:false,antialias:false,preserveDrawingBuffer:true});
  const gl=this.gl;if(!gl||!gl.getExtension('EXT_color_buffer_float'))throw Error('烟纱流场需要 WebGL 2 和浮点渲染支持，请在开启硬件加速的 Chrome / Edge 中打开。');
  this.size=innerWidth<750?224:384;this.count=this.size*this.size;this.front=0;this.elapsed=0;this.accumulator=0;this.level=.18;this.events=[];this.lastImpulse=0;this.steps=0;this.droppedTime=0;this.vao=gl.createVertexArray();gl.bindVertexArray(this.vao);
  const fullscreen=`#version 300 es
  precision highp float;out vec2 vUv;void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));vUv=p;gl_Position=vec4(p*2.-1.,0.,1.);}`;
  const update=`#version 300 es
  precision highp float;
  uniform sampler2D uPosition,uVelocity;uniform float uTime,uDt,uEnergy,uLow,uHigh,uActive;
  uniform vec4 uEvents[8];
  layout(location=0)out vec4 outPosition;layout(location=1)out vec4 outVelocity;
  float hash(float v){return fract(sin(v*127.1+311.7)*43758.5453123);}
  vec3 curl(vec3 p,float t,float k){p*=k;return -vec3(sin(p.x+t)*sin(p.y)+cos(p.z+t)*cos(p.x),sin(p.y+t)*sin(p.z)+cos(p.x+t)*cos(p.y),sin(p.z+t)*sin(p.x)+cos(p.y+t)*cos(p.z));}
  void main(){ivec2 cell=ivec2(gl_FragCoord.xy);vec4 state=texelFetch(uPosition,cell,0),motion=texelFetch(uVelocity,cell,0);float id=float(cell.y*textureSize(uPosition,0).x+cell.x),seed=hash(id+1.);vec3 p=state.xyz,velocity=motion.xyz;float age=state.w+uDt;
   float life=8.+hash(id+9.)*5.;
   if(age>life||length(p)>4.5){
    float lane=step(.5,hash(id+2.)),s=hash(id+floor(uTime*.12)*.001+3.);
    float b=hash(id+4.)*3.14159265,a=s*6.2831853,r=.68+.18*sin(a*3.+b*4.+lane+uTime*.06);
    p=vec3(cos(a)*sin(b)*r*1.3+(lane-.5)*.38,cos(b)*r*.85,sin(a)*sin(b)*r*.78);p.y+=.12*sin(a*2.+b*3.+lane);
    velocity=vec3(.06,0.,0.);age=0.;
   }
   float t=uTime*.085;
   vec3 field=curl(p+vec3(0.,0.,t),t,1.15)*.19+curl(p+vec3(3.,-1.,0.),t*.7,2.7)*.048;
   field+=vec3(.045,-p.z*.19,p.y*.19);
   field-=p*vec3(.035,.075,.065);
   float vigor=.06+uActive*(.42+uEnergy*.32+uLow*.14);
   vec3 target=field*vigor;
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
  uniform sampler2D uPosition,uVelocity;uniform float uAspect,uScale,uTurn,uPixel,uPalette,uPass,uLevel,uTimbre,uDensity;
  out vec3 vColor;out float vAlpha;out float vHalo;
  float hash(float v){return fract(sin(v*127.1+311.7)*43758.5453123);}
  void main(){ivec2 cell=ivec2(gl_VertexID%textureSize(uPosition,0).x,gl_VertexID/textureSize(uPosition,0).x);vec4 state=texelFetch(uPosition,cell,0),motion=texelFetch(uVelocity,cell,0);vec3 p=state.xyz;float seed=motion.w;
   float rot=uTurn*.55,x=p.x*cos(rot)-p.z*sin(rot),z=p.x*sin(rot)+p.z*cos(rot);
   float depth=4.5/(4.5-z);vec2 projected=vec2(x,p.y)*depth*uScale;
   gl_Position=vec4(projected.x/uAspect,projected.y+.04,clamp(-z*.1,-.9,.9),1.);
   float entrance=smoothstep(0.,.7,state.w),exitFade=1.-smoothstep(7.+hash(float(gl_VertexID)+9.)*5.,8.+hash(float(gl_VertexID)+9.)*5.,state.w);
   float distanceFade=clamp(.72+z*.22,.25,1.);float lifeAlpha=entrance*exitFade;
   vec3 blue=vec3(.12,.50,.98),violet=vec3(.67,.23,.95),gold=vec3(1.,.65,.26),white=vec3(.83,.90,.95),teal=vec3(.10,.72,.82),coral=vec3(.98,.35,.28);
   float gradient=clamp((p.x+1.5)/3.+(uTimbre-.2)*.3,0.,1.);
   if(uPalette<1.5)vColor=mix(blue,violet,gradient);
   else if(uPalette<3.5)vColor=mix(gold,white,gradient);
   else vColor=seed>.5?teal:coral;
   vColor*=distanceFade*(.85+seed*.25);
   float emphasis=smoothstep(.55,.97,seed)*.20;vColor=mix(vColor,white,emphasis);
   vHalo=uPass;
   if(uPass<.5){gl_PointSize=clamp((3.8+seed*1.4)*uPixel*depth,2.,14.);vAlpha=lifeAlpha*(.035+uLevel*.055)*distanceFade;}
   else{gl_PointSize=clamp((.9+seed*.8)*uPixel*depth,1.,3.4);vAlpha=lifeAlpha*(.24+uLevel*.38)*distanceFade;}
   vAlpha*=uDensity*(.10+.90*smoothstep(.05,.45,uLevel));
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
  this.simUniforms=this.uniforms(this.sim,['Position','Velocity','Time','Dt','Energy','Low','High','Active','Events[0]']);
  this.drawUniforms=this.uniforms(this.draw,['Position','Velocity','Aspect','Scale','Turn','Pixel','Palette','Pass','Level','Timbre','Density']);
  this.postUniforms=this.uniforms(this.composite,['Image','Texel']);
  this.banks=[this.bank(),this.bank()];this.scene={texture:gl.createTexture(),fbo:gl.createFramebuffer()};
  gl.bindTexture(gl.TEXTURE_2D,this.scene.texture);this.textureParameters(gl.LINEAR);gl.bindFramebuffer(gl.FRAMEBUFFER,this.scene.fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,this.scene.texture,0);
  this.reset();this.resize();
  this.ready=true;
 }
 program(vertex,fragment){const gl=this.gl,program=gl.createProgram();for(const [type,source]of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]){const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));gl.attachShader(program,shader)}gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));return program}
 uniforms(program,names){const out={};for(const name of names)out[name]=this.gl.getUniformLocation(program,'u'+name);return out}
 textureParameters(filter){const g=this.gl;g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,filter);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,filter);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.CLAMP_TO_EDGE);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,g.CLAMP_TO_EDGE)}
 bank(){const gl=this.gl,bank={textures:[],fbo:gl.createFramebuffer()};gl.bindFramebuffer(gl.FRAMEBUFFER,bank.fbo);for(let i=0;i<2;i++){const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);this.textureParameters(gl.NEAREST);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,this.size,this.size,0,gl.RGBA,gl.FLOAT,null);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0+i,gl.TEXTURE_2D,texture,0);bank.textures.push(texture)}gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('设备无法创建粒子位置与速度缓冲');return bank}
 reset(){const g=this.gl,pos=new Float32Array(this.count*4),vel=new Float32Array(this.count*4);let state=3701;const random=()=>{state=(state*1664525+1013904223)>>>0;return state/4294967296};for(let i=0;i<this.count;i++){const u=random(),v=random(),lane=i%4,a=u*Math.PI*2,b=v*Math.PI,r=.67+.17*Math.sin(a*3+b*4+lane*.7)+.07*Math.sin(b*9-a*2),offset=i*4;pos[offset]=Math.cos(a)*Math.sin(b)*r*1.3+(lane-1.5)*.12;pos[offset+1]=Math.cos(b)*r*.85+.12*Math.sin(a*2+b*3+lane);pos[offset+2]=Math.sin(a)*Math.sin(b)*r*.78;pos[offset+3]=.8+random()*6.;vel[offset+3]=random();}for(const bank of this.banks){for(let i=0;i<2;i++){g.bindTexture(g.TEXTURE_2D,bank.textures[i]);g.texSubImage2D(g.TEXTURE_2D,0,0,0,this.size,this.size,g.RGBA,g.FLOAT,i===0?pos:vel)}}this.front=0;this.events=[];this.elapsed=0;this.accumulator=0;this.steps=0;this.lastImpulse=0;this.level=.18;}

 resize(){const g=this.gl,pixel=Math.min(devicePixelRatio||1,1.5);this.canvas.width=Math.round(innerWidth*pixel);this.canvas.height=Math.round(innerHeight*pixel);g.bindTexture(g.TEXTURE_2D,this.scene.texture);g.texImage2D(g.TEXTURE_2D,0,g.RGBA16F,this.canvas.width,this.canvas.height,0,g.RGBA,g.HALF_FLOAT,null);g.bindFramebuffer(g.FRAMEBUFFER,this.scene.fbo);if(g.checkFramebufferStatus(g.FRAMEBUFFER)!==g.FRAMEBUFFER_COMPLETE)throw Error('无法创建全分辨率烟纱画面');}
 texture(unit,texture){const gl=this.gl;gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture)}
 advance(dt,audio){
  const gl=this.gl,read=this.banks[this.front],write=this.banks[1-this.front],u=this.simUniforms;
  this.elapsed+=dt;
  gl.bindVertexArray(this.vao);gl.bindFramebuffer(gl.FRAMEBUFFER,write.fbo);gl.viewport(0,0,this.size,this.size);gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);gl.disable(gl.BLEND);gl.useProgram(this.sim);
  this.texture(0,read.textures[0]);this.texture(1,read.textures[1]);gl.uniform1i(u.Position,0);gl.uniform1i(u.Velocity,1);gl.uniform1f(u.Time,this.elapsed);gl.uniform1f(u.Dt,dt);gl.uniform1f(u.Energy,audio.energy);gl.uniform1f(u.Low,audio.low);gl.uniform1f(u.High,audio.high);gl.uniform1f(u.Active,audio.active?1:0);
  const values=new Float32Array(32);for(let i=0;i<8;i++){const event=this.events[i];values[i*4+2]=-100;if(event)values.set(event,i*4)}gl.uniform4fv(u['Events[0]'],values);gl.drawArrays(gl.TRIANGLES,0,3);this.front=1-this.front;this.steps++;
 }
 update(dt,audio){
  if(audio.impulse>this.lastImpulse+.07){const x=-.9+Math.min(1,audio.centroid*2.5)*1.6;this.events.push([x,Math.sin(this.elapsed*.8)*.18,this.elapsed,Math.min(1.5,audio.impulse)*audio.strength]);this.events=this.events.slice(-8)}this.lastImpulse=audio.impulse;
  this.events=this.events.filter(event=>this.elapsed-event[2]<3.);
  this.level+=((audio.active?.08+audio.energy*.9:.015)-this.level)*(1-Math.exp(-dt*2.2));
  this.accumulator+=Math.min(.1,dt);let steps=0;while(this.accumulator>=1/60&&steps<4){this.advance(1/60,audio);this.accumulator-=1/60;steps++}if(this.accumulator>.1){this.droppedTime+=this.accumulator;this.accumulator=0}
 }
 render({turn=0,magnitude=1.4,palette=1,centroid=0}={}){
  const gl=this.gl,u=this.drawUniforms;gl.bindVertexArray(this.vao);gl.bindFramebuffer(gl.FRAMEBUFFER,this.scene.fbo);gl.drawBuffers([gl.COLOR_ATTACHMENT0]);gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT);gl.disable(gl.DEPTH_TEST);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.useProgram(this.draw);this.texture(0,this.banks[this.front].textures[0]);this.texture(1,this.banks[this.front].textures[1]);gl.uniform1i(u.Position,0);gl.uniform1i(u.Velocity,1);gl.uniform1f(u.Aspect,innerWidth/innerHeight);
  const scale=Math.min(.65,innerWidth/innerHeight*.55)*(magnitude/1.4);gl.uniform1f(u.Scale,scale);gl.uniform1f(u.Density,Math.max(.9,Math.min(3.2,Math.pow(innerHeight*scale,2)/this.count*1.15)));gl.uniform1f(u.Turn,turn);gl.uniform1f(u.Pixel,Math.min(devicePixelRatio||1,1.5));gl.uniform1f(u.Palette,palette);gl.uniform1f(u.Level,this.level);gl.uniform1f(u.Timbre,centroid);
  gl.uniform1f(u.Pass,0);gl.drawArrays(gl.POINTS,0,this.count);
  gl.blendFunc(gl.SRC_ALPHA,gl.ONE);gl.uniform1f(u.Pass,1);gl.drawArrays(gl.POINTS,0,this.count);
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.disable(gl.BLEND);gl.useProgram(this.composite);this.texture(0,this.scene.texture);gl.uniform1i(this.postUniforms.Image,0);gl.uniform2f(this.postUniforms.Texel,1/this.canvas.width,1/this.canvas.height);gl.drawArrays(gl.TRIANGLES,0,3);
 }
 snapshot(){const gl=this.gl,position=new Float32Array(4),velocity=new Float32Array(4);gl.bindFramebuffer(gl.FRAMEBUFFER,this.banks[this.front].fbo);gl.readBuffer(gl.COLOR_ATTACHMENT0);gl.readPixels(11,17,1,1,gl.RGBA,gl.FLOAT,position);gl.readBuffer(gl.COLOR_ATTACHMENT1);gl.readPixels(11,17,1,1,gl.RGBA,gl.FLOAT,velocity);gl.readBuffer(gl.COLOR_ATTACHMENT0);return{position:Array.from(position),velocity:Array.from(velocity),steps:this.steps,time:this.elapsed}}
}
