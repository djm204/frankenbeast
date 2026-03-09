import { z } from 'zod';

export const TelegramUpdateSchema = z.object({
  update_id: z.number(),
  message: z.object({
    message_id: z.number(),
    from: z.object({
      id: z.number(),
      is_bot: z.boolean().optional(),
      first_name: z.string(),
      username: z.string().optional(),
    }),
    chat: z.object({
      id: z.number(),
      type: z.string(),
    }),
    date: z.number(),
    text: z.string().optional(),
    entities: z.array(z.object({
      type: z.string(),
      offset: z.number(),
      length: z.number(),
    })).optional(),
  }).optional(),
  callback_query: z.object({
    id: z.string(),
    from: z.object({
      id: z.number(),
    }),
    message: z.object({
      message_id: z.number(),
      chat: z.object({
        id: z.number(),
      }),
    }).optional(),
    data: z.string().optional(),
  }).optional(),
});

export type TelegramUpdate = z.infer<typeof TelegramUpdateSchema>;
