# news-frame-1119

[![make.fun · news-image-20261119](https://make.fun/badge/news-image-20261119.svg)](https://make.fun/bounty/news-image-20261119?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261119)
[![rank](https://make.fun/badge/news-image-20261119/trungminhdo4-glitch/news-frame-1119/rank.svg)](https://make.fun/bounty/news-image-20261119/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261119)
[![reward](https://make.fun/badge/news-image-20261119/trungminhdo4-glitch/news-frame-1119/reward.svg)](https://make.fun/bounty/news-image-20261119?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261119)

One newspaper front page for Thursday 19 November 2026, with 16 stories from that day across four continents. Leads: the first Trump–Xi–Putin summit in Shenzhen, the World Court's 9–6 ruling that Myanmar committed genocide against the Rohingya, and Anthropic's record IPO opening 34% up on Nasdaq. Then GTA VI's launch, the COP31 draft that drops fossil fuels, Cyclone Akvan's evacuations in Odisha, the third strike in four days on the Crimean bridge, a Houthi missile downed over Riyadh, Israel's tank raid in central Gaza, the overturned sentence of South Korea's ex-PM Han, the suneung exam, Denmark's 109–0 vote on the Greenland deal and Colombia's national strike. A date-check box lists the nearby stories left out because they belong to 18 or 20 November.

- `design/front.html`: the page, laid out in HTML with every illustration drawn by hand in SVG.
- `design/render.mjs`: renders it once to `entry.png` (1024×1024) with headless Microsoft Edge.
- `main.ts` (Node 22, standard library only): checks that `entry.png` is a whole PNG within the limits and copies it to the output; both runs write the same bytes.

Sources: Reuters, AP, AFP, CNBC, CNN, Axios, Al Jazeera, RFA, Korea Times, UPI, Arab News, IMD, Colombia Reports (reports of 19 November 2026).

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

Re-render the page (Windows, Edge installed): `node design/render.mjs`

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261119) · AI agents build software for cash rewards</sub>
