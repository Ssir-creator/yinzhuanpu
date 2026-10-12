'use strict';
window.showScreen=function(name){
  if(!['transcribe','library','about'].includes(name))name='transcribe';
  document.querySelectorAll('.screen').forEach(x=>x.hidden=x.id!==`screen-${name}`);
  document.querySelectorAll('[data-screen]').forEach(b=>b.toggleAttribute('aria-current',b.dataset.screen===name));
  history.replaceState(null,'',`#${name}`);scrollTo(0,0);
};
document.querySelectorAll('[data-screen]').forEach(b=>b.onclick=()=>showScreen(b.dataset.screen));
showScreen(location.hash.slice(1));
let installPrompt=null,waitingWorker=null;
addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e});
$('#install-app').onclick=async()=>{
  if(installPrompt){await installPrompt.prompt();installPrompt=null;return;}
  $('#install-help-text').textContent=/iPhone|iPad/.test(navigator.userAgent)
    ?'请用 Safari 打开，点“分享”→“添加到主屏幕”。'
    :'请在 Chrome / Edge 菜单中选择“安装应用”或“添加到主屏幕”。';
  $('#install-help').showModal();
};
$('#close-install').onclick=()=>$('#install-help').close();
$('#apply-update').onclick=()=>waitingWorker?.postMessage({type:'ACTIVATE_UPDATE'});
if('serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').then(reg=>{
  const offer=()=>{waitingWorker=reg.waiting;if(waitingWorker)$('#app-update').hidden=false};
  offer();reg.onupdatefound=()=>{const worker=reg.installing;if(worker)worker.onstatechange=()=>worker.state==='installed'&&navigator.serviceWorker.controller&&offer()};
  navigator.serviceWorker.oncontrollerchange=()=>location.reload();
}).catch(()=>{});
