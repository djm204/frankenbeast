export async function confirmYesNo(
  question: string,
  ask: (question: string) => Promise<string>,
): Promise<boolean> {
  const answer = (await ask(question)).trim().toLowerCase();
  return answer === 'y' || answer === 'yes';
}
