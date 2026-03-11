import type { NetworkMode } from '../network/network-config.js';

export type InitModuleId = 'chat' | 'dashboard' | 'comms';
export type KnownCommsTransportId = 'slack' | 'discord' | 'telegram' | 'whatsapp';
export type SupportedCommsTransportId = 'slack' | 'discord';
export type InitStepId =
  | 'module-selection'
  | 'provider-config'
  | 'security-selection'
  | 'comms-transport-selection'
  | 'secret-backend-selection';

export interface InitVerificationState {
  status: 'unknown' | 'passed' | 'failed';
  messages: string[];
}

export interface InitState {
  version: 1;
  configPath: string;
  selectedModules: InitModuleId[];
  selectedCommsTransports: SupportedCommsTransportId[];
  completedSteps: InitStepId[];
  securityMode: NetworkMode;
  verification: InitVerificationState;
  answers: Record<string, unknown>;
}

export function createEmptyInitState(configPath: string): InitState {
  return {
    version: 1,
    configPath,
    selectedModules: [],
    selectedCommsTransports: [],
    completedSteps: [],
    securityMode: 'secure',
    verification: {
      status: 'unknown',
      messages: [],
    },
    answers: {},
  };
}
