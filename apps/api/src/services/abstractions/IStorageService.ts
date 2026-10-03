import fs from 'fs';
import path from 'path';

export interface StorageUploadResult {
  fileUrl: string;
  storageKey: string;
  fileSize: number;
  mimeType: string;
}

export interface IStorageService {
  uploadFile(file: {
    originalname: string;
    buffer: Buffer;
    mimetype: string;
    size: number;
  }): Promise<StorageUploadResult>;
  getFileUrl(storageKey: string): Promise<string>;
  readFile(storageKey: string): Promise<Buffer | null>;
  deleteFile(storageKey: string): Promise<boolean>;
}

/**
 * Local Disk Storage Implementation (Default for development)
 * Easily swappable with S3StorageService or CloudinaryStorageService
 */
export class LocalStorageService implements IStorageService {
  private baseDir: string;
  private baseUrl: string;

  constructor(baseDir = './uploads', baseUrl = 'http://localhost:4000/uploads') {
    this.baseDir = path.resolve(baseDir);
    this.baseUrl = baseUrl;
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  async uploadFile(file: {
    originalname: string;
    buffer: Buffer;
    mimetype: string;
    size: number;
  }): Promise<StorageUploadResult> {
    const timestamp = Date.now();
    const sanitizedFilename = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storageKey = `${timestamp}-${sanitizedFilename}`;
    const destinationPath = path.join(this.baseDir, storageKey);

    await fs.promises.writeFile(destinationPath, file.buffer);

    return {
      fileUrl: `${this.baseUrl}/${storageKey}`,
      storageKey,
      fileSize: file.size,
      mimeType: file.mimetype,
    };
  }

  async getFileUrl(storageKey: string): Promise<string> {
    return `${this.baseUrl}/${storageKey}`;
  }

  async readFile(storageKey: string): Promise<Buffer | null> {
    const target = this.resolveStorageKey(storageKey);
    try {
      return await fs.promises.readFile(target);
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async deleteFile(storageKey: string): Promise<boolean> {
    const target = this.resolveStorageKey(storageKey);
    if (fs.existsSync(target)) {
      await fs.promises.unlink(target);
      return true;
    }
    return false;
  }

  private resolveStorageKey(storageKey: string) {
    const target = path.resolve(this.baseDir, storageKey);
    if (!target.startsWith(`${this.baseDir}${path.sep}`)) {
      throw new Error('Invalid storage key');
    }
    return target;
  }
}

export const privateDocumentStorage = new LocalStorageService(
  path.resolve(__dirname, '../../../..', 'private-uploads'),
  ''
);

export function isSupportedProcurementFile(file: {
  originalname: string;
  buffer: Buffer;
  mimetype: string;
}): boolean {
  const extension = path.extname(file.originalname).toLowerCase();
  const signatures: Record<string, { mimeType: string; matches: (buffer: Buffer) => boolean }> = {
    '.pdf': { mimeType: 'application/pdf', matches: (buffer) => buffer.subarray(0, 5).toString() === '%PDF-' },
    '.png': { mimeType: 'image/png', matches: (buffer) => buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) },
    '.jpg': { mimeType: 'image/jpeg', matches: (buffer) => buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
    '.jpeg': { mimeType: 'image/jpeg', matches: (buffer) => buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
  };
  const signature = signatures[extension];
  return !!signature && file.mimetype.toLowerCase() === signature.mimeType && signature.matches(file.buffer);
}
