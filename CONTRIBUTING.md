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
```

## Project conventions

- **Privacy is non-negotiable.** No dependency, code path, or feature should cause a file (or any derived data from it) to leave the browser. If a change would require a network call for anything other than loading the app's own static assets, it doesn't belong here.
- **TypeScript throughout**, no `any` unless truly unavoidable.
- Prefer small, focused components. See `src/components/pages/` for the wizard steps and `src/lib/redaction/` for the detection pipeline.
- New PII detectors go in `src/lib/redaction/patterns.ts` (regex-based) or `src/lib/redaction/nlp.ts` (compromise-based), and get wired into the `DETECTORS` map and `CATEGORY_PRIORITY` in `src/lib/redaction/redact.ts`, plus `CATEGORY_META`/`ALL_CATEGORIES` in `src/lib/redaction/categoryMeta.ts` and `options.ts`.

## Reporting bugs / false positives / false negatives

Detection is heuristic (regex + lightweight NLP), so it will sometimes miss real PII or flag something that isn't. If you find a case, please open an issue with:
- The category involved (email, phone, name, etc.)
- A **synthetic** example that reproduces it — please don't paste real personal data into an issue
- What you expected vs. what happened

## Pull requests

- Keep PRs focused — one feature or fix per PR is easier to review.
- Describe what changed and why in the PR description.
- If you're adding a new PII category or detector, a short note on its expected false-positive/false-negative tradeoffs is appreciated.
