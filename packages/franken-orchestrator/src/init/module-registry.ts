import type { InitModuleId } from './init-types.js';

export interface InitModuleDefinition {
  id: InitModuleId;
  label: string;
  description: string;
}

const INIT_MODULES: readonly InitModuleDefinition[] = [
  {
    id: 'chat',
    label: 'Chat',
    description: 'Enable the local chat runtime and chat server defaults.',
  },
  {
    id: 'dashboard',
    label: 'Dashboard',
    description: 'Enable the dashboard web app and its API connection defaults.',
  },
  {
    id: 'comms',
    label: 'Comms',
    description: 'Enable comms transport setup for supported external channels.',
  },
];

export function listInitModules(): readonly InitModuleDefinition[] {
  return INIT_MODULES;
}
