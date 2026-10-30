# Agent guide

Read [README.md](README.md) for setup. Before changing transport, inference,
frontend boundaries, or database behavior, read [docs/blueprint.md](docs/blueprint.md).
For AI evaluation, telemetry, model context, also
read the relevant topic linked in [AI development principles](docs/blueprint.md#ai-development-principles).

- Keep business operations in `packages/trpc/src/domain` and SQL in `database/access`.
- Derive ownership from the authenticated session. Missing and foreign resources
  produce the same `NOT_FOUND` result.
- Update provider, HTTP, shared stream, and browser tests together when changing
  inference events. Inference success requires explicit completion; EOF alone is
  failure. Validate task correctness separately.
- Keep components independent of auth/API clients; containers and hooks coordinate
  requests. Pure transformations belong in `model`, HTTP work in `data`.
- Each workspace owns its imported dependencies. The root owns lifecycle tooling.
- Preserve existing SQL identifiers and migrations. Generate a forward migration
  for schema changes; use a disposable database for destructive checks.
- Run `just check` and `just check-integration`. For runtime dependencies, migrations,
  or Docker changes, also run `just check-container`.
- Keep this a generic starter. Product-specific services require an explicit need.
