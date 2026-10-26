# Retirement Rebuild

Retirement Rebuild is an evidence-driven investment research and portfolio-management application built with Next.js, Supabase, and Vercel. AI research and independent Investment Committee decisions establish **ownership merit** (BUY/WATCH/REJECT); deterministic portfolio engines exclusively determine purchase eligibility and sizing. **AI does not allocate dollars or shares.**

The Real Long-Term portfolio is undergoing controlled real-money testing, beginning at $200. The user independently places trades at E*TRADE and manually records actual fills. No automated real-money brokerage execution is authorized. Accelerated Growth (AG) is a separate paper-only research and portfolio strategy; other paper portfolios and VOO remain controls.

AG research progresses through quantitative Discovery, Catalyst Research, Deep Research, and Investment Committee review. The sustained-high-growth qualification pathway admitted VRT to a successful read-only sequence on October 26, 2026: ADVANCE → SUPPORTED → PROCEED → BUY. **This BUY was not persisted as an active investment decision, was not allocated, and was not traded.** A research result, persisted decision, eligible sized proposal and executed transaction are distinct lifecycle states.

The current AG engineering focus is verification of read-only deterministic BUY sizing and its paper-portfolio risk controls. Normal AG daily-cycle transaction execution remains disabled; do not invoke the separate write-capable paper execution function for diagnostics. See the linked operational status for audited functions, current limitations, safety restrictions and next steps.

For strategic decisions and current verified status, read [the vision and governing principles](docs/RETIREMENT_REBUILD_VISION.md) and [the operational status and cross-session handoff](docs/RETIREMENT_REBUILD_OPERATIONAL_STATUS.md) before modifying any research, allocation, or execution workflow.

---

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
