import { useMemo } from 'react';
import { SmartSwarmApiClient } from '../../lib/smart-swarm-api';
import { SmartSwarmPage } from '../../pages/smart-swarm-page';

interface SmartSwarmRouteProps {
  baseUrl: string;
}

export function SmartSwarmRoute({ baseUrl }: SmartSwarmRouteProps) {
  const client = useMemo(() => new SmartSwarmApiClient(baseUrl), [baseUrl]);
  return <SmartSwarmPage client={client} />;
}
