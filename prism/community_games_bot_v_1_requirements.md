# Community Games Discord Bot — V1 Requirements

## Purpose
Build a Discord bot for managing community TTRPG games in the Streaming Rainbow community. The bot should reduce organizer overhead for game creation, membership management, scheduling, and cleanup while keeping day-to-day use inside Discord.

This document is intended to be implementation-ready input for Claude Code.

---

## Product Goals
1. Make it easy to create and manage recurring community games.
2. Make game membership and game communication easy and reliable.
3. Make scheduling visible, centralized, and low-maintenance.
4. Minimize manual cleanup when games end or go on hiatus.
5. Keep V1 Discord-first. No web admin in V1.

---

## Non-Goals for V1
These are explicitly out of scope unless otherwise noted:
- Web admin dashboard
- Schedule conflict detection or conflict prevention
- Advanced availability polling
- Waitlist or substitute management
- Multi-server support
- Deep system-specific character sheet parsing
- Calendar integrations (Google Calendar, iCal sync, etc.)
- AI features

---

## Users and Roles

### Founders
Discord members with the Founder role.
Permissions:
- Full access to all bot admin commands
- Create, edit, archive, pause, resume, and clear any game
- Edit or cancel any session
- Run repair / resync commands

### Game Masters / Organizers
A user designated as the GM or organizer for a specific game.
Permissions:
- View and manage their own games
- Schedule, edit, reschedule, and cancel sessions for their own games
- Manage membership for their own games if needed
- Post or update game resources and character rosters for their own games

### Players
Community members participating in one or more games.
Permissions:
- Join or leave a game
- RSVP to sessions for games they belong to
- View game info and schedule
- Upload and manage their own character entries for a game

### Everyone
Permissions:
- View public schedule
- View public game info

---

## Core Product Model
The bot is the source of truth for:
- game records
- game membership
- role assignment from the pooled community role set
- scheduled sessions
- character entries and associated files/links

Discord roles are synchronized from bot state, not treated as the primary source of truth.

---

## Discord Structure Assumptions

### Required Discord Objects
V1 assumes these already exist or can be configured at setup:
- One channel for community games, where each game gets a thread
- One schedule channel where the bot posts and maintains the master schedule
- A Founder role used for elevated permissions
- A pool of generic community game roles such as:
  - `community-1`
  - `community-2`
  - `community-3`
  - etc.

### Thread Model
Each game has exactly one associated Discord thread in the community games channel.
That thread is the main discussion space for that game.

---

## High-Level Feature Set

### V1 MVP
- Create a game
- Assign a pooled Discord role to the game
- Create and link a Discord thread for the game
- Join / leave game membership via bot commands
- Schedule one-off sessions
- Edit, reschedule, or cancel sessions
- Maintain a master schedule post in the schedule channel
- Display game info on command
- Pause / resume / archive / clear a game
- Founder repair / resync commands
- Basic audit logging

### MVP+
- RSVP system
- Reminder system
- Recurring session support
- Character entry storage with file/link support
- Character roster posting

### V1 Full
- Session recap / note storage
- Resource listing per game
- More polished admin controls inside Discord
- Better schedule formatting / pagination / archival behavior

---

# Functional Requirements

## 1. Game Lifecycle Management

### 1.1 Create Game
A Founder or other approved admin can create a game.

#### Inputs
- game title
- GM / organizer Discord user
- system name
- short description / pitch
- player cap (optional)
- visibility / status defaults

#### Behavior
On creation, the bot must:
1. Create a game record in persistent storage.
2. Assign the next available pooled community role.
3. Create a thread in the configured community games channel.
4. Link the game record to:
   - assigned role
   - thread ID
   - GM / organizer
5. Set the initial game status to `recruiting` or `active` depending on chosen option.
6. Post an initial info message in the game thread.
7. Return a confirmation message to the creator.

#### Validation
- Cannot create a game if no pooled role is available.
- Game title should be unique enough for users to select unambiguously.
- If thread creation fails, the bot should not leave a half-created game record without marking it as errored.

### 1.2 View Game Info
Users can request a summary of a game.

#### Output should include
- game title
- status
- GM / organizer
- system
- player cap
- current players
- linked thread
- assigned role
- next upcoming session, if any
- short description

### 1.3 Join Game
A player can join a game.

#### Behavior
- Adds the player to the game membership list
- Synchronizes the game’s Discord role to the user
- Confirms success

