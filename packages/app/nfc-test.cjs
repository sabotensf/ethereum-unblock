const { NFC } = require('nfc-pcsc')

const nfc = new NFC()

console.log('Waiting for reader...')

nfc.on('reader', (reader) => {
  console.log('Reader:', reader.name)

  reader.autoProcessing = false

  reader.on('card', async (card) => {
    try {
      // GET UID APDU command
      const response = await reader.transmit(Buffer.from([0xFF, 0xCA, 0x00, 0x00, 0x00]), 256)
      // Last 2 bytes are status (90 00 = success), UID is the rest
      const uid = response.slice(0, -2).toString('hex').toUpperCase()
      const formatted = uid.match(/.{2}/g).join(':')
      console.log('UID:', formatted)
    } catch (e) {
      console.error('Failed to read UID:', e.message)
    }
  })

  reader.on('error', (err) => {
    console.error('Reader error:', err)
  })
})

nfc.on('error', (err) => {
  console.error('NFC error:', err)
})

console.log('Tap a chip now...')
setTimeout(() => process.exit(0), 15000)
