# Site Blocker

A Manifest V3 extension for Brave (or any Chromium browser) that blocks time-wasting sites and shows where your time goes.

- **Quick toggles** for common sites: YouTube, Reddit, X/Twitter, Facebook, Instagram, TikTok, Netflix, Twitch, LinkedIn, Hacker News, and more. YouTube is on by default.
- **Custom patterns** using globs or regular expressions, so you can block whole domains, subdomains, partial domains, or specific paths.
- **Block this site** button in the popup for the current tab.
- Blocking happens at the network level (`declarativeNetRequest`). It also covers in-app navigation on single-page sites like YouTube and Reddit, and tabs that are already open when you add a rule.

## Usage tracking

The extension records how long you spend on each site (hostname only, never full URLs):

- Time counts only while Brave is the focused app, for the active tab. It pauses after 60 seconds without input, unless the tab is playing audio, so watching videos still counts. It stops when the screen is locked.
- It also records visits (switching to a site) and blocked attempts (each time the block page is shown).
- The **Usage dashboard** (from the popup or the settings page) shows Today, Yesterday, 7 days, or 30 days: total time, daily average, most-used site, blocked attempts, an hourly or daily chart, and a per-site table with a one-click **Block** button. The popup shows today's total and your top 3 sites.
- Data lives in `chrome.storage.local` on this device only. Each browser profile tracks separately. Days older than 90 are pruned automatically, and the dashboard has a **Clear usage data** button.

## Install

1. Open `brave://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this folder.
4. Optional: pin the extension from the puzzle-piece menu.

After editing the source, click the reload icon on the extension's card.

## Pattern syntax

Enter one pattern per line on the settings page. Lines starting with `#` are comments.

| Pattern | Blocks |
| --- | --- |
| `example.com` | example.com and all its subdomains |
| `*.example.com` | only subdomains, not example.com itself |
| `*tube.com` | any domain ending in "tube.com" |
| `reddit.*` | any top-level domain (reddit.com, reddit.co.uk, …) |
| `youtube.com/shorts` | URLs whose path starts with `/shorts` |
| `reddit.com/r/*/comments` | `*` matches anything, including `/` |
| `/regex/` | a regular expression tested against the full URL, case-insensitive |

Glob patterns match both `http` and `https`, and any leading scheme you type is ignored. Regexes use the browser's RE2 engine, which does not support lookaheads or backreferences. The settings page flags any pattern that can't be used.

## Files

- `background.js`: rebuilds the blocking rules whenever settings change and handles single-page-app URL changes.
- `lib/patterns.js`: presets and the glob/regex compiler. It has no browser APIs, so it can be tested in Node.
- `lib/settings.js`: storage helpers and browser regex validation.
- `lib/tracker.js`: time tracking. The open session is kept in `storage.session` and flushed on tab/focus/idle events and a one-minute alarm.
- `lib/usage.js`: day/hour bucketing and aggregation. No browser APIs.
- `popup.*`, `options.*`, `blocked.*`, `stats.*`: the UI.
