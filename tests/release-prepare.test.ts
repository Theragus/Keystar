import { describe, expect, it } from "vitest";
import { nextVersion, releaseChangelog } from "@/scripts/release-prepare";

describe("nextVersion", () => {
  it.each([
    ["0.1.4", undefined, "0.1.5"],
    ["0.1.4", "patch", "0.1.5"],
    ["0.1.4", "minor", "0.2.0"],
    ["0.1.4", "major", "1.0.0"],
    ["0.1.4", "0.3.0", "0.3.0"],
    ["0.1.4", "0.1.10", "0.1.10"],
  ])("%s + %s → %s", (current, bump, expected) => {
    expect(nextVersion(current, bump)).toBe(expected);
  });

  it.each(["0.1.4", "0.1.3", "0.0.9", "v0.2.0", "huge"])("rejects %s", (bump) => {
    expect(() => nextVersion("0.1.4", bump)).toThrow();
  });
});

describe("releaseChangelog", () => {
  const changelog = `# Changelog

Intro.

## [Unreleased]

### Fixed

- Something.

## [0.1.4] - 2026-10-03

### Fixed

- Older.
`;

  it("moves the Unreleased entries under the new version", () => {
    expect(releaseChangelog(changelog, "0.1.5", "2026-10-05")).toBe(`# Changelog

Intro.

## [Unreleased]

## [0.1.5] - 2026-10-05

### Fixed

- Something.

## [0.1.4] - 2026-10-03

### Fixed

- Older.
`);
  });

  it("works when Unreleased is the only section", () => {
    expect(releaseChangelog("## [Unreleased]\n\n- First.\n", "0.1.0", "2026-10-05")).toBe(
      "## [Unreleased]\n\n## [0.1.0] - 2026-10-05\n\n- First.\n",
    );
  });

  it("refuses an empty Unreleased section", () => {
    expect(() => releaseChangelog(changelog.replace("### Fixed\n\n- Something.\n\n", ""), "0.1.5", "2026-10-05")).toThrow(
      /Nothing to release/,
    );
  });

  it("refuses a missing Unreleased section or an existing version", () => {
    expect(() => releaseChangelog("## [0.1.4] - 2026-10-03\n", "0.1.5", "2026-10-05")).toThrow(/Unreleased/);
    expect(() => releaseChangelog(changelog, "0.1.4", "2026-10-05")).toThrow(/already has a section/);
  });
});
