import ipaddr from 'ipaddr.js';

export function isPublicIpAddress(address: string): boolean {
  if (!ipaddr.isValid(address)) return false;
  return ipaddr.process(address).range() === 'unicast';
}
