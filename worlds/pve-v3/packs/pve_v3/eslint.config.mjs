import minecraftLinting from "eslint-plugin-minecraft-linting";
import tsParser from "@typescript-eslint/parser";
import ts from "@typescript-eslint/eslint-plugin";

/**
 * 層の決まりを、機械的に見張る。
 *
 * **決まりそのものは `docs/spec/12-architecture.md`。**
 * ここは「破ったら落ちる」ようにするための仕掛けで、**決め事の出どころではない。**
 *
 * ```
 * features / events  →  services  →  state  →  core
 * ```
 *
 * **矢印の逆向きを禁止する。** core だけは `@minecraft/server` も禁止——
 * **テストできる範囲を、人の善意ではなく規則で守る。**
 *
 * ## なぜ glob ではなく正規表現なのか
 *
 * `no-restricted-imports` の `group` は **gitignore の書き方**で照合するので、
 * 星印の入った相対パターンが `../../types.js` にも当たってしまう（星が `..` を拾う）。
 * **相対指定の形をそのまま見たい**ので `regex` を使う。
 */
const forbid = (files, patterns) => ({
  files,
  rules: { "no-restricted-imports": ["error", { patterns }] },
});

/** 下の層から上の層を呼ぶのを禁じる */
const upward = (layers) => ({
  regex: `^\\.\\.?/.*(${layers.join("|")})/`,
  message: `層が逆。${layers.join(" / ")} は下の層から呼べない（docs/spec/12-architecture.md 1 章）`,
});

export default [
  {
    files: ["scripts/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: "latest",
    },
    plugins: {
      ts,
      "minecraft-linting": minecraftLinting,
    },
    rules: {
      "minecraft-linting/avoid-unnecessary-command": "error",
      // **1 ファイル 300 行まで**（`docs/imp.md` 10-8）
      "max-lines": ["error", { max: 300, skipBlankLines: false, skipComments: false }],
      // **輪は 1 本**（`docs/imp.md` 10-1）。`loop.ts` 以外で回さない
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.object.name='system'][callee.property.name='runInterval']",
          message: "輪は 1 本。runInterval は loop.ts だけ（docs/imp.md 10-1）",
        },
      ],
    },
  },

  // ---- core は**何も知らない**。`@minecraft/server` すら import しない
  forbid(
    ["scripts/core/**/*.ts"],
    [
      {
        regex: "^@minecraft/",
        message: "core は Minecraft を知らない。API が要るなら services へ（docs/spec/12-architecture.md 1 章）",
      },
      upward(["state", "services", "features", "events"]),
    ]
  ),

  // ---- state は core だけ見る
  forbid(["scripts/state/**/*.ts"], [upward(["services", "features", "events"])]),

  // ---- services は入口を知らない
  forbid(["scripts/services/**/*.ts"], [upward(["features", "events"])]),

  // ---- feature どうしは import しない（`docs/imp.md` 10-4）
  forbid(
    ["scripts/features/**/*.ts", "scripts/events/**/*.ts"],
    [
      {
        // `../<よその機能>/…`。**`../../` で上へ抜けるものは対象外**（services・state・core）
        regex: "^\\.\\./(?!\\.\\.)[^/]+/",
        message: "feature どうしは import しない。共有したい振る舞いは services へ（docs/imp.md 10-4）",
      },
    ]
  ),

  // ---- 例外は、理由を書いてここに置く
  {
    // **輪そのもの**
    files: ["scripts/loop.ts"],
    rules: { "no-restricted-syntax": "off" },
  },
  {
    // **粒の定義表。** 分けると「どの合図がどう見えるか」が散る
    files: ["scripts/services/fx.ts"],
    rules: { "max-lines": "off" },
  },
];
