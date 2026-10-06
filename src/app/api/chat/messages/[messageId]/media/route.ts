import { getChatMedia } from '@/lib/chat/media-response';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  context: { params: Promise<{ messageId: string }> }
) {
  return getChatMedia(request, context);
}
