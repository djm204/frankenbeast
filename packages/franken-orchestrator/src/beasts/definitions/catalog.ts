import type { BeastDefinition } from '../types.js';
import { chunkPlanDefinition } from './chunk-plan-definition.js';
import { designInterviewDefinition } from './design-interview-definition.js';
import { martinLoopDefinition } from './martin-loop-definition.js';

export const BEAST_DEFINITIONS: readonly BeastDefinition[] = [
  designInterviewDefinition,
  chunkPlanDefinition,
  martinLoopDefinition,
];
