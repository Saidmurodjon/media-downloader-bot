import { InputFile } from 'grammy';
import type { Context } from 'grammy';

export type FileType = 'video' | 'audio' | 'photo';

export async function forwardCachedMedia(
  ctx: Context,
  fileId: string,
  fileType: FileType,
  caption?: string,
): Promise<void> {
  switch (fileType) {
    case 'video':
      await ctx.replyWithVideo(fileId, caption ? { caption } : {});
      break;
    case 'audio':
      await ctx.replyWithAudio(fileId, caption ? { caption } : {});
      break;
    case 'photo':
      await ctx.replyWithPhoto(fileId, caption ? { caption } : {});
      break;
  }
}

export async function uploadMedia(
  ctx: Context,
  filePath: string,
  fileType: FileType,
  caption?: string,
): Promise<string> {
  const file = Bun.file(filePath);
  const blob = await file.arrayBuffer();
  const name = filePath.split('/').pop() ?? 'file';

  switch (fileType) {
    case 'video': {
      const msg = await ctx.replyWithVideo(
        new InputFile(Buffer.from(blob), name),
        caption ? { caption } : {},
      );
      const video = msg.video;
      if (!video) throw new Error('No video in response');
      return video.file_id;
    }
    case 'audio': {
      const msg = await ctx.replyWithAudio(
        new InputFile(Buffer.from(blob), name),
        caption ? { caption } : {},
      );
      const audio = msg.audio;
      if (!audio) throw new Error('No audio in response');
      return audio.file_id;
    }
    case 'photo': {
      const msg = await ctx.replyWithPhoto(
        new InputFile(Buffer.from(blob), name),
        caption ? { caption } : {},
      );
      const photos = msg.photo;
      if (!photos?.length) throw new Error('No photo in response');
      return photos[photos.length - 1]!.file_id;
    }
  }
}
