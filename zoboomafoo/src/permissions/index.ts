import { GuildMember, APIInteractionGuildMember } from 'discord.js';
import { AppConfig } from '../config';

type MemberLike = GuildMember | APIInteractionGuildMember;

function hasRole(member: MemberLike, roleId: string): boolean {
  if (Array.isArray(member.roles)) {
    return member.roles.includes(roleId);
  }
  return (member.roles as GuildMember['roles']).cache.has(roleId);
}

export function isFounder(member: MemberLike, config: AppConfig): boolean {
  return hasRole(member, config.founderRoleId);
}
