// 配置タスクが掃除する絶対パスを、Python の範囲検査へ渡す。
const path = require('node:path');
const localRequire = require('node:module').createRequire(path.join(process.cwd(), 'package.json'));
const build = localRequire('@minecraft/core-build-tasks');
const local = build.DEFAULT_CLEAN_DIRECTORIES.map(value => path.resolve(value));
const collateral = build.STANDARD_CLEAN_PATHS.map(value => path.resolve(value
  .replace('LOCALAPPDATA', process.env.LOCALAPPDATA)
  .replace('APPDATA', process.env.APPDATA)
  .replace('PROJECT_NAME', 'pve_v3')));
process.stdout.write(JSON.stringify({local, collateral}));
