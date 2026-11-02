'use strict';
// Front-to-back volume integration: density and absorption, rather than thin point sheets.
class CloudVolumeRenderer {
 constructor(gl){
  this.gl=gl;
  const vertex='attribute vec2 aPosition;varying vec2 vUv;void main(){vUv=aPosition*.5+.5;gl_Position=vec4(aPosition,0.,1.);}';
  const fragment=`precision highp float;
  varying vec2 vUv;
  uniform float uTime,uEnergy,uLow,uPulse,uStrength,uAspect,uMagnitude,uTurn;
  float hash(vec3 p){p=fract(p*.3183099+vec3(.17,.23,.31));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
  float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1)),f.x),f.y),f.z);}
  float fbm(vec3 p){return noise(p)*.58+noise(p*2.07)*.28+noise(p*4.13)*.14;}
  float density(vec3 p){
   float t=uTime*.065;p/=1.+uLow*.07+uPulse*.035;
   p.y+=.11*sin(p.x*1.8+t)+.07*sin(p.z*2.-t);
   float rot=uTurn*.17; p.xz=mat2(cos(rot),-sin(rot),sin(rot),cos(rot))*p.xz;
   vec3 q=p/vec3(2.05,.88,1.0);
   float envelope=1.-length(q);
   if(envelope<-.4)return 0.;
   vec3 curl=vec3(sin(p.y*2.+t),cos(p.z*2.-t*.7),sin(p.x*1.8+t*.4))*.22;
   float broad=fbm(p*1.65+curl+vec3(-t*.36,t*.13,t*.15));
   float folds=noise(p*8.2+curl*2.+vec3(t*.15,0.,-t*.12));
   float edge=envelope+(broad-.48)*1.15+(folds-.5)*.25;
   return smoothstep(-.05,.30,edge)*(.38+broad*.9)*(1.+uEnergy*.3+uLow*.2)*uStrength;
  }
  void main(){
   vec2 uv=(vUv-.5)*2.;uv.x*=uAspect;
   float zoom=1.+(uMagnitude-1.)*.3+uEnergy*.07;
   vec3 ro=vec3(0.,.27,4.3),rd=normalize(vec3(uv/(zoom*1.25),-2.3));
   vec3 background=vec3(.009,.014,.027),sum=vec3(0.);float opacity=0.;
   float jitter=hash(vec3(floor(vUv*vec2(700.,450.)),1.));
   float distance=2.45+jitter*.085;
   for(int i=0;i<48;i++){
    vec3 p=ro+rd*distance;
    float d=density(p);
    if(d>.008){
     float overhead=density(p+vec3(-.12,.23,.10));
     float light=clamp(.30+(d-overhead)*1.5,.04,.94);
     float depth=exp(-d*1.25);
     vec3 shadow=vec3(.025,.025,.09),middle=vec3(.10,.24,.40),highlight=vec3(.52,.72,.83);
     vec3 color=mix(shadow,middle,light);color=mix(color,highlight,pow(light,3.)*.75);
     float vein=noise(p*2.6+vec3(0.,uTime*.035,2.));
     color=mix(color,vec3(.38,.24,.12),smoothstep(.62,.91,vein)*.4);
     color*=(.5+depth*.55)*exp(-overhead*.5);
     float alpha=1.-exp(-d*.22);
     sum+=(1.-opacity)*color*alpha;opacity+=(1.-opacity)*alpha;
     if(opacity>.985)break;
    }
    distance+=.08;
   }
   vec3 color=sum*1.35+background*(1.-opacity);
   color=pow(color,vec3(.9));
   float vignette=1.-.16*dot(vUv-.5,vUv-.5);color*=vignette;
   gl_FragColor=vec4(color,1.);
  }`;
  const compile=(type,code)=>{const s=gl.createShader(type);gl.shaderSource(s,code);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s};
  this.program=gl.createProgram();gl.attachShader(this.program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(this.program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(this.program);if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.program));
  this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
  this.attribute=gl.getAttribLocation(this.program,'aPosition');this.uniforms={};for(const name of ['Time','Energy','Low','Pulse','Strength','Aspect','Magnitude','Turn'])this.uniforms[name]=gl.getUniformLocation(this.program,'u'+name);
 }
 render(values){const gl=this.gl;gl.useProgram(this.program);gl.disable(gl.BLEND);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.enableVertexAttribArray(this.attribute);gl.vertexAttribPointer(this.attribute,2,gl.FLOAT,false,0,0);for(const name in values)gl.uniform1f(this.uniforms[name],values[name]);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);}
}
