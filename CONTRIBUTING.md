# Contributing to CursRO

Thanks for helping. Small, focused pull requests are the easiest to review.

## Setup

You only need Node.js 20 or newer; there are no dependencies to install.

```bash
npm test          # run the tests
npm run update    # download missing rates into data/
npm run site      # build the site into _site/
npx serve _site   # preview it
```

## Rules

- Do not edit files in `data/` by hand. They are written by `scripts/update.mjs`; if a rate looks wrong, open an issue with the date and currency.
- Changes to the parser or the update script need a test in `test/`, using a BNR-format fixture.
- By participating you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
