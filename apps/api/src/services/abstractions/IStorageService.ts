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

  async deleteFile(storageKey: string): Promise<boolean> {
    const target = path.join(this.baseDir, storageKey);
    if (fs.existsSync(target)) {
      await fs.promises.unlink(target);
      return true;
    }
    return false;
  }
}
