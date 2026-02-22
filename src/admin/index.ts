import PrintifyDashboard from "./routes/printify/page"
import PrintifyAnalyticsPage from "./routes/printify/analytics/page"
import PrintifyProductsPage from "./routes/printify/products/page"
import PrintifyOrdersPage from "./routes/printify/orders/page"
import PrintifyOrderDetailPage from "./routes/printify/orders/[id]/page"
import PrintifyWebhookEventsPage from "./routes/printify/webhook-events/page"
import PrintifyWebhookEventDetailPage from "./routes/printify/webhook-events/[id]/page"
import PrintifySettingsPage from "./routes/printify/settings/page"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const widgetModule: any = { widgets: [] }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const routeModule: any = {
  routes: [
    {
      Component: PrintifyDashboard,
      path: "/printify",
    },
    {
      Component: PrintifyAnalyticsPage,
      path: "/printify/analytics",
    },
    {
      Component: PrintifyProductsPage,
      path: "/printify/products",
    },
    {
      Component: PrintifyOrdersPage,
      path: "/printify/orders",
    },
    {
      Component: PrintifyOrderDetailPage,
      path: "/printify/orders/:id",
    },
    {
      Component: PrintifyWebhookEventsPage,
      path: "/printify/webhook-events",
    },
    {
      Component: PrintifyWebhookEventDetailPage,
      path: "/printify/webhook-events/:id",
    },
    {
      Component: PrintifySettingsPage,
      path: "/printify/settings",
    },
  ],
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const menuItemModule: any = {
  menuItems: [
    {
      label: "Printify",
      icon: undefined,
      path: "/printify",
      nested: undefined,
      rank: undefined,
      translationNs: undefined,
    },
  ],
}

const formModule = { customFields: {} }
const displayModule = { displays: {} }
const i18nModule = { resources: {} }

const plugin = {
  widgetModule,
  routeModule,
  menuItemModule,
  formModule,
  displayModule,
  i18nModule,
}

export default plugin
