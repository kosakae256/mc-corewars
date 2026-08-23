/**
 * ローカル制御サーバー。
 *
 * ## 2つの役割
 *
 * 1. **CLI からボットを操作できるようにする。**
 *    ボットが0体になるとチャットを読む者がいなくなり、ゲーム内から
 *    `!summon` しても届かない。復帰手段が無くなるのを防ぐ。
 *
 * 2. **マネージャのプロセスを生かし続ける。**
 *    全ボットを切ると Node の待機対象が無くなり、イベントループが空になって
 *    プロセスが自然終了してしまう（実測: `!dismiss all` でマネージャごと停止）。
 *    listen 中のサーバーがあれば終了しない。
 *
 * **`127.0.0.1` にのみ bind する。** 外部に晒さない。
 */
import { createServer, type Server } from "node:http";

import type { BotManager } from "./BotManager.js";

export type ControlResult = { ok: boolean; message: string };

export class ControlServer {
  private server: Server | null = null;

  constructor(
    private readonly manager: BotManager,
    private readonly port: number
  ) {}

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = createServer((req, res) => {
        void this.handle(req.url ?? "/", res);
      });
      server.on("error", reject);
      // 127.0.0.1 限定。0.0.0.0 にすると LAN から操作されうる
      server.listen(this.port, "127.0.0.1", () => {
        this.server = server;
        console.log(`[control] 127.0.0.1:${this.port} で待機`);
        resolve();
      });
    });
  }

  stop(): void {
    this.server?.close();
    this.server = null;
  }

  private async handle(url: string, res: { end: (s: string) => void }): Promise<void> {
    const parsed = new URL(url, "http://127.0.0.1");
    const cmd = parsed.pathname.replace(/^\//, "");
    const arg = parsed.searchParams.get("name") ?? undefined;

    const result = await this.run(cmd, arg);
    res.end(JSON.stringify(result));
  }

  private async run(cmd: string, arg?: string): Promise<ControlResult> {
    switch (cmd) {
      case "list":
        return {
          ok: true,
          message:
            this.manager.names.length === 0
              ? "ボットはいません"
              : `ボット(${this.manager.names.length}): ${this.manager.names.join(", ")}`,
        };

      case "summon": {
        const r = await this.manager.summonByName(arg);
        return r.ok
          ? { ok: true, message: `${r.name} を召喚しました` }
          : { ok: false, message: r.reason };
      }

      case "dismiss": {
        if (arg === undefined) return { ok: false, message: "名前を指定してください" };
        if (arg === "all") {
          const n = this.manager.dismissAll();
          return { ok: true, message: `${n} 体を退出させました` };
        }
        return this.manager.dismiss(arg)
          ? { ok: true, message: `${arg} を退出させました` }
          : { ok: false, message: `${arg} はいません` };
      }

      case "forget":
        this.manager.forget();
        return { ok: true, message: "会話を忘れました" };

      default:
        return { ok: false, message: "list | summon | dismiss | forget" };
    }
  }
}
