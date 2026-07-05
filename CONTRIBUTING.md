# Contributing

Thanks for considering a contribution to WeatherView. This is a small,
solo-maintained project, so the process is intentionally lightweight.

## Getting set up

See the [README](README.md#setup) for environment setup - you'll need
Python 3.11+ and an OpenWeatherMap API key.

```bash
uv sync                          # or: pip install -r requirements.txt
cp .env.example .env              # then fill in WEATHER_API_KEY
.venv/bin/python -m pytest        # run the test suite before you start
```

## Before opening a PR

- **Run the test suite.** `.venv/bin/python -m pytest` (must be run with
  `python -m pytest`, not a bare `pytest` - see the README for why).
- **Keep changes scoped.** A bug fix shouldn't carry along an unrelated
  refactor or rewrite - smaller, focused PRs are much easier to review and
  merge.
- **Match the existing style.** No linter/formatter is configured; follow
  the conventions already in the surrounding file (naming, comment density,
  how errors are surfaced to the user).
- **Manual test the UI for frontend changes.** There's no frontend test
  suite - if you touch `static/js/` or `templates/`, actually load the page
  and click through the change (and check both light/dark mode, and at
  least one mobile width) before opening the PR.
- **Don't commit secrets.** `.env`, API keys, and anything under `instance/`
  (the local SQLite cache/rate-limit files) should never be committed -
  they're already gitignored, but double-check `git status` before pushing.

## Reporting bugs / requesting features

Open a [GitHub issue](https://github.com/yashmore18/WeatherView/issues) with:
- What you expected vs. what happened
- Steps to reproduce (for bugs)
- Browser/device, if it's a frontend issue

For security vulnerabilities, see [SECURITY.md](SECURITY.md) instead of
opening a public issue.

## Code of conduct

Be respectful and constructive. Disagreements about approach are fine and
expected - personal attacks aren't.
