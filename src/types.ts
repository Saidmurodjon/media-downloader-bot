export type Language = 'uz' | 'ru' | 'en';

export interface User {
  id?: number;
  chatId: number;
  username: string | null;
  firstName: string;
  language: Language;
  isAdmin: number;
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

// Local download (VPS): file is on disk
export interface DownloadResultLocal {
  kind: 'local';
  filePath: string;
  sessionDir: string;
  mediaType: 'video' | 'photo' | 'audio';
}

// Remote download (Workers): direct URL to pass to Telegram
export interface DownloadResultRemote {
  kind: 'remote';
  url: string;
  filename?: string;
  mediaType: 'video' | 'photo' | 'audio';
}

export type DownloadResult = DownloadResultLocal | DownloadResultRemote;

export type DownloaderFn = (url: string) => Promise<DownloadResult>;
