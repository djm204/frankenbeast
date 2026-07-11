import type { TranscriptMessage } from './types.js';
import { ModelTier } from './types.js';
import { isoNow } from '@franken/types';

export interface TokenTotals {
  cheap: number;
  premiumReasoning: number;
  premiumExecution: number;
}

function cloneMessage(message: TranscriptMessage): TranscriptMessage {
  return { ...message };
}

export class Transcript {
  private _messages: TranscriptMessage[] = [];

  append(msg: {
    role: 'user' | 'assistant' | 'system';
    content: string;
    modelTier?: string;
    tokens?: number;
  }): void {
    const storedMessage: TranscriptMessage = {
      ...msg,
      timestamp: isoNow(),
    };
    this._messages.push(storedMessage);
  }

  messages(): readonly TranscriptMessage[] {
    return this._messages.map(cloneMessage);
  }

  tokensByTier(): TokenTotals {
    const totals: TokenTotals = { cheap: 0, premiumReasoning: 0, premiumExecution: 0 };
    for (const msg of this._messages) {
      if (msg.tokens == null || msg.modelTier == null) continue;
      if (msg.modelTier === ModelTier.Cheap) totals.cheap += msg.tokens;
      else if (msg.modelTier === ModelTier.PremiumReasoning) totals.premiumReasoning += msg.tokens;
      else if (msg.modelTier === ModelTier.PremiumExecution) totals.premiumExecution += msg.tokens;
    }
    return totals;
  }

  static fromMessages(msgs: TranscriptMessage[]): Transcript {
    const t = new Transcript();
    t._messages = msgs.map(cloneMessage);
    return t;
  }
}
