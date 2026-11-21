import { expect, test } from "bun:test";
import { parse } from "yaml";

test("Git release workflow preserves source checks and does not publish an npm runtime", async () => {
  const ci = parse(await Bun.file(".woodpecker/ci.yml").text());
  expect(ci.steps.check.commands).toContain("bun install --frozen-lockfile");
  expect(ci.steps.check.commands).toContain("bun run check");
  const release = parse(await Bun.file(".woodpecker/release.yml").text());
  expect(release.depends_on).toEqual(["ci"]);
  expect(release.when).toEqual([{ event: "push", branch: "main" }]);
  expect(release.steps.map((step: { name: string }) => step.name)).toEqual(["github-release", "release-pr"]);
  const text = JSON.stringify(release);
  for (const step of release.steps as { name: string; commands: string[] }[]) {
    expect(step.commands).toHaveLength(1);
    expect(step.commands[0]).toContain(
      `release-please ${step.name} --token="$GITHUB_API_TOKEN" --repo-url=https://github.com/r-seriesx/higgsfield-plugin `,
    );
  }
  expect(text).not.toContain("github.com/jurislm/higgsfield-plugin");
  expect(text).not.toContain("npm_token");
  expect(text).not.toContain("bun publish");
  const pkg = await Bun.file("package.json").json();
  expect(pkg.private).toBe(true);
  expect(pkg.bin).toBeUndefined();
});

test("Release Please updates host package versions without touching vendored skills", async () => {
  const config = await Bun.file("release-please-config.json").json();
  const paths = config.packages["."].extraFiles ?? config.packages["." ]["extra-files"];
  expect(paths.map((entry: { path: string }) => entry.path).sort()).toEqual([".claude-plugin/marketplace.json", ".claude-plugin/plugin.json", ".codex-plugin/plugin.json", ".cursor-plugin/plugin.json", "plugin.json"]);
  expect(JSON.stringify(paths)).not.toContain("skills/");
});

test("install docs and plugin metadata point to the canonical GitHub organization", async () => {
  const repository = "r-seriesx/higgsfield-plugin";
  const repositoryUrl = `https://github.com/${repository}`;
  const readme = await Bun.file("README.md").text();
  expect(readme).toContain(`/plugin marketplace add ${repository}`);
  expect(readme).toContain(`codex plugin marketplace add ${repository}`);
  expect(readme).toContain(repositoryUrl);
  expect(readme).not.toContain("github.com/jurislm/");
  const landing = await Bun.file("docs/index.html").text();
  expect(landing).toContain(`/plugin marketplace add ${repository}`);
  expect(landing).toContain(repositoryUrl);
  expect(landing).not.toContain("jurislm/higgsfield-plugin");
  for (const path of [
    "plugin.json", ".claude-plugin/plugin.json", ".codex-plugin/plugin.json", ".cursor-plugin/plugin.json",
  ]) {
    const manifest = await Bun.file(path).json();
    expect(manifest.homepage).toBe(repositoryUrl);
    expect(manifest.repository).toBe(repositoryUrl);
    expect(JSON.stringify(manifest)).not.toContain("github.com/jurislm/");
  }
});
