export type ScanMode = 'block' | 'redact';

export type ScanResult =
  | { clean: true }
  | { clean: false; mode: ScanMode; fields: string[] };

export interface IPiiScanner {
  scan(data: unknown): Promise<ScanResult>;
}
