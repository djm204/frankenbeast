import { z } from 'zod';

export enum DiscordInteractionType {
  PING = 1,
  APPLICATION_COMMAND = 2,
  MESSAGE_COMPONENT = 3,
  APPLICATION_COMMAND_AUTOCOMPLETE = 4,
  MODAL_SUBMIT = 5,
}

export const DiscordInteractionSchema = z.object({
  type: z.nativeEnum(DiscordInteractionType),
  id: z.string(),
  token: z.string(),
  application_id: z.string(),
  guild_id: z.string().optional(),
  channel_id: z.string().optional(),
  user: z.object({
    id: z.string(),
    username: z.string(),
  }).optional(),
  member: z.object({
    user: z.object({
      id: z.string(),
      username: z.string(),
    }),
  }).optional(),
  data: z.object({
    id: z.string().optional(),
    name: z.string().optional(),
    type: z.number().optional(),
    custom_id: z.string().optional(),
    component_type: z.number().optional(),
    options: z.array(z.any()).optional(),
  }).optional(),
});

export type DiscordInteraction = z.infer<typeof DiscordInteractionSchema>;
