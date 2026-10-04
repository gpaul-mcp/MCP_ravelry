# Your knitting & crochet guide in Claude

A Claude project is a folder of chats that share the same instructions and reference files. Set up once, every new chat in it already knows how you craft, which units you use and how to use your Ravelry account through this server. For everything the server can do, see [capabilities](capabilities.md).

## Set it up

1. Add the Ravelry connector with the signed-in URL, `https://ravelry-mcp.gonz-paul.dev/account/mcp` (see the [README](../README.md#with-your-own-ravelry-account)).
2. Create a project named "Knitting & crochet" in Claude.
3. Paste the [project instructions](#project-instructions-to-paste) into the project's instructions.
4. Fill in the [About me file](#the-about-me-file) and add it to the project's knowledge.
5. Start every chat about the hobby inside that project, with the Ravelry connector turned on.

The instructions say how Claude should behave; the About me file says who you are. Edit either one any time, and every new chat picks up the change.

## Project instructions to paste

The Ravelry connector already explains its own tools to Claude, so these instructions only cover how Claude should treat you. Change "metric" to "imperial" if you work in yards and inches.

```markdown
You are my knitting and crochet companion: a patient, practical expert who helps me choose, plan, make and fix my projects. My Ravelry account (stash, queue, projects, favorites, needles) is connected through the Ravelry tools; my "About me" file in this project says who I am and who I make things for.

## How to talk to me

- Reply in the language I write in.
- I work in metric: meters, grams, centimeters, needles and hooks in mm, gauge per 10 cm. Never give yards, ounces or inches unless I ask. If my Ravelry units are not set to metric yet, set them once.
- Be short and practical: the answer first, then only what I need to act. No long intros or recaps.
- When unsure what I want, ask one short question, not several.
- When a pattern carousel or a row counter appears, I already see it: add one short sentence at most, never list the patterns again.
- Always give the Ravelry link of a pattern or yarn you mention.

## Getting things right

- Never do knitting maths in your head: use the Ravelry calculators for gauge, increasing or decreasing evenly, yarn quantities, grams to meters and stitch counts.
- Never invent pattern instructions. The instructions are in the pattern's PDF or on the designer's website. When I need help with them, ask me to attach the PDF or a photo of the page, then explain it step by step and check the stitch counts.
- Watch the terminology: UK and US crochet terms differ (UK "dc" = US "sc"). Check which one a pattern uses before explaining it.
- Say clearly when a pattern is free, free online with a paid PDF, or paid.

## Fitting suggestions to me

- Before recommending patterns, check my crafting profile once per conversation and read my About me file.
- Suggest patterns at my level or one step above, and say what new technique each one would teach me. Never suggest something I already made.
- Prefer yarn I already own before suggesting I buy any. When I need to buy, give the amount in meters and grams.
- Use the sizes in my About me file when something is for a specific person.

## Keeping my Ravelry up to date

- When I say I started, paused, finished or frogged something, offer to update the project on Ravelry and its stash yarn.
- When I say where I am in a project, offer to log it; when I want to count rows, open the row counter (it also works for things that are not on Ravelry).
- When I send a photo of a ball band, label or receipt, identify the yarn and offer to add it to my stash.
- Always show me what will change and wait for my yes before adding, changing or deleting anything.

## Photos I may send

- Something I saw: describe its construction and techniques, then find similar patterns.
- My work in progress: look for mistakes, explain the likely cause and how to fix it, with and without unravelling.
- A chart: turn it into written rows, or the other way round, and check the counts.
```

## The About me file

This is what Ravelry cannot know about you. Fill it in, save it as a text file named "About me" and add it to the project's knowledge. Leave out any line you don't care about; update it when things change.

```markdown
# About me

## My crafting

- Crafts: knitting / crochet / both
- Level: e.g. comfortable with knit and purl, never tried cables
- Techniques I know: e.g. working in the round, granny squares
- Techniques I want to learn: e.g. colorwork, socks
- I like making: e.g. hats, cardigans, amigurumi
- My style: e.g. simple and textured, no frills, earthy colours
- I don't like: e.g. seaming, mohair, tiny needles

## Practical

- Units: metric (meters, grams, cm)
- Pattern language: e.g. French or English
- Budget: e.g. free patterns first, up to 8 euros for one I love
- Yarn I like: e.g. natural fibres, machine washable for gifts
- Where I buy yarn: e.g. my local shop in [town], online at [shop]
- Tools I own that are not on Ravelry: e.g. 4 mm and 5 mm circulars 80 cm, hooks 3 to 6 mm

## People I make things for

| Who | Head (cm) | Chest (cm) | Foot (cm) | Likes / dislikes |
| --- | --------- | ---------- | --------- | ---------------- |
| Me  |           |            |           |                  |
|     |           |            |           |                  |
```

If patterns in French come up, add this line to the About me file too: "French terms: maille serrée = US single crochet; demi-bride = US half double; bride = US double; double bride = US treble; maille coulée = slip stitch; maille en l'air = chain; jeté = yarn over; point mousse = garter; jersey = stockinette; point de riz = seed stitch."

## Your first chat in the project

Send this once. It checks that everything is connected and saves your units:

```markdown
Hi! Check my Ravelry crafting profile and my About me file, set my units to metric, then tell me in three lines what you know about me and what you would suggest I make next.
```

It works when Claude answers with your Ravelry username, what is in your stash and queue, and a suggestion that matches your About me file. Then try a pattern search ("a free cabled hat in DK") to see the carousel, and "count rows for my test" to see the counter.

## Habits that make it better

- **One chat per project you're making.** Keep the hat in its own chat: the pattern, your questions and your progress stay together. Name the chat after the project.
- **Attach the pattern PDF** at the start of that chat. Claude can then answer about any row without you retyping it.
- **Say what happens as it happens:** "started", "at the decreases", "finished", "frogged it". Claude offers to note it on Ravelry, so your stash stays right.
- **Send photos freely:** a ball band when you buy yarn, your work when something looks off, a sweater you saw in a shop.
- **Use 👍 and 👎 in the carousel.** Claude sees your picks and the next search gets closer to your taste.
- **Favorite patterns you love on Ravelry.** Your favorites feed the "picked for you" suggestions.
- **Keep the About me file current**: a new skill learned, a new person to knit for, new sizes.

## If something looks wrong

| What you see                                      | Fix                                                                                   |
| ------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Claude doesn't know your stash or projects        | Turn the Ravelry connector on for the chat; if it asks, sign in to Ravelry again      |
| A widget shows "Done.", "Loading…" or an old look | Start a new chat in the project, or disconnect and reconnect the connector            |
| Lengths in yards                                  | Say "I use meters" once; Claude saves it                                              |
| A long list under the carousel                    | Say "just the carousel, no list"; the instructions already ask for that               |
| "Ravelry refused access"                          | Disconnect and reconnect the connector to sign in again                               |
| An answer about a pattern's rows seems invented   | Attach the PDF or a photo of the page; Claude only knows the instructions you give it |
