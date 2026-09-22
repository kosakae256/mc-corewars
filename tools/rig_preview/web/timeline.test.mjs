import test from 'node:test';
import assert from 'node:assert/strict';
import {at, placeKey} from './timeline.js';

test('後のキーを編集しても、先のキーを書き換えない', () => {
  const bone={rotation:{'0':[-30,0,0]}};
  const edited=at(bone.rotation,1);edited[0]=30;
  placeKey(bone,'rotation',1,edited,'linear');
  assert.deepEqual(bone.rotation['0'],[-30,0,0]);
  assert.deepEqual(at(bone.rotation,.5),[0,0,0]);
});
test('途中から動かし始める場合は0秒の初期値を残す', () => {
  const bone={};placeKey(bone,'scale',.5,[2,2,2],'linear');
  assert.deepEqual(at(bone.scale,0),[1,1,1]);
  assert.deepEqual(at(bone.scale,.25),[1.5,1.5,1.5]);
});
test('切り替えの補間をBedrockのpre/postとして保存する', () => {
  const bone={rotation:[0,0,0]};placeKey(bone,'rotation',1,[90,0,0],'step');
  assert.deepEqual(at(bone.rotation,.9),[0,0,0]);
  assert.deepEqual(at(bone.rotation,1),[90,0,0]);
});
