import { enableClone } from "./features/clone/index.js";

/**
 * exp — 実験用アドオン。
 *
 * 仕様: docs/spec/05-exp-clone.md
 *
 * しばらくは試作をここに集める。機能ごとに features/<機能名>/ で分ける。
 * 物になったら独立したアドオンに切り出す。
 *
 * 前提:
 *   - BDS で動かすこと（@minecraft/server-net は BDS 専用）
 *   - ワールドで「Beta APIs」を有効にすること
 *   - config/<スクリプトモジュールUUID>/permissions.json で
 *     server-gametest と server-net を許可すること
 *
 * ここは配線だけ。ロジックは features 以下に置く（docs/imp.md 2章）。
 */
enableClone();
