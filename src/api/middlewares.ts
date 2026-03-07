import { MiddlewaresConfig } from "@medusajs/framework/http"

export const config: MiddlewaresConfig = {
  routes: [
    {
      matcher: "/webhooks/printify",
      bodyParser: { preserveRawBody: true },
    },
  ],
}
