/**
 * ボット1体。サーバーへの接続と、チャットの送受信を担う。
 *
 * 状態（接続・名前）と、それを操作する手続きがセットなのでクラスにしている
 * （docs/imp.md「要するに」3）。
 */
import bedrock from "bedrock-protocol";
import { normalizeSender } from "./logic.js";
import { isTextPacket } from "./types.js";

export type ChatListener = (sender: string, message: string) => void;

export class Bot {
  private client: ReturnType<typeof bedrock.createClient> | null = null;
  private spawned = false;

  constructor(
    readonly name: string,
    private readonly host: string,
    private readonly port: number,
    private readonly onChat: ChatListener
  ) {}

  get isSpawned(): boolean {
    return this.spawned;
  }

  /**
   * 接続し、ワールドに spawn するまで待つ。
   *
   * `offline: true` は Xbox 認証をしないモード。これにより
   * アカウントを用意せず、任意の名前で接続できる（spec 2-1）。
   * サーバー側は `online-mode=false` である必要がある。
   */
  connect(timeoutMs = 20000): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const done = (err?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        err ? reject(err) : resolve();
      };

      const timer = setTimeout(
        () => done(new Error(`${timeoutMs}ms 以内に spawn しませんでした`)),
        timeoutMs
      );

      let client: ReturnType<typeof bedrock.createClient>;
      try {
        client = bedrock.createClient({
          host: this.host,
          port: this.port,
          username: this.name,
          offline: true,
          // 接続ログをそのまま出すと大量に流れるので抑制する
          conLog: () => {},
        });
      } catch (e) {
        done(e instanceof Error ? e : new Error(String(e)));
        return;
      }

      this.client = client;

      client.on("spawn", () => {
        this.spawned = true;
        done();
      });

      client.on("text", (packet: unknown) => {
        if (!isTextPacket(packet)) {
          if (process.env.BOTS_TRACE === "1") {
            console.log(`[bot ${this.name}] text(未知の形):`, JSON.stringify(packet)?.slice(0, 200));
          }
          return;
        }
        if (process.env.BOTS_TRACE === "1") {
          console.log(
            `[bot ${this.name}] text type=${packet.type} from=${packet.source_name ?? ""} msg=${packet.message}`
          );
        }
        // chat 以外（システムメッセージ・翻訳文言）は扱わない
        if (packet.type !== "chat") return;
        // サーバーは装飾付きの名前を送ってくることがあるので剥がす
        const sender = normalizeSender(packet.source_name ?? "");
        if (sender.length === 0) return;
        this.onChat(sender, packet.message);
      });

      client.on("kick", (reason: unknown) => {
        this.spawned = false;
        console.warn(`[bot ${this.name}] kick:`, JSON.stringify(reason));
        done(new Error("サーバーに kick されました"));
      });

      // 接続が進まないときの切り分け用。BOTS_TRACE=1 で有効
      if (process.env.BOTS_TRACE === "1") {
        for (const ev of ["connect", "login", "join", "status", "close"]) {
          client.on(ev, (arg: unknown) => {
            console.log(`[bot ${this.name}] ${ev}`, arg === undefined ? "" : String(arg).slice(0, 120));
          });
        }
      }

      client.on("error", (err: unknown) => {
        this.spawned = false;
        console.warn(`[bot ${this.name}] error:`, err);
        done(err instanceof Error ? err : new Error(String(err)));
      });

      client.on("close", () => {
        this.spawned = false;
      });
    });
  }

  /**
   * チャットに発言する。
   *
   * **フィールドを1つでも欠くとパケットが不正になり、サーバーに切断される。**
   * 1.26.40 の protocol.json に定義された項目をすべて埋めること:
   *   needs_translation / category / type / (type ごとの分岐) /
   *   xuid / platform_chat_id / has_filtered_message / filtered_message
   *
   * `category` は message_only / authored / parameters。
   * プレイヤーの発言としては authored を使う。
   */
  say(text: string): void {
    if (!this.client || !this.spawned) return;
    // write ではなく queue を使う（公式ドキュメントの推奨）
    this.client.queue("text", {
      needs_translation: false,
      category: "authored",
      type: "chat",
      source_name: this.name,
      message: text,
      xuid: "",
      platform_chat_id: "",
      has_filtered_message: false,
      filtered_message: "",
    });
  }

  disconnect(): void {
    this.spawned = false;
    try {
      this.client?.close();
    } catch {
      // 既に切れている場合は無視してよい
    }
    this.client = null;
  }
}
