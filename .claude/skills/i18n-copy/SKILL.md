---
name: i18n-copy
description: Add, change or remove user-facing text in the portfolio, in English and Serbian. Use for any copy change, new label, tooltip, aria-label, empty state or error message.
---

# Add or change copy

All user-facing text goes through ngx-translate. The catalogs are `public/i18n/en.json` (the source of truth) and `public/i18n/sr.json` (Serbian, **Latin script**). Their key trees must be identical; `npm run check:i18n` enforces that.

## Steps

1. **Pick the key.** Group it by section and use an UPPER_SNAKE leaf: `PROJECTS.EMPTY_TITLE`, `TOOLTIP.RESUME`. Before creating one, check whether a dead key already says it: `npm run check:i18n` lists the keys nothing references.
2. **Add it to both catalogs at the same path.**
   - Serbian means Latin script with diacritics (č ć š ž đ), never Cyrillic. Match the existing voice: short labels with a terminal feel (`Projekti/`, `Kontakt/>`).
   - If you aren't confident in the Serbian, still add your best translation and flag it in the PR as "SR needs review: KEY".
   - Interpolation params must match across locales: `"Copied {{email}}"` and `"Kopirano {{email}}"`.
3. **Use it with the standard markup:**

   ```html
   <span appTerminalTyping data-i18n-key="SECTION.KEY">{{ 'SECTION.KEY' | translate }}</span>
   ```

   - `appTerminalTyping` retypes the text when the language changes. `data-i18n-key` lets it read the new value directly, so it doesn't race the pipe.
   - Attributes: `[attr.aria-label]="'SECTION.KEY' | translate"`. Don't use the typing directive here.
   - Tooltips: `appTooltip="TOOLTIP.KEY"`. The directive translates anything that looks like a key.
   - In TypeScript, inject `TranslateService` and call `this.translate.instant('SECTION.KEY', { email })`. Use it in handlers that run after the catalogs have loaded, not in constructors.
4. **Keys built at runtime** (`'HOME.STACK.ITEMS.' + item.key`) are invisible to the checker. Add the prefix to `DYNAMIC_PREFIXES` in `scripts/check-i18n.mjs`, and make sure every concrete key exists in both files.
5. **Removing text:** delete the key from both catalogs in the same change.

## Verify

- Run `npm run check:i18n`. Claude Code also runs it after each edit and reports failures as hook feedback.
- Look at the change in the Preview in EN and SR. Serbian strings are often 20–30 % longer, so check they still fit at ~375 px wide.
