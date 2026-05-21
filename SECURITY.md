# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| 0.x | :white_check_mark: |

This plugin is pre-1.0; only the latest `0.x` release receives security fixes.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security reports.**

Use GitHub's [private security advisories](https://github.com/greedychipmunk/medusa-plugin-printify/security/advisories/new) to report vulnerabilities privately. This lets us coordinate a fix and a release before disclosure.

When reporting, please include:

- A description of the issue and its impact.
- Steps to reproduce, or a minimal proof-of-concept.
- The plugin version and Medusa version affected.
- Any relevant logs or configuration (redacted of secrets).

## Response expectations

This is a hobbyist open-source project — there is no formal SLA. I will acknowledge reports on a best-effort basis, typically within a few days, and aim to ship a fix in a patch release as soon as practical.

## Scope

In scope:

- The plugin source code in `src/`.
- The built artifacts published to npm under `medusa-plugin-printify`.
- The CI/release workflows in `.github/workflows/` (supply-chain risk).

Out of scope:

- Vulnerabilities in [Medusa](https://github.com/medusajs/medusa), [Printify's API](https://developers.printify.com), or any third-party dependency — please report those to the respective project.
- Misconfiguration of a host Medusa app that exposes admin routes publicly.
