import minecraftLinting from "eslint-plugin-minecraft-linting";
import tsParser from "@typescript-eslint/parser";
import ts from "@typescript-eslint/eslint-plugin";

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
    },
  },
  {
    // ---- ドローンの視点戻しだけ、コマンドを使ってよい
    //
    // `Camera.clear()` が効かない場面があった
    // （アイテムは消えているのに視点が戻らない。2026-08-25）。
    // **API とコマンドの両方を叩く**ことで戻している。
    //
    // 「API で置き換えられる」という指摘は正しいが、
    // **その API が効かない**のがここの事情。
    files: ["scripts/features/drone/index.ts"],
    rules: {
      "minecraft-linting/avoid-unnecessary-command": "off",
    },
  },
];
