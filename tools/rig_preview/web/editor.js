import {clone, scalar, at, placeKey, labels} from './timeline.js';

const $=id=>document.getElementById(id), token=document.querySelector('meta[name=rig-token]').content;
const BODY='animation.pve3.gun.hold', ITEM='animation.pve3.gun_item.shotgun';
let project, revisions, bones, saved='', history=[], future=[], bone='rightArm', channel='rotation';
let time=0, playing=false, timer, previewTimer, previewSequence=0, previewURL, rendering=false;
let camera={yaw:-40,pitch:15,span:38};
const current=()=>project.animations[project.selected];
const target=()=>project.targets[project.selected];
const duration=()=>Number(current().animation_length||1);
const dirty=()=>JSON.stringify(project)!==saved;
const setStatus=(message,error=false)=>{ $('status').textContent=message; $('status').classList.toggle('error',error); };
function mark(){ $('dirty').textContent=dirty()?'未保存の変更あり':'保存済み'; $('undo').disabled=!history.length; $('redo').disabled=!future.length; }
function remember(){ history.push(clone(project)); if(history.length>100)history.shift();future=[];pause(); }
function allowed(){ return bones[target()]; }
function track(){ const values=current().bones||{}; const name=Object.keys(values).find(n=>n.toLowerCase()===bone.toLowerCase()); return name?values[name]:{}; }
function editableBone(){ current().bones??={}; const name=Object.keys(current().bones).find(n=>n.toLowerCase()===bone.toLowerCase())||bone; return current().bones[name]??={}; }
function sample(){ return at(track()[channel],time,channel==='scale'?1:0); }
function selectedClip(){ const option=$('clips').selectedOptions[0]; return option?.value; }

async function request(path,data){
  const response=await fetch(path,data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-Rig-Token':token},body:JSON.stringify(data)});
  if(!response.ok){const value=await response.json();throw new Error(value.error||'処理に失敗しました。');}
  return response;
}
function showError(error){setStatus(error.message,true);$('render-status').textContent=error.message;}

async function load(){
  pause();const value=await (await request('/api/state')).json();revisions=value.revisions;bones=value.bones;
  project={format:'steve-motion-project-1',animations:value.clips,targets:{[BODY]:'body',[ITEM]:'item'},selected:BODY,body:BODY,item:ITEM,showItem:true};
  saved=JSON.stringify(project);history=[];future=[];time=0;bone='rightArm';refresh();setStatus('パックから読み込みました。キーを置いて編集できます。');
}
function refresh(){
  if(!allowed().some(b=>b.name===bone))bone=allowed()[0].name;
  $('clips').replaceChildren(...Object.keys(project.animations).map(name=>{const option=new Option(`${project.targets[name]==='body'?'体':'銃'} · ${name}`,name);option.selected=name===project.selected;return option;}));
  $('target').value=target();$('target-label').textContent=target()==='body'?'スティーブのすべての骨':'右手に接続する銃の骨';
  $('bones').replaceChildren(...allowed().map(value=>{
    const button=document.createElement('button');button.className=value.name===bone?'active':'';
    button.style.paddingLeft=value.parent?'19px':'10px';
    const title=document.createElement('span');title.textContent=labels[value.name]||value.name;
    const small=document.createElement('small');small.textContent=value.name;button.append(title,small);
    button.onclick=()=>{bone=value.name;refresh();};return button;
  }));
  $('bone-title').textContent=labels[bone]||bone;$('bone-id').textContent=bone;
  $('duration').value=duration();$('loop').value=String(current().loop??false);$('show-item').checked=project.showItem;
  $('scrub').max=duration();$('time').max=duration();time=Math.min(time,duration());
  renderAxes();renderTimeline();mark();schedulePreview();
}
function renderAxes(){
  const values=sample(), limits={rotation:[-180,180,1],position:[-16,16,.1],scale:[0,4,.01]}[channel];
  $('axes').replaceChildren(...['X','Y','Z'].map((axis,index)=>{
    const container=document.createElement('div');container.className='axis';
    const row=document.createElement('div');row.className='row';const label=document.createElement('strong');label.textContent=axis;
    const number=document.createElement('input');number.type='number';number.step=limits[2];number.value=scalar(values[index]).toFixed(2);number.setAttribute('aria-label',`${axis}の${channel}`);
    const slider=document.createElement('input');slider.type='range';slider.min=limits[0];slider.max=limits[1];slider.step=limits[2];slider.value=scalar(values[index]);slider.setAttribute('aria-label',`${axis}のスライダー`);
    function edit(value){if(!Number.isFinite(value))return;remember();const vector=sample();vector[index]=typeof vector[index]==='string'?`${value} - this`:value;placeKey(editableBone(),channel,time,vector,$('interpolation').value);number.value=value;slider.value=value;renderTimeline();mark();schedulePreview();}
    slider.oninput=()=>edit(Number(slider.value));number.onchange=()=>edit(Number(number.value));row.append(label,number);container.append(row,slider);return container;
  }));
  $('channel-hint').textContent={rotation:'角度は度数。銃は右手の動きに追従します。',position:'1単位は模型の1ピクセル。初期位置から移動します。',scale:'1が元の大きさ。子の骨にも影響します。'}[channel];
}
function renderTimeline(){
  $('time').value=time.toFixed(3);$('scrub').value=time;
  const keys=new Set();for(const value of Object.values(track()))if(value&&typeof value==='object'&&!Array.isArray(value))Object.keys(value).forEach(k=>keys.add(Number(k)));
  $('key-count').textContent=`${keys.size}個`;
  $('markers').replaceChildren(...[...keys].sort((a,b)=>a-b).map(t=>{const b=document.createElement('button');b.textContent='◆';b.title=`${t}秒`;b.style.left=`${Math.min(100,t/duration()*100)}%`;b.classList.toggle('current',Math.abs(t-time)<.001);b.onclick=()=>seek(t);return b;}));
  $('ticks').replaceChildren(...Array.from({length:11},(_,i)=>{const label=document.createElement('span');label.textContent=`${(duration()*i/10).toFixed(2)}s`;return label;}));
}
function seek(value){pause();time=Math.max(0,Math.min(duration(),Number(value)));renderAxes();renderTimeline();schedulePreview();}
function pause(){playing=false;clearInterval(timer);$('play').textContent='▶ 再生';}
function schedulePreview(){clearTimeout(previewTimer);previewTimer=setTimeout(drawPreview,120);}
async function drawPreview(){
  if(rendering){schedulePreview();return;}rendering=true;
  const sequence=++previewSequence;
  $('render-status').textContent=playing?'再生中…':'描画中…';
  try{
    const response=await request('/api/preview',{body:project.animations[project.body]||{bones:{}},item:project.animations[project.item]||{bones:{}},time,camera,show_item:project.showItem});
    const blob=await response.blob();if(sequence!==previewSequence)return;
    const previous=previewURL;previewURL=URL.createObjectURL(blob);$('preview').src=previewURL;if(previous)URL.revokeObjectURL(previous);
    $('render-status').textContent='';$('camera-label').textContent=`方向 ${Math.round(camera.yaw)}° / 高さ ${Math.round(camera.pitch)}°`;
  }catch(error){pause();showError(error);}finally{rendering=false;}
}
function download(name,data){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)+'\n'],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
function exportProject(){download('steve-motion.rig.json',project);saved=JSON.stringify(project);mark();setStatus('編集用プロジェクトを書き出しました。');}
function newName(initial='animation.custom.motion'){const name=prompt('アニメーション名（animation. から始まる名前）',initial);if(name===null)return null;if(!/^animation\.[a-zA-Z0-9_.]+$/.test(name)){setStatus('animation. から始まる英数字・ピリオド・下線の名前にしてください。',true);return null;}if(project.animations[name]){setStatus('同じ名前がすでにあります。',true);return null;}return name;}

