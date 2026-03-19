# RecordPool

Phygital music record provenance — NFC chip tap → onchain EAS attestation → royalty split via 0xSplits.

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
