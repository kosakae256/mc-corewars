/**
 * `@minecraft/server-net` のパケット API の型を補う。
 *
 * ## なぜ自前で書くのか
 *
 * npm の `@minecraft/server-net` は **1.19 系で更新が止まっており**、
 * HTTP と WebSocket しか型が無い。
 * だが**実機（1.26.44）にはパケット API が実装されている**。
 *
 * 根拠は Mojang 公式のメタデータ:
 * `reference/bedrock-samples/metadata/script_modules/@minecraft/server-net_1.0.0-beta.json`
 *
 * そこに `beforeEvents` / `NetworkBeforeEvents` /
 * `PacketSendBeforeEvent` / `PacketId` が定義されている。
 * ここではそのうち**使う分だけ**を写す。
 *
 * npm 側が追いついたら、このファイルは消す。
 */
declare module "@minecraft/server-net" {
  /** パケットの種類。実機には 228 種あるが、使う分だけ書く */
  export enum PacketId {
    TextPacket = "TextPacket",
  }

  /** 購読するパケットを絞る */
  export interface PacketEventOptions {
    ignoredPacketIds?: PacketId[];
    monitoredPacketIds?: PacketId[];
  }

  /**
   * 送信しようとしているパケット。
   *
   * **中身は取れない。** 種類と宛先だけ分かる。
   */
  export class PacketSendBeforeEvent {
    private constructor();
    cancel: boolean;
    readonly packetId: PacketId;
    readonly recipients: unknown[];
  }

  export class PacketSendBeforeEventSignal {
    private constructor();
    subscribe(
      callback: (event: PacketSendBeforeEvent) => void,
      options?: PacketEventOptions
    ): (event: PacketSendBeforeEvent) => void;
    unsubscribe(callback: (event: PacketSendBeforeEvent) => void): void;
  }

  export class NetworkBeforeEvents {
    private constructor();
    readonly packetSend: PacketSendBeforeEventSignal;
  }

  /** モジュール直下に生えている */
  export const beforeEvents: NetworkBeforeEvents;
}
