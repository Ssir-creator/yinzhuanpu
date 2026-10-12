'use strict';
window.showScreen = function(name, updateHash = true) {
  if (!['practice','compare','history'].includes(name)) name='practice';
  document.querySelectorAll('.app-screen').forEach(section=>section.hidden=section.id!==`screen-${name}`);
  document.querySelectorAll('[data-screen]').forEach(button=>{
    if(button.dataset.screen===name)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
  });
  if(updateHash) history.replaceState(null,'',`#${name}`);
  if(name==='compare') { sides.forEach(render); renderRollReview(); }
  window.scrollTo(0,0);
};
document.querySelectorAll('[data-screen],[data-go]').forEach(button=>button.addEventListener('click',()=>showScreen(button.dataset.screen||button.dataset.go)));
window.addEventListener('hashchange',()=>showScreen(location.hash.slice(1),false));
showScreen(location.hash.slice(1),false);
let installPrompt=null, waitingWorker=null;
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;$('#install-app').textContent='安装 App';});
$('#install-app').addEventListener('click',async()=>{
  if(installPrompt){const prompt=installPrompt;installPrompt=null;await prompt.prompt();await prompt.userChoice;return;}
  $('#install-help-text').textContent=/iPhone|iPad|iPod/.test(navigator.userAgent)
    ? '在 Safari 中打开本站，点“分享”，选择“添加到主屏幕”。不要使用聊天软件的内置浏览器。'
    : '在 Chrome / Edge 的浏览器菜单中选择“安装应用”或“添加到主屏幕”。若没有该选项，请联网打开本站并刷新；桌面浏览器也可安装。';
  $('#install-help').showModal();
});
$('#close-install').addEventListener('click',()=>$('#install-help').close());
$('#apply-update').addEventListener('click',()=>{
  if(recordingPending||busy){$('#app-update span').textContent='请先完成录音和处理，再更新';return;}
  waitingWorker?.postMessage({type:'ACTIVATE_UPDATE'});
});
if('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  let refreshing=false, updateRequested=false;
  $('#apply-update').addEventListener('click',()=>{if(!busy&&!recordingPending)updateRequested=true;});
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(updateRequested&&!refreshing){refreshing=true;location.reload();}});
  navigator.serviceWorker.register('./sw.js').then(registration=>{
    const offer=()=>{waitingWorker=registration.waiting;if(waitingWorker)$('#app-update').hidden=false;};
    offer();registration.addEventListener('updatefound',()=>{
      const worker=registration.installing;
      worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)offer();});
    });
  }).catch(()=>{ $('#install-app').textContent='添加到手机'; });
}
