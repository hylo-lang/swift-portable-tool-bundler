// SPDX short identifier: Apache-2.0
//
// Bootstrap for the compiled GitHub Action. Thin on purpose: all logic
// lives in `./run.ts` so unit tests can drive `main()` without triggering
// side-effects at module-import time.

import { main } from "./run";

main().catch((error) => {
  console.error("Error in main:", error);
  process.exit(1);
});
