# Contributing

Thanks for your interest in `medusa-plugin-printify`. Bug reports, feature requests, and pull requests are all welcome.

---

## Reporting bugs and requesting features

- **Bugs:** open a [bug report](https://github.com/greedychipmunk/medusa-plugin-printify/issues/new?template=bug_report.yml) including your Medusa version, plugin version, repro steps, and logs.
- **Features:** open a [feature request](https://github.com/greedychipmunk/medusa-plugin-printify/issues/new?template=feature_request.yml) describing the problem first, then the proposed solution.
- **Security:** see [SECURITY.md](SECURITY.md) — please use a private advisory, not a public issue.

---

## Local development

### Prerequisites

- Node.js >= 20
- [pnpm](https://pnpm.io) (`corepack enable && corepack prepare pnpm@latest --activate`)
- [Docker](https://www.docker.com) (for the local PostgreSQL instance)

### Setup

```bash
git clone https://github.com/greedychipmunk/medusa-plugin-printify
cd medusa-plugin-printify
pnpm install
cp .env.template .env   # fill in your Printify API key + webhook secret
docker compose up -d    # start local Postgres
```

### Linking into a host Medusa app

Build the plugin into the local Yalc registry and install it from a host app:

```bash
# in this repo
pnpm medusa plugin:publish

# in your Medusa app
pnpm medusa plugin:add medusa-plugin-printify
pnpm medusa db:migrate
```

Run the watcher in this repo to push changes to the host app on save:

```bash
pnpm dev
```

### Tests

```bash
pnpm test               # all tests
pnpm test:watch         # watch mode
pnpm test:coverage      # with coverage report
```

CI (`.github/workflows/ci.yml`) runs `pnpm test`, `pnpm build`, and the bump-script test on every PR.

---

## Pull requests

### Conventional Commit titles

**PR titles must follow [Conventional Commits](https://www.conventionalcommits.org/).** The release workflow uses the PR title to decide whether — and how — to bump the version on merge to `main`:

| Title prefix | Version bump | Example |
|---|---|---|
| `feat: ...` or `feat(scope): ...` | minor (0.x.0) | `feat: add variant pricing sync` |
| `fix: ...` or `fix(scope): ...` | patch (0.0.x) | `fix: prevent null deref in catalog sync` |
| `feat!: ...` or `BREAKING CHANGE:` in body | major (x.0.0) | `feat!: rename printify_id option` |
| anything else (`chore:`, `docs:`, `ci:`, `refactor:`, etc.) | no release | `chore: bump dev dependencies` |

The `pr-title-lint` CI job rejects PRs with non-conforming titles.

### Checklist

- [ ] PR title is a valid Conventional Commit (`feat:`, `fix:`, `chore:`, etc.).
- [ ] `pnpm test` passes locally.
- [ ] `pnpm build` succeeds.
- [ ] You did **not** edit `package.json#version` by hand — the release workflow owns it. The `version-field-guard` CI job will fail the PR if you do.
- [ ] If you changed behavior, the README and/or `CHANGELOG.md` is updated.

---

## Release flow

You don't release; CI does. On merge to `main`:

1. `.github/workflows/release.yml` reads the merged PR title.
2. `.github/scripts/compute-bump.sh` decides the bump (`patch` / `minor` / `major` / none).
3. If a bump is required, the workflow updates `package.json`, commits, tags, and publishes to npm with OIDC provenance.

Nothing for contributors to do beyond merging a correctly-titled PR.