#### Validation
- Should not duplicate membership
- If a player cap exists, bot behavior should be configurable:
  - for V1: block joining when full
  - waitlist support is out of scope

### 1.4 Leave Game
A player can leave a game.

#### Behavior
- Removes the player from the game membership list
- Removes the associated game role from the player
- Confirms success

### 1.5 Pause Game
A Founder or the game’s GM can pause a game.

#### Behavior
- Set status to `paused`
- Keep thread and membership intact
- Keep historical sessions and resources intact
- Prevent new reminders for canceled sessions; future scheduled sessions may remain or be optionally canceled based on command choice

### 1.6 Resume Game
A Founder or the game’s GM can resume a paused game.

#### Behavior
- Set status back to `active`

### 1.7 Archive Game
A Founder or the game’s GM can archive a game.

#### Behavior
- Set status to `archived`
- Lock or archive thread if supported by permissions/workflow
- Keep membership/history/resources for reference
- Remove the game role from all players
- Release the pooled role back into the available pool

### 1.8 Clear Game
A Founder can fully clear a game.

#### Behavior
- Remove all future scheduled sessions for the game
- Archive or lock the thread
- Remove the game role from all users
- Mark status as `cleared` or `completed`
- Release the pooled role back into the pool
- Preserve audit history
- Require explicit confirmation before executing

#### Note
Implementation may treat Archive and Clear similarly internally, but user-facing semantics should distinguish between “inactive but preserved” and “fully closed and cleaned up.”

---

## 2. Scheduling and Session Management

### 2.1 Add Session
A Founder or the game’s GM can schedule a session.

#### Inputs
- game
- date
- start time
- time zone (or use server default)
- duration (optional but recommended)
- session title (optional)
- notes (optional)
- recurring rule (MVP+)

#### Behavior
- Create a session record linked to the game
- Add it to the master schedule in chronological order
- Optionally post a message in the game thread
- Optionally ping the game role when configured

### 2.2 Edit Session
A Founder or the game’s GM can edit an existing session.

#### Editable fields
- date
- start time
- duration
- title
- notes
- status

#### Behavior
- Update stored session record
- Re-render master schedule in correct date order
- Optionally notify affected players

### 2.3 Reschedule Session
A Founder or the game’s GM can reschedule a session.

#### Behavior
- Update date/time fields
- Keep same session identity if possible
- Preserve RSVP state if appropriate
- Re-render schedule
- Notify the game thread and/or role

### 2.4 Cancel Session
A Founder or the game’s GM can cancel a session.

#### Behavior
- Mark session as canceled
- Remove it from active upcoming schedule display or show it as canceled, based on display rules
- Stop reminders for canceled sessions
- Optionally post cancellation notice

### 2.5 Mark Session Complete
A Founder or the game’s GM can mark a session complete.

#### Behavior
- Mark status as completed
- Remove from upcoming schedule display
- Keep in historical session list

### 2.6 Master Schedule Rendering
The bot must maintain a master schedule post or set of posts in the dedicated schedule channel.

#### Requirements
- Show upcoming sessions in chronological order
- Update automatically when sessions are created, edited, canceled, completed, or become historical
- Handle long schedule output gracefully (multiple embeds/messages if needed)
- Survive restarts by rebuilding from persistent data

#### Suggested display per session
- date/time
- game title
- GM
- short title / notes if present
- RSVP summary (MVP+)

### 2.7 Historical Session Handling
Past sessions should not clutter the main schedule.

#### V1 behavior
- Upcoming schedule shows only future and active sessions
- Historical sessions remain queryable via game info / session history commands

---

## 3. Membership and Role Synchronization

### 3.1 Bot-Owned Membership
Membership must be stored in the database and treated as canonical.

### 3.2 Discord Role Sync
Whenever membership changes, the bot must attempt to synchronize the assigned pooled role.

#### Cases
- join game → add role
- leave game → remove role
- archive/clear game → remove role from all members
- repair/resync → reconcile membership and actual Discord role holders

### 3.3 Role Pool Management
The bot must maintain awareness of available pooled roles.

#### Requirements
- Assign next free role on game creation
- Refuse game creation if no pooled role is available
- Release role when a game is archived/cleared and no longer actively uses it
- Support admin inspection of role pool state

---

## 4. RSVP and Reminders (MVP+)

### 4.1 RSVP to Session
Players can RSVP to a scheduled session.

#### RSVP states
- yes
- no
- maybe
- late (optional)

#### Behavior
- One RSVP per player per session
- Updating RSVP overwrites prior response
- Display RSVP summary in session info and optionally in schedule view

