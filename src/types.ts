export type Language = 'uz' | 'ru' | 'en';

export interface User {
  id?: number;
  chatId: number;
  username: string | null;
  firstName: string;
  language: Language;
  isAdmin: number; // 0 or 1 (SQLite boolean)
  createdAt?: string;
}

export interface MediaCache {
  id?: number;
  urlHash: string;
  fileId: string;
  mediaType: 'video' | 'photo' | 'audio';
  createdAt?: string;
}

export interface DbAdapter {
  init(): Promise<void>;
  getUser(chatId: number): Promise<User | null>;
  createUser(user: Omit<User, 'id' | 'createdAt'>): Promise<void>;
  updateUser(chatId: number, data: Partial<Pick<User, 'language' | 'isAdmin'>>): Promise<void>;
  getAllUsers(): Promise<User[]>;
  getUserCount(): Promise<number>;
  getCachedMedia(urlHash: string): Promise<MediaCache | null>;
  setCachedMedia(urlHash: string, fileId: string, mediaType: MediaCache['mediaType']): Promise<void>;
}

export class DownloadError extends Error {
  constructor(
    message: string,
    public readonly kind: 'unsupported' | 'too_large' | 'generic',
  ) {
    super(message);
    this.name = 'DownloadError';
  }
}

export interface DownloadResult {
  filePath: string;
  mediaType: 'video' | 'photo' | 'audio';
}
