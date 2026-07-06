const token = (...parts: string[]) => parts.join('-');

export const DASHBOARD_OPERATOR_TOKEN = process.env['DASHBOARD_OPERATOR_TOKEN']
  ?? token('dashboard', 'operator', 'fixture');

export const CHAT_OPERATOR_TOKEN = process.env['CHAT_OPERATOR_TOKEN']
  ?? token('chat', 'operator', 'fixture');

export const BEAST_OPERATOR_TOKEN = process.env['BEAST_OPERATOR_TOKEN']
  ?? token('beast', 'operator', 'fixture');

export const SHARED_OPERATOR_TOKEN = process.env['SHARED_OPERATOR_TOKEN']
  ?? token('shared', 'operator', 'fixture');
