import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  /**
   * Pin the Turbopack root to this repo.
   *
   * This project sits inside `/oBizee` alongside several unrelated projects
   * (DR-3: filesystem adjacency only, no shared tooling). Turbopack infers a
   * workspace root by walking up looking for lockfiles, finds theirs, and warns
   * about multiple lockfiles — and an inferred root above this directory would
   * pull sibling projects into module resolution, which is precisely the
   * coupling the client's "totally separate" instruction rules out.
   */
  turbopack: {
    root: fileURLToPath(new URL(".", import.meta.url)),
  },
};

export default nextConfig;
