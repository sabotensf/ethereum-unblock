import { initNFC, getActiveReaders, getEndCallbacks, getConnectCallbacks } from '@/lib/nfc-server'

function formatUID(hexStr: string): string {
  return hexStr.match(/.{2}/g)?.join(':').toLowerCase() ?? hexStr
}

export async function GET() {
  let nfc: ReturnType<typeof initNFC>
  try {
    nfc = initNFC()
  } catch {
    return new Response('NFC unavailable', { status: 503 })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      const send = (uid: string) => {
        try {
          controller.enqueue(encoder.encode(`data: ${uid}\n\n`))
        } catch {}
      }

      const cardHandlers = new Map<string, () => void>()

      const attachToReader = (reader: any) => {
        const handler = async () => {
          try {
            const response = await reader.transmit(
              Buffer.from([0xFF, 0xCA, 0x00, 0x00, 0x00]), 256
            )
            send(formatUID(response.slice(0, -2).toString('hex')))
          } catch (err) { console.error('[nfc] card read error:', err) }
        }
        reader.on('card', handler)
        cardHandlers.set(reader.name, handler)
      }

      for (const reader of getActiveReaders().values()) {
        attachToReader(reader)
      }

      const onNewReader = (reader: any) => {
        attachToReader(reader)
        try {
          controller.enqueue(encoder.encode(`event: reader_connect\ndata: ${reader.name}\n\n`))
        } catch {}
      }
      getConnectCallbacks().add(onNewReader)

      const onReaderEnd = (name: string) => {
        try {
          controller.enqueue(encoder.encode(`event: reader_end\ndata: ${name}\n\n`))
        } catch {}
      }
      getEndCallbacks().add(onReaderEnd)

      return () => {
        getConnectCallbacks().delete(onNewReader)
        getEndCallbacks().delete(onReaderEnd)
        for (const [name, handler] of cardHandlers) {
          const reader = getActiveReaders().get(name)
          if (reader) reader.off('card', handler)
        }
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
