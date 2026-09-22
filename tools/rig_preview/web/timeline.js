// Python と同じチャンネルの値を編集欄に表示する。模型の描画計算はPythonだけが行う。
export const clone = value => structuredClone(value);
export const scalar = value => typeof value === 'number' ? value : Number(String(value).split(' - this')[0]);
export function vec(value) { return Array.isArray(value) ? (value.length === 1 ? [value[0],value[0],value[0]] : [...value]) : [value,value,value]; }
export function endpoint(value, side='post') { return vec(value && !Array.isArray(value) && typeof value==='object' ? (value[side] ?? value.post ?? value.pre) : value); }
function blend(values, weights) { return values[0].map((_,axis) => {const value=values.reduce((sum,v,i)=>sum+scalar(v[axis])*weights[i],0);return typeof values[0][axis]==='string' ? `${value} - this` : value;}); }
export function at(channel, time, fallback=0) {
  if(channel===undefined) return [fallback,fallback,fallback];
  if(typeof channel!=='object'||Array.isArray(channel)) return vec(channel);
  const keys=Object.keys(channel).map(Number).sort((a,b)=>a-b);
  const get=t=>channel[Object.keys(channel).find(k=>Number(k)===t)];
  if(!keys.length) return [fallback,fallback,fallback];
  if(time<keys[0]) return endpoint(get(keys[0]),'pre');
  if(time>=keys.at(-1)) return endpoint(get(keys.at(-1)));
  const i=keys.findIndex((t,j)=>t<=time&&keys[j+1]>time), a=get(keys[i]), b=get(keys[i+1]);
  if(time===keys[i]) return endpoint(a);
  const u=(time-keys[i])/(keys[i+1]-keys[i]);
  if(a.lerp_mode==='catmullrom') return blend([endpoint(get(keys[Math.max(0,i-1)])),endpoint(a),endpoint(b,'pre'),endpoint(get(keys[Math.min(keys.length-1,i+2)]),'pre')],[(-u+2*u*u-u**3)/2,(2-5*u*u+3*u**3)/2,(u+4*u*u-3*u**3)/2,(-u*u+u**3)/2]);
  return blend([endpoint(a),endpoint(b,'pre')],[1-u,u]);
}
export function placeKey(bone, channel, time, value, mode) {
  const original=bone[channel];
  if(original===undefined) bone[channel]=time>0?{'0.0':channel==='scale'?[1,1,1]:[0,0,0]}:{};
  else if(typeof original!=='object'||Array.isArray(original)) bone[channel]={'0.0':vec(original)};
  const track=bone[channel], key=String(Number(time.toFixed(3)));
  const existing=Object.keys(track).find(k=>Number(k)===Number(key));
  if(existing!==undefined) delete track[existing];
  track[key]=mode==='catmullrom'?{post:value,lerp_mode:'catmullrom'}:value;
  if(mode==='step') {
    const prior=Object.keys(track).map(Number).filter(t=>t<time).sort((a,b)=>b-a)[0];
    const priorKey=Object.keys(track).find(k=>Number(k)===prior);
    track[key]={pre:priorKey===undefined?value:endpoint(track[priorKey]),post:value};
  }
}
export const labels={root:'全体',waist:'腰',body:'胴',head:'頭',hat:'帽子・髪の外側',cape:'マント',rightArm:'右腕',leftArm:'左腕',rightItem:'右手の持ち物',leftItem:'左手の持ち物',rightLeg:'右脚',leftLeg:'左脚',rightSleeve:'右袖',leftSleeve:'左袖',rightPants:'右脚の外側',leftPants:'左脚の外側',jacket:'上着',gun:'銃・縦の角度',gun_yaw:'銃・横の角度',gun_pixels:'銃の模型'};