### 4.2 Reminder System
The bot should send reminders for upcoming sessions.

#### Initial supported reminder timings
- 24 hours before
- 2 hours before

#### Reminder targets
- game role
- optionally only RSVP yes/maybe users later

#### Requirements
- Skip canceled or completed sessions
- Avoid duplicate reminders if job reruns

---

## 5. Character Entries and Resources (MVP+ / V1)

### 5.1 Character Entry Storage
Players can create character entries associated with a specific game.

#### Character fields
- character name
- player / owner
- short description
- optional image attachment or URL
- optional sheet file attachment
- optional sheet link URL
- optional freeform details text

#### Requirements
- System agnostic
- Support file upload metadata and/or link storage
- One player may have multiple character entries for a game if allowed by config

### 5.2 Character Roster Posting
A GM or Founder can request the bot post a game’s current character roster.

#### Output per character
- character name
- player name
- short summary
- link/file reference when available

### 5.3 Resource Listing
A game may have associated resources.

#### Example resource types
- house rules
- recap docs
- campaign docs
- safety docs
- map links
- character sheets

#### V1 behavior
Keep this lightweight: store title, URL/file, type, optional description.

---

## 6. Recaps / Notes (V1 Full)

### 6.1 Session Recap Storage
A GM or approved player can attach a recap/note entry to a completed session.

#### Fields
- session
- author
- recap text
- optional linked resources

### 6.2 Latest Recap Retrieval
Users can request the latest recap for a game.

---

## 7. Audit Logging and Repair Tools

### 7.1 Audit Logging
The bot should maintain an internal audit log for important state changes.

#### Events to log
- game created
- game updated
- game paused/resumed/archived/cleared
- membership joined/left
- role assigned/released
- session created/edited/rescheduled/canceled/completed
- character/resource added/updated/deleted
- repair commands executed

### 7.2 Repair / Resync Commands
Founder-only commands should help resolve drift between bot state and Discord state.

#### Minimum repair actions for V1
- resync game membership ↔ Discord role holders
- rebuild schedule channel post(s)
- inspect game state
- inspect role pool state
- relink thread manually if needed

#### Goal
Allow recovery from common operational failures without manual database edits.

---

# Command Surface
These names are suggestions. Final naming can change as long as behavior is preserved.

## Game Commands
- `/game create`
- `/game info`
- `/game join`
- `/game leave`
- `/game pause`
- `/game resume`
- `/game archive`
- `/game clear`
- `/game list`

## Session Commands
- `/session add`
- `/session edit`
- `/session reschedule`
- `/session cancel`
- `/session complete`
- `/session list`

## RSVP Commands (MVP+)
- `/session rsvp`
- `/session attendance`

## Character / Resource Commands
- `/character add`
- `/character edit`
- `/character remove`
- `/character list`
- `/resource add`
- `/resource list`
- `/recap add`
- `/recap latest`

## Admin / Repair Commands
- `/admin rolepool`
- `/admin resync game`
- `/admin rebuild schedule`
- `/admin inspect game`
- `/admin relink thread`

---

# Data Model Requirements
The exact schema is implementation-defined, but the following entities are required.

## Game
Fields should include at minimum:
- id
- title
- description
- system_name
- gm_user_id
- status
- player_cap
- discord_thread_id
- discord_role_id
- created_at
- updated_at
- archived_at / cleared_at (optional)

## GameMembership
- id
- game_id
- user_id
- role_sync_status (optional)
- joined_at
- left_at (optional)
- active flag

## Session
- id
- game_id
- title
- notes
- start_at
- duration_minutes
- timezone
- status (`scheduled`, `canceled`, `completed`)
- recurrence_rule (MVP+)
- created_by_user_id
- created_at
- updated_at

## RSVP (MVP+)
- id
- session_id
- user_id
- response
- updated_at

## CharacterEntry (MVP+)
- id
- game_id
- user_id
- character_name
- summary
- details
- image_url_or_attachment_ref
- sheet_url
- sheet_attachment_ref
- created_at
- updated_at

## Resource
- id
- game_id
- type
- title
- description
- url_or_attachment_ref
- created_by_user_id
- created_at
- updated_at

## AuditLog
- id
- actor_user_id
- action_type
- entity_type
- entity_id
- metadata blob / json
- created_at

## BotConfig
May include:
- guild_id
- founder_role_id
- games_channel_id
- schedule_channel_id
- default_timezone
- pooled_role_ids
- reminder settings

