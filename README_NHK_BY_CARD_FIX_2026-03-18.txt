NHK card-based representative image fix

What changed
- Added web/scripts/fetchNhkByCard.mjs
- Workflow now runs the card-based NHK script
- Legacy web/scripts/fetchNhkAnyway.mjs now delegates to fetchNhkByCard.mjs
- Removed .git from deliverable zip

Manual run
1. Open project root
2. cd web
3. npm ci
4. npm run gen:representatives
5. npm run report:representatives:images
6. npm run gen:representatives:images:nhk
7. npm run report:representatives:images
8. npm run check:representatives

Important
- Matching is exact name equality after whitespace removal only
- No includes, fuzzy matching, AI guess, or Wikipedia dependency in NHK step
