import { argv, parallel, series, task, tscTask } from "just-scripts";
import {
  BundleTaskParameters,
  CopyTaskParameters,
  bundleTask,
  cleanTask,
  cleanCollateralTask,
  copyTask,
  coreLint,
  mcaddonTask,
  setupEnvironment,
  ZipTaskParameters,
  STANDARD_CLEAN_PATHS,
  DEFAULT_CLEAN_DIRECTORIES,
  getOrThrowFromProcess,
  watchTask,
} from "@minecraft/core-build-tasks";
import path from "path";
import { execFileSync } from "child_process";

// Setup env variables
setupEnvironment(path.resolve(__dirname, ".env"));
const projectName = getOrThrowFromProcess("PROJECT_NAME");

// You can use `npm run build:production` to build a "production" build that strips out statements labelled with "dev:".
const isProduction = argv()['production'];

const bundleTaskOptions: BundleTaskParameters = {
  entryPoint: path.join(__dirname, "./scripts/main.ts"),
  external: ["@minecraft/server", "@minecraft/server-ui", "@minecraft/server-gametest", "@minecraft/debug-utilities"],
  outfile: path.resolve(__dirname, "./dist/scripts/main.js"),
  minifyWhitespace: false,
  sourcemap: true,
  outputSourcemapPath: path.resolve(__dirname, "./dist/debug"),
  dropLabels: isProduction ? ['dev'] : undefined
};

const copyTaskOptions: CopyTaskParameters = {
  copyToBehaviorPacks: [`./behavior_packs/${projectName}`],
  copyToScripts: ["./dist/scripts"],
  copyToResourcePacks: [`./resource_packs/${projectName}`],
};

const mcaddonTaskOptions: ZipTaskParameters = {
  ...copyTaskOptions,
  outputFile: `./dist/packages/${projectName}.mcaddon`,
};

// Lint
task("lint", coreLint(["scripts/**/*.ts"], argv().fix));

// Build
task("typescript", tscTask());
task("bundle", bundleTask(bundleTaskOptions));
task("build", series("typescript", "bundle"));

// Clean
task("clean-local", cleanTask(DEFAULT_CLEAN_DIRECTORIES));
task("clean-collateral", cleanCollateralTask(STANDARD_CLEAN_PATHS));
task("clean", parallel("clean-local", "clean-collateral"));

// Package
task("copyArtifacts", copyTask(copyTaskOptions));
// ---- 配るたびにリソースパックの版を上げる
//
// **参加者はパックを UUID と版でしか見分けていない。**
// 版が同じなら中身が変わっても取り直さないので、
// 上げ忘れると**ホストにだけ見えて、他の人には見えない。**
//
// `--if-changed` なので、RP の中身が変わったときだけ上がる。
//
// 詳細は `docs/research/02-hot-reload.md` 7 章
task("bump-rp", () => {
  execFileSync(
    process.execPath,
    [path.resolve(__dirname, "../../../../tools/bump-rp.mjs"), projectName, "--if-changed"],
    { stdio: "inherit" }
  );
});

task("package", series("bump-rp", "clean-collateral", "copyArtifacts"));

// Local Deploy used for deploying local changes directly to output via the bundler. It does a full build and package first just in case.
task(
  "local-deploy",
  watchTask(
    ["scripts/**/*.ts", "behavior_packs/**/*.{json,lang,png}", "resource_packs/**/*.{json,lang,png}"],
    series("clean-local", "build", "package")
  )
);

// Mcaddon
task("createMcaddonFile", mcaddonTask(mcaddonTaskOptions));
task("mcaddon", series("clean-local", "build", "bump-rp", "createMcaddonFile"));