---

# Permissions Requirements

## Founder
Can do everything.

## GM / Organizer
Can manage only games where they are the GM/organizer.

## Player
Can interact only with their own membership, RSVP state, and own character entries unless broader permissions are granted.

## Permission Enforcement
All mutating commands must enforce permissions server-side. Discord UI visibility alone is not sufficient.

---

# UX / Messaging Requirements

## General Principles
- Responses should be concise and confirm what changed.
- Destructive actions should require confirmation.
- Error messages should be actionable.
- Commands should prefer selecting a game by canonical ID/name choice rather than ambiguous free text where possible.

## Confirmation Requirements
At minimum require confirmation for:
- archive game
- clear game
- bulk role removal
- relink thread
- rebuild schedule if it overwrites bot messages

## Error Cases to Handle Gracefully
- no free pooled role available
- missing or deleted thread
- missing or deleted schedule post
- Discord permission failure when assigning/removing role
- invalid date/time input
- user tries to join full game
- user tries to edit game they do not own
- schedule render exceeds single-message limits

---

# Reliability Requirements

## Persistence
All core state must be persisted outside runtime memory.
Bot restarts must not lose:
- games
- memberships
- sessions
- role mappings
- character/resource metadata
- audit logs

## Idempotency
Important scheduled jobs and repair operations should be safe to rerun.
Examples:
- schedule rebuild
- reminder dispatch
- membership resync

## Startup Behavior
On startup, the bot should:
1. Load configuration
2. Reconnect to persistent store
3. Resume reminder scheduling
4. Be able to rebuild schedule state if necessary

---

# Milestones

## Milestone 1 — MVP Foundation
Goal: establish the core game and scheduling loop.

### Included
- Bot configuration support for required Discord IDs and pooled roles
- Persistent storage setup
- Game creation
- Thread creation/linking
- Pooled role assignment
- Game membership join/leave
- Role synchronization
- Session creation/edit/reschedule/cancel/complete
- Master schedule rendering in schedule channel
- Game info display
- Founder-only clear/archive/pause/resume actions
- Basic audit logging
- Basic repair/resync commands

### Acceptance Criteria
- A Founder can create a game and get a linked thread + assigned role.
- A player can join and leave a game, and their Discord role stays in sync.
- A GM can add/edit/cancel a session and see the master schedule update correctly.
- A Founder can clear a game and the role is removed from all users.
- Bot restart does not destroy state.

## Milestone 2 — MVP+
Goal: improve usability for active groups.

### Included
- RSVP support
- Reminder system
- Recurring sessions
- Character entry storage
- Character roster posting

### Acceptance Criteria
- Players can RSVP and update their RSVP.
- Reminders are sent once at configured times.
- GMs can create a recurring session series.
- Players can attach system-agnostic character info and a sheet file/link.

## Milestone 3 — V1 Full Polish
Goal: improve campaign continuity and moderation ergonomics.

### Included
- Resource list per game
- Session recap / notes storage
- Latest recap retrieval
- Better admin inspection tools in Discord
- Improved schedule presentation and historical session access

### Acceptance Criteria
- A GM can attach recaps/resources to a game.
- Users can retrieve latest recap and relevant resources.
- Founders can inspect and repair common state drift through Discord commands.

---

# Suggested Implementation Priorities
1. Establish config + schema + permissions
2. Implement game creation and role pool assignment
3. Implement membership and role sync
4. Implement session storage and schedule renderer
5. Implement archive/clear/pause/resume
6. Implement repair/admin commands
7. Add RSVP/reminders
8. Add recurring sessions
9. Add character/resource/recap features

---

# Open Questions / Decisions for Implementer
These should be decided early during implementation:
1. What persistence layer will be used? (SQLite, Postgres, etc.)
2. What schedule rendering format is preferred? (single embed, multiple embeds, message blocks)
3. Should archived games retain membership records as inactive or fully detach them?
4. Should player cap enforcement be strict in V1 or overridable by Founder?
5. How should recurring sessions be materialized? Pre-generated future instances vs rule-based expansion on render
6. What default timezone should be used for the server?
7. How should file attachments be stored and referenced long-term?

---

# Summary
V1 should focus on the operational core:
- game creation
- bot-owned membership
- pooled role assignment
- scheduling and centralized schedule display
- cleanup and repairability

Everything else should support that loop rather than complicate it. Discord remains the primary interface in V1, with any future web admin deferred to V1.5.

