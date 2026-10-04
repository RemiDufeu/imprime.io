# Built-in fonts

The files of the families listed in `BUILTIN_FONTS` (`packages/common/src/fonts.ts`).
The editor (`packages/frontend/src/fonts.ts`) and the PDF export
(`packages/backend/src/config/fonts.ts`) both register them from here, under
the same names, so text is drawn with the same file on both sides.

All are open source — SIL Open Font License, except Roboto Slab (Apache 2.0).
Each family's license is in `licenses/<FamilyWithoutSpaces>.txt`, and must ship
with the files: the Docker image copies this whole folder.

## Adding a family

1. **Static files only.** react-pdf cannot use a variable font, so each face is
   its own TrueType/OpenType file. Google Fonts' CSS API serves static
   instances: request
   `https://fonts.googleapis.com/css2?family=<Family>:ital,wght@0,400;0,700;1,400;1,700`
   with a non-browser user agent (`curl` does) and download the `.ttf` URLs.
   A family without italics or without bold answers 400 — retry with
   `wght@400;700`, `ital@0;1`, or no axis at all.
2. **Name the files** `<FamilyWithoutSpaces>-<Regular|Bold|Italic|BoldItalic>.ttf`.
   Regular is required; the others are optional — a missing face falls back to
   the closest one, on both sides, never synthesised.
3. **Add the license** from `github.com/google/fonts` (`ofl/<family>/OFL.txt`
   or `apache/<family>/LICENSE.txt`) to `licenses/`.
4. **Add the entry** to `BUILTIN_FONTS` with its `category` (the font menu
   groups by it) and its files. Nothing else lists families.
