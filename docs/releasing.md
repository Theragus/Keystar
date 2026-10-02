# Releasing Keystar

Keystar's version lives in `package.json`. Every version that reaches `main` is released automatically.

## Cutting a release

1. In the pull request, bump `"version"` in `package.json` (while below 1.0: features and fixes bump the patch
   number, e.g. 0.1.1 → 0.1.2) and add a section for it at the top of [CHANGELOG.md](../CHANGELOG.md):

   ```markdown
   ## [0.1.2] - 2026-10-20

   ### Added
   - …
   ```

2. Merge the pull request. When CI has passed on `main`, the **Release** workflow
   (`.github/workflows/release.yml`) sees that `v0.1.2` doesn't exist yet and:
   - builds the Docker image and pushes `ghcr.io/theragus/keystar:0.1.2`, `:0.1` and `:latest`,
   - creates the `v0.1.2` tag and a GitHub release whose notes are that CHANGELOG section.

   Pull requests that don't change the version release nothing. A failed release can be retried from the Actions
   tab (Release → Run workflow); it releases the version on `main` if its tag is still missing.

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
