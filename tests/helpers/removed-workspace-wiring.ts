export type WiringFile = {
  path: string;
  content: string;
};

export type RemovedWorkspaceReference = {
  path: string;
  reference: string;
};

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

export const findRemovedWorkspaceReferences = (
  files: readonly WiringFile[],
  removedReferences: readonly string[],
): RemovedWorkspaceReference[] => {
  const matches: RemovedWorkspaceReference[] = [];

  for (const file of files) {
    for (const reference of removedReferences) {
      const exactReference = new RegExp(
        `(?<![A-Za-z0-9_-])${escapeRegExp(reference)}(?![A-Za-z0-9_-])`,
        "u",
      );
      if (exactReference.test(file.content)) {
        matches.push({ path: file.path, reference });
      }
    }
  }

  return matches;
};
