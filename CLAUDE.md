# CLAUDE.md

## Project: Prism Bot

A Discord bot for managing community TTRPG games in the "Prism Bot Testing Ground" server.

## Tech Stack
- **Language:** TypeScript (Node.js 20)
- **Discord library:** Discord.js v14
- **Database:** SQLite + Drizzle ORM (better-sqlite3)
- **Deployment:** Docker Compose on Raspberry Pi

## Commands

```bash
npm run dev          # Local dev with hot-reload (ts-node-dev)
npm run build        # TypeScript compile → dist/
npm run deploy       # Register slash commands to the guild
npm run db:generate  # Generate migration from schema changes
npm run db:push      # Apply migrations to the DB
```

## Architecture

```
src/
├── index.ts             # Entry point + startup sequence
├── client.ts            # Discord.js Client singleton
├── config.ts            # AppConfig loader (env + bot_config DB row)
├── db/
│   ├── index.ts         # Drizzle instance (better-sqlite3)
│   ├── schema.ts        # All table definitions
│   └── migrations/      # drizzle-kit generated SQL
├── commands/
│   ├── index.ts         # Command registry
│   ├── deploy.ts        # Slash command registration script
│   ├── game/            # /game subcommands
│   ├── session/         # /session subcommands
│   └── admin/           # /admin subcommands
├── interactions/
│   ├── index.ts         # interactionCreate router
│   ├── buttons.ts       # Confirmation button handler
│   └── autocomplete.ts  # Game/session autocomplete
├── services/
│   ├── AuditService.ts
│   ├── GameService.ts
│   ├── MembershipService.ts
│   ├── RolePoolService.ts
│   ├── ScheduleService.ts
│   ├── SessionService.ts
│   └── ThreadService.ts
├── permissions/index.ts # isFounder, isGM, canManageGame
└── utils/
    ├── embeds.ts        # Shared embed builders
    ├── errors.ts        # AppError + Discord error reply helpers
    └── time.ts          # Date parsing + timezone utilities (luxon)
```

## Key Design Decisions
- **Config:** Secrets in `.env`; Discord IDs (guild, channels, roles) in `bot_config` DB row — editable at runtime via `/admin setup`
- **Commands:** Guild-scoped slash commands, registered via `npm run deploy`
- **Services:** Commands never call DB directly; all logic lives in service classes
- **Confirmation flows:** Destructive actions use Discord button interactions; entity ID encoded in `customId`; permissions re-validated at click time
- **Schedule:** `ScheduleService.renderSchedule()` maintains live Discord messages in the schedule channel; tracks message IDs in `schedule_posts` table

## Discord Server
- **Server:** Prism Bot Testing Ground
- **Guild ID:** 1485480269552029808
- **General channel ID:** 1485480270357467229

## First-Time Setup
1. Copy `.env.example` to `.env` and fill in `DISCORD_TOKEN` and `DISCORD_CLIENT_ID`
2. Run `npm install`
3. Run `npm run dev` to start the bot
4. In Discord, run `/admin setup` to configure guild IDs and pooled roles
5. Run `npm run deploy` to register slash commands
