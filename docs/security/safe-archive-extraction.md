# Safe archive extraction

Frankenbeast archive and artifact consumers should use the orchestrator safe archive helper before writing user-supplied archive contents to disk.

Current helper:

- `extractZipArchive(archive, destination, overrides)` in `@franken/orchestrator`
- Supports regular ZIP entries compressed with STORE or DEFLATE.
- Rejects encrypted, symlink, unsupported-method, path-traversal, absolute-path, and nested-archive entries.
- Performs a central-directory preflight before writing files so limit failures are rejected before extracted content is created where feasible.
- Writes with exclusive creation (`wx`) to avoid silently overwriting an existing destination file.

## Default limits

The default limits are intentionally conservative for operator-supplied artifacts:

| Limit | Default | Purpose |
| --- | ---: | --- |
| `maxArchiveBytes` | 50 MiB | Bounds compressed input accepted into the extractor. |
| `maxTotalUncompressedBytes` | 250 MiB | Bounds zip-bomb expansion across all extracted files. |
| `maxFileBytes` | 25 MiB | Bounds any single extracted file. |
| `maxFileCount` | 10,000 files | Bounds regular file count. |
| `maxDirectoryCount` | 10,000 directories | Bounds explicit and implicit directory/inode creation. |
| `maxNestingDepth` | 0 | Rejects archive-looking entries such as `.zip`, `.jar`, `.war`, `.apk`, `.whl`, `.tar`, `.tgz`, `.gz`, `.bz2`, `.xz`, `.zst`, `.7z`, and `.rar`, including leading-dot names. |

## Override policy

Consumers may pass explicit overrides when they have a trusted environment or a narrower product-specific budget. Do not raise limits globally for convenience. Prefer setting the smallest limits that match the caller's artifact contract, and surface those limits in the caller's operator documentation or config help.

For untrusted uploads or remote artifacts:

1. Keep `maxNestingDepth: 0` unless a later recursive extractor handles nested archives with the same preflight accounting.
2. Set `maxArchiveBytes` below the maximum request body size for that endpoint.
3. Set `maxTotalUncompressedBytes` below the available scratch-disk budget.
4. Extract into a new empty destination directory and promote the result only after extraction succeeds.
5. Treat `SafeArchiveExtractionError` as a client/input failure, not an internal retryable error.

## Example

```ts
import { extractZipArchive } from '@franken/orchestrator';

await extractZipArchive(uploadBuffer, stagingDir, {
  maxArchiveBytes: 10 * 1024 * 1024,
  maxTotalUncompressedBytes: 50 * 1024 * 1024,
  maxFileBytes: 5 * 1024 * 1024,
  maxFileCount: 1_000,
  maxDirectoryCount: 1_000,
  maxNestingDepth: 0,
});
```
