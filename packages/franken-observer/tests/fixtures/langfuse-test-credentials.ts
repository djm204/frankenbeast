const defaultLangfusePublicKey = ['langfuse', 'public', 'fixture'].join('-');
const defaultLangfuseSecretKey = ['langfuse', 'secret', 'fixture'].join('-');

export const LANGFUSE_PUBLIC_KEY = process.env['LANGFUSE_PUBLIC_KEY']
  ?? defaultLangfusePublicKey;

export const LANGFUSE_SECRET_KEY = process.env['LANGFUSE_SECRET_KEY']
  ?? defaultLangfuseSecretKey;
