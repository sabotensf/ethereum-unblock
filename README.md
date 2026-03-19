# Ethereum Unblock — RecordPool EAS

Built at [Ethereum Unblock: AI-driven Design Sprint](https://lu.ma/unblock-sf-2026) — a 3-day hackathon hosted at Frontier Tower, San Francisco (March 10–12, 2026), organized by the Ethereum Foundation and Ethereum House SF. The event brought together builders and domain experts to explore how AI, smart contracts, and programmable cryptography can unlock new capabilities on Ethereum.

RecordPool EAS is my project from that event: phygital music record provenance — NFC chip tap → onchain EAS attestation → royalty split via 0xSplits.

Bootstrapped quickly using [Nexth](https://github.com/usecaselab/nexth) from the Ethereum Use Case Lab — a Next.js + Ethereum starter kit.

## Stack

- Next.js 15 (App Router)
- Ethereum Attestation Service (EAS)
- 0xSplits
- NTAG SDM NFC chips
- Wagmi / Viem / WalletConnect

## Dev

```bash
bun dev    # Next.js dev server (HMR — use for UI work only)
bun prod   # Production build + start (use for NFC tap testing)
```

## Environment

Copy `.env.local` and fill in your keys:

```
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=
NEXT_PUBLIC_EAS_SCHEMA_UID=
```
