# CLAUDE.md

## Monorepo Structure

This repo contains multiple Discord bot projects as subpackages:

```
├── zoboomafoo/    # Active — internal team TTRPG bot
├── prism/         # Shelved — community TTRPG bot
└── streaming-rainbow/  # Next.js app
```

Each subpackage has its own `package.json`, `tsconfig.json`, and `node_modules/`. Run commands from within the subpackage directory.

## Active Focus: Zoboomafoo

See `zoboomafoo/` for the current active project.

## Prism Bot (shelved)

Located in `prism/`. A Discord bot for managing community TTRPG games. Development is paused.

### Tech Stack
- **Language:** TypeScript (Node.js 20)
- **Discord library:** Discord.js v14
- **Database:** SQLite + Drizzle ORM (better-sqlite3)
- **Deployment:** Docker Compose on Raspberry Pi

### Commands (run from `prism/`)

```bash
npm run dev          # Local dev with hot-reload (ts-node-dev)
npm run build        # TypeScript compile → dist/
npm run deploy       # Register slash commands to the guild
npm run db:generate  # Generate migration from schema changes
npm run db:push      # Apply migrations to the DB
```

### Key Design Decisions
- **Config:** Secrets in `.env`; Discord IDs (guild, channels, roles) in `bot_config` DB row — editable at runtime via `/admin setup`
- **Commands:** Guild-scoped slash commands, registered via `npm run deploy`
- **Services:** Commands never call DB directly; all logic lives in service classes
- **Confirmation flows:** Destructive actions use Discord button interactions; entity ID encoded in `customId`; permissions re-validated at click time
- **Schedule:** `ScheduleService.renderSchedule()` maintains live Discord messages in the schedule channel; tracks message IDs in `schedule_posts` table

### Discord Server
- **Server:** Prism Bot Testing Ground
- **Guild ID:** 1485480269552029808
- **General channel ID:** 1485480270357467229
