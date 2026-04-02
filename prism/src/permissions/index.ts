import { GuildMember, APIInteractionGuildMember } from 'discord.js';
import { AppConfig } from '../config';
import { Game } from '../db/schema';

type MemberLike = GuildMember | APIInteractionGuildMember;

function hasRole(member: MemberLike, roleId: string): boolean {
  // APIInteractionGuildMember has roles as a plain string[]
  // GuildMember has roles.cache (a Collection)
  if (Array.isArray(member.roles)) {
    return member.roles.includes(roleId);
  }
  return (member.roles as GuildMember['roles']).cache.has(roleId);
}

function getMemberId(member: MemberLike): string {
  if ('id' in member) return member.id;
  return (member as APIInteractionGuildMember).user.id;
}

export function isFounder(member: MemberLike, config: AppConfig): boolean {
  return hasRole(member, config.founderRoleId);
}

export function isGM(member: MemberLike, game: Game): boolean {
  return getMemberId(member) === game.gmUserId;
}

export function canManageGame(
  member: MemberLike,
  game: Game,
  config: AppConfig
): boolean {
  return isFounder(member, config) || isGM(member, game);
}
