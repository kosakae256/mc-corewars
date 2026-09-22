/**
 * 空中の文字（`@minecraft/debug-utilities` の `DebugText`。beta モジュール）。
 * ランキング板（17-modes 7 章）と出題キューの板（同 3 章）に使う。core-wars のロビーの掲示板と同じ仕組み。
 *
 * - **向きは固定**（カメラに追従させない。掛かっている板にする）。yaw は 0 が −z（research 11 の 6 章）
 * - **同じ字なら触らない**（毎秒作り直すと点滅する）。字だけ変わったら `setText`
 * - `/reload` ではメモリごと消えるので、次の `set` で作り直す
 */

import { world, type Entity, type Vector3 } from "@minecraft/server";
import { DebugText, debugDrawer } from "@minecraft/debug-utilities";

export class FloatingText {
  private shape: DebugText | undefined;
  private text = "";

  constructor(
    private readonly at: Vector3,
    private readonly yaw: number,
    private readonly renderDistance: number
  ) {}

  /** 出す（同じ字なら何もしない） */
  set(text: string): void {
    if (this.shape && this.text === text) return;
    this.text = text;
    if (this.shape) {
      try {
        this.shape.setText(text);
        return;
      } catch {
        this.shape = undefined; // 消えていた。作り直す
      }
    }
    try {
      const shape = new DebugText(this.at, text);
      shape.useRotation = true;
      shape.rotation = { x: 0, y: this.yaw, z: 0 };
      shape.depthTest = false; // 壁越しに描く
      shape.color = { red: 1, green: 1, blue: 1, alpha: 1 };
      shape.maximumRenderDistance = this.renderDistance;
      debugDrawer.addShape(shape, world.getDimension("overworld"));
      this.shape = shape;
    } catch {
      /* モジュールが読み込まれていない。次の機会に */
    }
  }

  clear(): void {
    if (!this.shape) return;
    try {
      debugDrawer.removeShape(this.shape);
    } catch {
      /* 既に消えている */
    }
    this.shape = undefined;
    this.text = "";
  }
}

/**
 * 頭上に字を貼り付ける（発表中の正解者の「✔ 正解」。11-flow 5 章。駒金さんの案）。
 * `attachedTo` でその人について回り、`timeLeft`（秒）で勝手に消える。カメラを向く（回転は固定しない）
 */
export function attachText(entity: Entity, text: string, seconds: number, up = 2.4): void {
  try {
    const shape = new DebugText({ x: 0, y: up, z: 0 }, text);
    shape.attachedTo = entity;
    shape.depthTest = false;
    shape.color = { red: 1, green: 1, blue: 1, alpha: 1 };
    shape.timeLeft = seconds;
    debugDrawer.addShape(shape, entity.dimension);
  } catch {
    /* 出せなかった（モジュールが無い・抜けた） */
  }
}
