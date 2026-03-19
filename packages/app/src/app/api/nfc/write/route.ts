import { NextRequest } from 'next/server'
import { initNFC, getActiveReaders, getConnectCallbacks, writeNdefToNtag } from '@/lib/nfc-server'

// GET /api/nfc/write?url=<encoded>
// Returns an SSE stream with events:
//   waiting      — reader is ready, tap the chip now
//   writing      — write in progress
//   done         — write succeeded (data = UID hex)
//   write_error  — write failed (data = error message)
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) return new Response('Missing url param', { status: 400 })

  initNFC()

  const enc = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: string) => {
        try {
          controller.enqueue(enc.encode(`event: ${event}\ndata: ${data}\n\n`))
        } catch {}
      }

      let settled = false
      const cardHandlers = new Map<string, () => void>()

      const cleanup = () => {
        getConnectCallbacks().delete(onNewReader)
        for (const [name, h] of cardHandlers) {
          const r = getActiveReaders().get(name)
          if (r) r.off('card', h)
        }
      }

      const attachToReader = (reader: any) => {
        const handler = async () => {
          if (settled) return
          settled = true
          cleanup()

          send('writing', 'in_progress')
          try {
            await writeNdefToNtag(reader, url)

            // Read back UID to confirm
            const uidResp = await reader.transmit(
              Buffer.from([0xFF, 0xCA, 0x00, 0x00, 0x00]), 256
            )
            const uid = uidResp.slice(0, -2).toString('hex').toUpperCase()

            send('done', uid)
          } catch (e: any) {
            send('write_error', e?.message ?? 'Write failed')
          }
          try { controller.close() } catch {}
        }
        reader.on('card', handler)
        cardHandlers.set(reader.name, handler)
      }

      for (const reader of getActiveReaders().values()) {
        attachToReader(reader)
      }

      const onNewReader = (reader: any) => attachToReader(reader)
      getConnectCallbacks().add(onNewReader)

      send('waiting', 'tap_chip')

      return () => {
        settled = true
        cleanup()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    },
  })
}
