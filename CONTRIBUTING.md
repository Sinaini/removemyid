# Contributing to RemoveMyID

Thanks for considering a contribution! This project is a small, static, client-only app — there's no backend, no accounts, no infrastructure to worry about.

## Getting set up

```bash
git clone https://github.com/Sinaini/removemyid.git
cd removemyid
npm install
npm run dev
```

Before opening a PR, make sure the following pass locally:

```bash
npm run build   # typechecks (tsc -b) and produces a production build
npm run lint    # oxlint
npm test        # vitest — detector and pipeline unit tests
```

## Project conventions

- **Privacy is non-negotiable.** No dependency, code path, or feature should cause a file (or any derived data from it) to leave the browser. If a change would require a network call for anything other than loading the app's own static assets, it doesn't belong here.
- **TypeScript throughout**, no `any` unless truly unavoidable.
- Prefer small, focused components. See `src/components/pages/` for the wizard steps and `src/lib/redaction/` for the detection pipeline.
- **`src/lib/redaction/` and `src/lib/pipeline/` must stay DOM-free.** They run inside a Web Worker as well as on the main thread. `purity.test.ts` enforces this by importing every such module in a Node environment, so a stray `document` reference fails the test suite rather than only breaking inside the worker.

### Adding a PII category

Three changes:

1. Add the name to the `PIICategory` union in `src/types/index.ts`.
2. Write the detector in `src/lib/redaction/patterns.ts` (regex) or `nlp.ts` (compromise-based), then add an entry to `CATEGORY_DEFS` in `src/lib/redaction/registry.ts`. Everything else — the category list, default options, summary counts, display names, replacement labels, grouping — is derived from that entry.
3. Add an icon to `CATEGORY_ICONS` in `src/lib/redaction/categoryMeta.ts`.

Both maps are `Record<PIICategory, …>`, so forgetting either one is a compile error. `registry.test.ts` additionally asserts that priorities are unique — a duplicate would make overlap resolution depend on object key order.

Two things worth knowing before you pick a `priority` (lower wins when spans overlap):

- Precise, format-driven regex categories should outrank NLP guesses, and a more specific pattern should outrank a more permissive one that also matches it. `ssn` outranks `phone` because `XXX-XX-XXXX` always also satisfies the phone pattern; `date` outranks `phone` for the same reason with `01.01.1990`.
- If your detector uses a checksum or any other validator, note that a rejected candidate is retried one character to the right rather than being skipped over (see `execAll` in `patterns.ts`). Without that, a failed checksum silently swallows the span and no shorter valid match is ever considered.

## Reporting bugs / false positives / false negatives

Detection is heuristic (regex + lightweight NLP), so it will sometimes miss real PII or flag something that isn't. If you find a case, please open an issue with:
- The category involved (email, phone, name, etc.)
- A **synthetic** example that reproduces it — please don't paste real personal data into an issue
- What you expected vs. what happened

## Pull requests

- Keep PRs focused — one feature or fix per PR is easier to review.
- Describe what changed and why in the PR description.
- If you're adding a new PII category or detector, a short note on its expected false-positive/false-negative tradeoffs is appreciated.
