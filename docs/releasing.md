# Releasing Keystar

Keystar's version lives in `package.json`. Every version that reaches `main` is released automatically.

## Cutting a release

1. In the pull request, bump `"version"` in `package.json` and add a section for it at the top of
   [CHANGELOG.md](../CHANGELOG.md). While Keystar is below 1.0:
   - a release with new features bumps the minor number and resets the patch (0.1.3 → 0.2.0),
   - a release with only fixes bumps the patch number (0.2.0 → 0.2.1),
   - a change that needs action on the server when updating (a new or renamed `.env` variable, an edit to the
     compose file, characters to re-link for new ESI scopes) also bumps the minor number; spell out the steps at the
     top of its CHANGELOG section.

   ```markdown
   ## [0.2.0] - 2026-10-20

   ### Added
   - …
   ```

2. Merge the pull request. When CI has passed on `main`, the **Release** workflow
   (`.github/workflows/release.yml`) sees that `v0.2.0` doesn't exist yet and:
   - builds the Docker image and pushes `ghcr.io/theragus/keystar:0.2.0`, `:0.2` and `:latest`,
   - creates the `v0.2.0` tag and a GitHub release whose notes are that CHANGELOG section.

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
# .env: KEYSTAR_VERSION=0.2.0   (or "latest" to always take the newest release)
git pull                          # compose file and docs of the new version
docker compose pull
docker compose up -d
```

Database migrations run when the `app` container starts. To build from the checkout instead of pulling an image:
`docker compose up -d --build`.
