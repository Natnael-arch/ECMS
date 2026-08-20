import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { PassThrough } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export type StoredObject = {
  key: string;
  size: number;
  mimeType: string;
  sha256: string;
  url: string;
};

export interface ObjectDriver {
  put(key: string, data: Buffer | ReadableStream, mimeType: string): Promise<StoredObject>;
  get(key: string): Promise<{ body: Buffer; mimeType: string }>;
  del(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

export function sha256Of(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

class LocalDriver implements ObjectDriver {
  private root = resolve(process.env.STORAGE_PATH || 'storage');

  private resolveKey(key: string) {
    const normalized = relative(this.root, resolve(this.root, key));
    if (normalized.startsWith('..') || normalized.includes('..' + sep)) {
      throw new Error('Invalid object key.');
    }
    return join(this.root, key);
  }

  async put(key: string, data: Buffer | ReadableStream, mimeType: string): Promise<StoredObject> {
    const full = this.resolveKey(key);
    await mkdir(dirname(full), { recursive: true });
    if (data instanceof Buffer) {
      await writeFile(full, data);
    } else {
      const chunks: Buffer[] = [];
      await pipeline(data as any, new PassThrough().on('data', (c: any) => chunks.push(Buffer.from(c))));
      await writeFile(full, Buffer.concat(chunks));
    }
    const size = (await stat(full)).size;
    const hash = sha256Of(await readFile(full));
    return { key, size, mimeType, sha256: hash, url: `/api/files?key=${encodeURIComponent(key)}` };
  }

  async get(key: string) {
    const body = await readFile(this.resolveKey(key));
    return { body, mimeType: 'application/octet-stream' };
  }

  async del(key: string) {
    await rm(this.resolveKey(key), { force: true });
  }

  async exists(key: string) {
    try {
      await stat(this.resolveKey(key));
      return true;
    } catch {
      return false;
    }
  }
}

let driver: ObjectDriver | null = null;

export function getObjectDriver(): ObjectDriver {
  if (driver) return driver;
  driver = new LocalDriver();
  return driver;
}
