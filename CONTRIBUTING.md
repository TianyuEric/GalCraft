# Contributing to GalCraft

[简体中文](CONTRIBUTING.zh-CN.md)

GalCraft welcomes focused bug fixes, documentation improvements and feature proposals. Describe the user scenario and the observable result in an Issue. Discuss changes to public behavior, data formats or package interfaces before a large implementation so the maintainer can agree on scope.

## Develop a change

1. Fork the repository and create a task branch from `dev`. Maintainers also start task branches from `dev`.
2. Prepare Node **24.21.0** and pnpm **12.3.4**, then follow [development](docs/development.md).
3. Keep tests near the code they exercise. Use `tests/e2e/` for scenarios that cross actual application boundaries. Follow [architecture](docs/architecture.md) and the [UI rules](docs/ui/README.md) for interface work.
4. Run the smallest checks that cover the change and its actual consumers. [Testing](docs/testing.md) lists commands, prerequisites and output handling.
5. Open a PR to `dev`. State the problem, the final change and the checks you actually ran. Include a screenshot when it explains an interface change.

Contributors synchronize the provider and affected consumers when they change an export, IPC message, host assembly or shared contract. They update the current documentation when behavior, interfaces or data change. A short design note records a consequential choice when alternatives have a material cost or are hard to reverse.

Authors use concrete subjects and active sentences. Chinese is the primary engineering documentation language; the README, getting started and contribution entry points provide English and Chinese. Product manuals have their own source on the [website](https://galcraft.dev/docs/en/installation/); report a manual correction with its page link. Documentation explains responsibilities and behavior while schemas and source maintain exact fields and versions. Authors use Mermaid for diagrams.

## Review and merge

TianyuEric reviews and performs the final merge after the selected CI checks pass. The `CI` check reports the applicable Windows route, including a successful result for documentation-only changes. CI runs with read-only repository permissions.

| PR route | Merge method |
| --- | --- |
| Task branch → `dev` | Squash merge; delete the completed task branch |
| `dev` → `main` for a release | Merge commit |
| Urgent fix from `main` → `main` | Squash merge |
| `main` → `dev` after an urgent fix | Merge commit |

The maintainer uses `main` as the default release branch and `dev` for integration. Their protection settings require a PR and the `CI` check, with **0 required approvals**, blocked force pushes and restricted deletions. The maintainer follows the same PR route. The repository enables Squash and Merge commits, keeps linear-history enforcement and required branch updates off, and uses manual merging. Remote repository settings take effect when the maintainer establishes the public repository.

## Contributions and reports

By submitting a contribution, you agree to provide it under the license applying to the corresponding files and confirm that you have the right to do so. You retain your copyright. When introducing third-party material, identify its source and preserve the required copyright and license notices. [License scope](LICENSING.md) explains the code, documentation, sample and third-party terms.

Use a minimal, redacted reproduction for bug reports. The [security policy](SECURITY.md) provides the private reporting route for vulnerabilities.
