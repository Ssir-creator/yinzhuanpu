'use strict';
class LegacyGalaxyRenderer {constructor(canvas){const ctx=canvas.getContext('2d');let galaxyDrive=0;
const starPalettes=['190,218,255','112,154,255','177,133,244','255,206,147','239,246,255'];
const glowSprites=starPalettes.map(rgb=>{const sprite=document.createElement('canvas');sprite.width=sprite.height=64;const c=sprite.getContext('2d'),g=c.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,`rgba(${rgb},.9)`);g.addColorStop(.12,`rgba(${rgb},.55)`);g.addColorStop(.4,`rgba(${rgb},.13)`);g.addColorStop(1,`rgba(${rgb},0)`);c.fillStyle=g;c.fillRect(0,0,64,64);return sprite});
const galaxyStars=Array.from({length:22000},(_,i)=>{const r=Math.pow(Math.random(),.7)*1.24,arm=i%4,jitter=(Math.random()+Math.random()-1)*(.11+r*.13);return{r,a:arm*Math.PI*.5+r*3.8+jitter,z:(Math.random()+Math.random()-1)*(.035+r*.095),lum:Math.random(),color:i%5,seed:Math.random(),px:null,py:null}});
const distantStars=Array.from({length:500},()=>({x:Math.random(),y:Math.random(),size:.3+Math.random(),phase:Math.random()*7}));
this.render=function(state){const {w,h,time,rotation,waves,energy,bass,tension,dt,magnitude=1.4}=state;
 const mobile=w<750,scale=Math.min(w*(mobile?.67:.46),h*(mobile?.47:.65))*magnitude/1.4,cx=w*(mobile?.5:.55),cy=h*(mobile?.49:.48);
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


}}
