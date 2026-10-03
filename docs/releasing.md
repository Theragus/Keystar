# Releasing Keystar

Keystar's version lives in `package.json`. Merging a pull request into `main` releases nothing: `main` may carry
unreleased work, and a release is cut only when you start one by hand.

## Pull requests

Describe user-facing changes under `## [Unreleased]` at the top of [CHANGELOG.md](../CHANGELOG.md). Leave the
version in `package.json` alone.

```markdown
## [Unreleased]

### Added
- …
```

## Cutting a release

1. On `main` (directly or in a small release pull request), bump `"version"` in `package.json` (while below 1.0:
   features and fixes bump the patch number, e.g. 0.1.1 → 0.1.2), rename `## [Unreleased]` to the version and date,
   and add a fresh empty `## [Unreleased]` above it:

   ```markdown
   ## [Unreleased]

   ## [0.1.2] - 2026-10-20

   ### Added
   - …
   ```

2. Wait for CI to pass on that commit on `main`, then open the Actions tab → **Release** → **Run workflow** (on
   `main`). The workflow (`.github/workflows/release.yml`) checks that `v0.1.2` doesn't exist yet and that CI passed
   on the commit, then:
   - builds the Docker image and pushes `ghcr.io/theragus/keystar:0.1.2`, `:0.1` and `:latest`,
   - creates the `v0.1.2` tag and a GitHub release whose notes are that CHANGELOG section.

   If the version is already tagged, CI hasn't passed yet or the CHANGELOG section is missing, the workflow stops
   with an error and publishes nothing. A failed release (e.g. a registry outage) is retried the same way.

The version shows in the sidebar footer and in `GET /api/health`.

## One-time setup

- **Package visibility:** the first published image is private. Open the package
  (github.com/users/theragus/packages/container/keystar) → *Package settings* → *Change visibility* → **Public**,
  so servers can `docker compose pull` without logging in.
- Images are built for `linux/amd64`. For ARM servers, add `linux/arm64` to `platforms` in the workflow (the build
  then takes considerably longer).

## Installing a release

On the server, in the Keystar checkout:

```bash
# .env: KEYSTAR_VERSION=0.1.2   (or "latest" to always take the newest release)
git pull                          # compose file and docs of the new version
docker compose pull
docker compose up -d
```

Database migrations run when the `app` container starts. To build from the checkout instead of pulling an image:
`docker compose up -d --build`.
