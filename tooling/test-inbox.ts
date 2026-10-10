import { createServer } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { link, mkdir, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import {
  recordingSchema,
  fingerprintRecordSchema,
} from '@turn/positioning-core';

// Development-only, write-only receiver. Filenames never come from the client.
export function createTestInbox(
  directory: string,
  token: string,
  maxBytes = 32 * 1024 * 1024,
) {
  return createServer(async (request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader(
      'Access-Control-Allow-Headers',
      'Authorization, Content-Type',
    );
    response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.setHeader('Cache-Control', 'no-store');
    const reply = (status: number, body: object) => {
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(body));
    };
    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }
    if (
      !['/runs', '/fingerprints'].includes(request.url ?? '') ||
      request.method !== 'POST'
    ) {
      reply(404, { error: 'Not found' });
      return;
    }
    if (request.headers.authorization !== `Bearer ${token}`) {
      reply(401, {
        error: 'Pairing expired. Reload TURN from the current Expo QR.',
      });
      return;
    }
    try {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > maxBytes) {
          reply(413, { error: 'Run exceeds 32 MB. Use file sharing.' });
          return;
        }
        chunks.push(chunk);
      }
      const bytes = Buffer.concat(chunks);
      const parsed = (
        request.url === '/fingerprints'
          ? fingerprintRecordSchema
          : recordingSchema
      ).safeParse(JSON.parse(bytes.toString('utf8')));
      if (!parsed.success) {
        reply(400, { error: 'Invalid TURN recording' });
        return;
      }
      if (
        ['preparing', 'ready', 'collecting', 'querying'].includes(
          ('nativePedometer' in parsed.data
            ? parsed.data.nativePedometer?.status
            : '') ?? '',
        )
      ) {
        reply(409, {
          error:
            'Finish this run and wait for its native count before sending.',
        });
        return;
      }
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      await mkdir(directory, { recursive: true });
      let duplicate = false;
      const temporary = join(directory, `${randomUUID()}.partial`);
      try {
        await writeFile(temporary, bytes, { flag: 'wx', flush: true });
        // Publish only a complete, flushed file; concurrent retries cannot overwrite it.
        try {
          await link(temporary, join(directory, `${sha256}.json`));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
          duplicate = true;
        }
      } finally {
        await unlink(temporary).catch(() => {});
      }
      reply(200, {
        stored: true,
        sha256,
        duplicate,
        sessionId: parsed.data.sessionId,
      });
    } catch (error) {
      reply(error instanceof SyntaxError ? 400 : 500, {
        error:
          error instanceof SyntaxError
            ? 'Invalid JSON'
            : 'Could not save run on computer. Retry.',
      });
    }
  });
}
