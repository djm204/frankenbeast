import { z } from 'zod';

export const SlackEventBaseSchema = z.object({
  type: z.string(),
  token: z.string().optional(),
  team_id: z.string().optional(),
  api_app_id: z.string().optional(),
  event: z.object({
    type: z.string(),
    user: z.string().optional(),
    text: z.string().optional(),
    channel: z.string().optional(),
    thread_ts: z.string().optional(),
    ts: z.string().optional(),
    bot_id: z.string().optional(),
  }).optional(),
  challenge: z.string().optional(),
});

export const SlackInteractionSchema = z.object({
  type: z.string(),
  user: z.object({
    id: z.string(),
    name: z.string(),
  }),
  channel: z.object({
    id: z.string(),
    name: z.string(),
  }),
  actions: z.array(z.object({
    action_id: z.string(),
    value: z.string().optional(),
    type: z.string(),
    action_ts: z.string(),
  })),
  container: z.object({
    type: z.string(),
    message_ts: z.string().optional(),
    channel_id: z.string().optional(),
    thread_ts: z.string().optional(),
  }),
  trigger_id: z.string(),
});
