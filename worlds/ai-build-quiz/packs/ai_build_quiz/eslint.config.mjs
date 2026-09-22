import minecraftLinting from "eslint-plugin-minecraft-linting";
import tsParser from "@typescript-eslint/parser";
import ts from "@typescript-eslint/eslint-plugin";

/**
 * 層の決まりを機械的に見張る（pve-v3 から写した）。決まりは `docs/spec/15-state.md` 4 章。
 *
 * ```
 * features  →  services  →  state  →  core
 * ```
 * 矢印の逆向きを禁止。core は `@minecraft/server` も禁止（node でテストできる範囲を規則で守る）。
 */
const forbid = (files, patterns) => ({ files, rules: { "no-restricted-imports": ["error", { patterns }] } });
const upward = (layers) => ({
  regex: `^\.\.?/.*(${layers.join("|")})/`,
  message: `層が逆。${layers.join(" / ")} は下の層から呼べない（docs/spec/15-state.md 4 章）`,
});

export default [
  {
    files: ["scripts/**/*.ts"],
    languageOptions: { parser: tsParser, ecmaVersion: "latest" },
    plugins: { ts, "minecraft-linting": minecraftLinting },
    rules: {
      "minecraft-linting/avoid-unnecessary-command": "error",
      "max-lines": ["error", { max: 300, skipBlankLines: false, skipComments: false }],
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.object.name='system'][callee.property.name='runInterval']",
          message: "輪は 1 本。runInterval は loop.ts だけ（docs/imp.md 10-1）",
        },
      ],
    },
  },
  forbid(["scripts/core/**/*.ts"], [
    { regex: "^@minecraft/", message: "core は Minecraft を知らない。API が要るなら services へ" },
    upward(["state", "services", "features"]),
  ]),
  forbid(["scripts/state/**/*.ts"], [upward(["services", "features"])]),
  forbid(["scripts/services/**/*.ts"], [upward(["features"])]),
  forbid(["scripts/features/**/*.ts"], [
    { regex: "^\.\./(?!\.\.)[^/]+/", message: "feature どうしは import しない。共有したいものは state / services へ（docs/imp.md 10-4）" },
  ]),
  { files: ["scripts/loop.ts"], rules: { "no-restricted-syntax": "off" } },
  {
    // `/ability` に Script API の対応物が無い（docs/spec/16-world-rules.md 2 章）
    files: ["scripts/services/flight.ts"],
    plugins: { "minecraft-linting": minecraftLinting },
    rules: { "minecraft-linting/avoid-unnecessary-command": "off" },
  },
];
