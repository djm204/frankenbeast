interface BasicCredential {
  username: string;
  password: string;
}

export function credentialRedactionNeedles(credential: BasicCredential): string[] {
  const rawCredential = `${credential.username}:${credential.password}`;
  const basicMaterial = Buffer.from(rawCredential).toString('base64');
  return [...new Set([
    credential.password,
    rawCredential,
    basicMaterial,
    `Basic ${basicMaterial}`,
  ])];
}
