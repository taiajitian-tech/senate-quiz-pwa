import { main } from "./fetchNhkByCard.mjs";

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