$('clips').onchange=()=>{pause();project.selected=selectedClip();project[target()]=project.selected;time=0;refresh();};
document.querySelectorAll('[data-channel]').forEach(button=>button.onclick=()=>{channel=button.dataset.channel;document.querySelectorAll('[data-channel]').forEach(b=>b.classList.toggle('active',b===button));renderAxes();});
$('add-key').onclick=()=>{remember();placeKey(editableBone(),channel,time,sample(),$('interpolation').value);refresh();};
$('delete-key').onclick=()=>{const value=track()[channel];if(!value||Array.isArray(value)||typeof value!=='object')return;const key=Object.keys(value).find(k=>Math.abs(Number(k)-time)<.001);if(key===undefined)return;remember();delete value[key];if(!Object.keys(value).length)delete editableBone()[channel];refresh();};
$('scrub').oninput=()=>seek($('scrub').value);$('time').onchange=()=>seek($('time').value);$('start').onclick=()=>seek(0);
$('play').onclick=()=>{if(playing){pause();return;}playing=true;$('play').textContent='❚❚ 一時停止';if(time>=duration())time=0;let previous=performance.now();timer=setInterval(()=>{const now=performance.now();time+=(now-previous)/1000*Number($('speed').value);previous=now;if(time>duration()){if(current().loop===true)time%=duration();else{time=duration();pause();}}renderTimeline();if(!rendering)drawPreview();},80);};
$('duration').onchange=()=>{const v=Number($('duration').value);if(!Number.isFinite(v)||v<=0||v>300){refresh();return;}remember();current().animation_length=v;refresh();};
$('loop').onchange=()=>{remember();current().loop=$('loop').value==='true'?true:$('loop').value==='false'?false:'hold_on_last_frame';mark();};
$('interpolation').onchange=()=>{remember();placeKey(editableBone(),channel,time,sample(),$('interpolation').value);refresh();};
$('target').onchange=()=>{remember();project.targets[project.selected]=$('target').value;project[$('target').value]=project.selected;bone=allowed()[0].name;refresh();};
$('show-item').onchange=()=>{remember();project.showItem=$('show-item').checked;mark();schedulePreview();};
$('new').onclick=()=>{const name=newName();if(!name)return;remember();project.animations[name]={loop:true,animation_length:1,bones:{}};project.targets[name]='body';project.selected=name;project.body=name;project.showItem=false;time=0;refresh();};
$('duplicate').onclick=()=>{const name=newName(project.selected+'.copy');if(!name)return;const original=clone(current()),layer=target();remember();project.animations[name]=original;project.targets[name]=layer;project.selected=name;project[layer]=name;refresh();};
$('rename').onclick=()=>{const name=newName(project.selected);if(!name)return;remember();const old=project.selected;project.animations[name]=project.animations[old];project.targets[name]=project.targets[old];delete project.animations[old];delete project.targets[old];for(const key of ['selected','body','item'])if(project[key]===old)project[key]=name;refresh();};
$('delete-clip').onclick=()=>{if(Object.keys(project.animations).length===1)return;remember();const old=project.selected;delete project.animations[old];delete project.targets[old];for(const layer of ['body','item'])if(project[layer]===old)project[layer]=Object.keys(project.animations).find(n=>project.targets[n]===layer)||null;project.selected=Object.keys(project.animations)[0];time=0;refresh();};
$('undo').onclick=()=>{if(!history.length)return;pause();future.push(clone(project));project=history.pop();refresh();};
$('redo').onclick=()=>{if(!future.length)return;pause();history.push(clone(project));project=future.pop();refresh();};
$('project').onclick=exportProject;
$('export').onclick=()=>{download('steve.animation.json',{format_version:'1.8.0',animations:project.animations});setStatus('BedrockアニメーションJSONを書き出しました。');};
$('reload').onclick=()=>{if(!dirty()||confirm('未保存の編集を破棄して、パックから読み直しますか？'))load().catch(showError);};
$('import').onclick=()=>$('file').click();
$('file').onchange=async()=>{try{const file=$('file').files[0];if(!file)return;const data=JSON.parse(await file.text());if(dirty()&&!confirm('未保存の編集を置き換えますか？'))return;if(!data.animations||!Object.keys(data.animations).length)throw new Error('animations が含まれるJSONを選んでください。');remember();if(data.format==='steve-motion-project-1')project=data;else{const names=Object.keys(data.animations),targets=Object.fromEntries(names.map(n=>[n,n.includes('gun_item')?'item':'body']));project={format:'steve-motion-project-1',animations:data.animations,targets,selected:names[0],body:names.find(n=>targets[n]==='body'),item:names.find(n=>targets[n]==='item'),showItem:names.some(n=>targets[n]==='item')};}time=0;refresh();setStatus(`${file.name} を読み込みました。`);}catch(error){showError(error);}finally{$('file').value='';}};
async function save(deploy=false){
  pause();$('save').disabled=true;$('deploy').disabled=true;
  try{const clips={[BODY]:project.animations[project.body]||{loop:true,bones:{}},[ITEM]:project.animations[project.item]||{loop:true,bones:{}}};const value=await (await request(deploy?'/api/deploy':'/api/save',{clips,revisions})).json();revisions=value.revisions;if(Object.keys(project.animations).length===2&&project.body===BODY&&project.item===ITEM)saved=JSON.stringify(project);mark();setStatus('散弾のパックへ保存しました。元のファイルはバックアップ済みです。');if(deploy)pollDeployment();else{$('save').disabled=false;$('deploy').disabled=false;}}
  catch(error){showError(error);$('save').disabled=false;$('deploy').disabled=false;}
}
async function pollDeployment(){try{const value=await(await request('/api/deployment')).json();setStatus(value.message,value.ok===false);if(value.running)setTimeout(pollDeployment,1000);else{$('save').disabled=false;$('deploy').disabled=false;}}catch(error){showError(error);$('save').disabled=false;$('deploy').disabled=false;}}
$('save').onclick=()=>save(false);$('deploy').onclick=()=>save(true);
document.querySelectorAll('[data-yaw]').forEach(button=>button.onclick=()=>{camera.yaw=Number(button.dataset.yaw);camera.pitch=Number(button.dataset.pitch);schedulePreview();});
let drag;
$('stage').onpointerdown=event=>{drag={x:event.clientX,y:event.clientY,yaw:camera.yaw,pitch:camera.pitch};$('stage').setPointerCapture(event.pointerId);};
$('stage').onpointermove=event=>{if(!drag)return;camera.yaw=((drag.yaw+(event.clientX-drag.x)*.4+540)%360)-180;camera.pitch=Math.max(-89,Math.min(89,drag.pitch+(event.clientY-drag.y)*.3));schedulePreview();};
$('stage').onpointerup=()=>drag=null;$('stage').onpointercancel=()=>drag=null;
$('stage').addEventListener('wheel',event=>{event.preventDefault();camera.span=Math.max(18,Math.min(60,camera.span+Math.sign(event.deltaY)*2));schedulePreview();},{passive:false});
window.addEventListener('beforeunload',event=>{if(project&&dirty()){event.preventDefault();event.returnValue='';}});
window.addEventListener('keydown',event=>{if(event.target.matches('input,select,textarea'))return;if(event.code==='Space'){event.preventDefault();$('play').click();}if(event.ctrlKey&&event.key.toLowerCase()==='z'){event.preventDefault();$(event.shiftKey?'redo':'undo').click();}});
load().catch(showError);
