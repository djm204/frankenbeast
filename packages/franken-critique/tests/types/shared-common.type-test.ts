import { createScore, createSessionId } from '@franken/types';
import type {
  Score as SharedScore,
  SessionId as SharedSessionId,
} from '@franken/types';
import type {
  Score as CritiqueScore,
  SessionId as CritiqueSessionId,
} from '../../src/types/common.js';

type Equal<Left, Right> = [Left] extends [Right]
  ? [Right] extends [Left]
    ? true
    : false
  : false;
type Assert<Condition extends true> = Condition;

type ScoreUsesSharedContract = Assert<Equal<CritiqueScore, SharedScore>>;
type SessionIdUsesSharedContract = Assert<
  Equal<CritiqueSessionId, SharedSessionId>
>;

const score: CritiqueScore = createScore(0.5);
const sessionId: CritiqueSessionId = createSessionId('critique-session');

// @ts-expect-error A critique Score must not accept an unbranded number.
const unbrandedScore: CritiqueScore = 0.5;
// @ts-expect-error A critique SessionId must not accept an unbranded string.
const unbrandedSessionId: CritiqueSessionId = 'critique-session';

void (0 as unknown as ScoreUsesSharedContract);
void (0 as unknown as SessionIdUsesSharedContract);
void score;
void sessionId;
void unbrandedScore;
void unbrandedSessionId;
