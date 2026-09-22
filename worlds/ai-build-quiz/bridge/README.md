# bridge — 単語を選び、genlab に頼み、`/wsserver` 経由で BP へ渡す

仕様: [../docs/spec/13-transport.md](../docs/spec/13-transport.md)（口）・[10-architecture.md](../docs/spec/10-architecture.md)（全体）。

## 初回

```powershell
cd worlds/ai-build-quiz/bridge
npm install
npm run words        # words/*.txt → words.json（衝突・3 語未満のジャンルがあれば止まる）
```

## 使う

```powershell
npm start            # ws://127.0.0.1:8766 で待つ（genlab は先に起動しておく）
```

Minecraft（ホスト）で `/wsserver ws://127.0.0.1:8766`。あとは BP の `/quiz:start` で動き出す（bridge は scoreboard の `phase` を見て、0 のときだけお題を作って送る）。

## 中身

| | |
| --- | --- |
| `src/main.ts` | 起動。`config.json` と `words.json` を読み、WebSocket で待つ |
| `src/bridge.ts` | 1 接続ぶん。phase を 1 秒ごとに読む → 0 なら 単語 → genlab → `/scriptevent quiz:round / palette / chunk × N / go` |
| `src/genlab.ts` | genlab の `/build` を叩く（型ガードつき） |
| `src/rle.ts` | 連長圧縮（BP の `core/rle.ts` と同じ規則） |
| `src/normalize.ts` | 答えの正規化（BP の `core/answer.ts` と**同じ内容**。検証ベクタも同じ） |
| `src/romaji.ts` | 読み → ローマ字の候補（ヘボン・訓令・長音つぶし・nn） |
| `src/words.ts` | `words/*.txt` の読み込みと検証 |
| `src/tools/build-words.ts` | `npm run words` |
| `src/tools/test.ts` | `npm test`（正規化・ローマ字・rle） |
| `words/*.txt` | **単語リストの元**（人が書く。落とした語は `#` で残す） |

## 検証（Minecraft 無し）

`npm run check`（型 ＋ テスト）。

**Minecraft のふりをして通しで確かめる**（genlab と bridge を起動してから）:

```bash
node tools/fake-mc.ts 2      # 2 ラウンド。BP の解析コードそのもので受けて、chunk・個数・palette を照合する
node tools/fake-mc.ts 1 custom   # 出題モードのふり（mode 2・お題「ピカチュウ／黄色い」。Ollama が要る）
```

本番の bridge を動かしたまま試すなら、別の port で: `BRIDGE_PORT=8768 npm start` と `BRIDGE_PORT=8768 node tools/fake-mc.ts 1`（環境変数が `config.json` の `port` より優先）。

Minecraft と繋いだ疎通は [13-transport.md 5 章](../docs/spec/13-transport.md) の順で。
