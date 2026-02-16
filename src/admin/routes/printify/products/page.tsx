import { useState, useEffect, useMemo } from "react"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  Badge,
  Button,
  StatusBadge,
  toast,
  Toaster,
  createDataTableColumnHelper,
  createDataTableFilterHelper,
  DataTable,
  DataTablePaginationState,
  DataTableFilteringState,
  DataTableSortingState,
  useDataTable,
  CommandBar,
  Text,
} from "@medusajs/ui"
import { Container } from "../../../components/container"
import { Header } from "../../../components/header"

interface PrintifyProduct {
  id: string
  printify_product_id: string
  medusa_product_id?: string
  title: string
  description: string
  enabled: boolean
  base_price: number
  is_available: boolean
  variant_count: number
  image_count: number
  needs_sync: boolean
  last_sync_at?: string
  created_at: string
  updated_at: string
}

interface ProductStats {
  total_products: number
  enabled_products: number
  disabled_products: number
  needs_sync: number
  linked_to_medusa: number
  available_products: number
}

const columnHelper = createDataTableColumnHelper<PrintifyProduct>()

const columns = [
  columnHelper.accessor("title", {
    header: "Product",
    cell: ({ row }) => {
      const product = row.original
      return (
        <div className="flex flex-col gap-1">
          <Text weight="plus" size="small">
            {product.title}
          </Text>
          <Text size="xsmall" className="text-ui-fg-subtle">
            ID: {product.printify_product_id}
          </Text>
          {product.medusa_product_id && (
            <Text size="xsmall" className="text-ui-fg-interactive">
              Medusa: {product.medusa_product_id}
            </Text>
          )}
        </div>
      )
    },
  }),
  columnHelper.accessor("enabled", {
    header: "Status",
    cell: ({ row }) => {
      const product = row.original
      return (
        <div className="flex flex-col gap-1">
          <StatusBadge color={product.enabled ? "green" : "grey"}>
            {product.enabled ? "Enabled" : "Disabled"}
          </StatusBadge>
          <StatusBadge color={product.is_available ? "blue" : "red"}>
            {product.is_available ? "Available" : "Unavailable"}
          </StatusBadge>
        </div>
      )
    },
  }),
  columnHelper.accessor("base_price", {
    header: "Details",
    cell: ({ row }) => {
      const product = row.original
      return (
        <div className="flex flex-col gap-0.5">
          <Text size="small">Price: ${product.base_price}</Text>
          <Text size="small">Variants: {product.variant_count}</Text>
          <Text size="small">Images: {product.image_count}</Text>
        </div>
      )
    },
  }),
  columnHelper.accessor("needs_sync", {
    header: "Sync Status",
    cell: ({ row }) => {
      const product = row.original
      return (
        <div className="flex flex-col gap-1">
          {product.needs_sync && (
            <Badge color="orange" size="small">
              Needs Sync
            </Badge>
          )}
          {product.last_sync_at && (
            <Text size="xsmall" className="text-ui-fg-subtle">
              Last: {new Date(product.last_sync_at).toLocaleDateString()}
            </Text>
          )}
        </div>
      )
    },
  }),
  columnHelper.accessor("medusa_product_id", {
    header: "Medusa Link",
    cell: ({ row }) => {
      const product = row.original
      return product.medusa_product_id ? (
        <StatusBadge color="green">Linked</StatusBadge>
      ) : (
        <StatusBadge color="grey">Not Linked</StatusBadge>
      )
    },
  }),
]

const filterHelper = createDataTableFilterHelper<PrintifyProduct>()

const filters = [
  filterHelper.accessor("enabled", {
    type: "select",
    label: "Status",
    options: [
      { label: "Enabled", value: "true" },
      { label: "Disabled", value: "false" },
    ],
  }),
]

const PrintifyProductsPage = () => {
  const [products, setProducts] = useState<PrintifyProduct[]>([])
  const [stats, setStats] = useState<ProductStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set())
  const [searchTerm, setSearchTerm] = useState("")
  const [pagination, setPagination] = useState<DataTablePaginationState>({
    pageSize: 20,
    pageIndex: 0,
  })
  const [filtering, setFiltering] = useState<DataTableFilteringState>({})
  const [sorting, setSorting] = useState<DataTableSortingState | null>(null)
  const [rowCount, setRowCount] = useState(0)

  const enabledFilter = useMemo(() => {
    const filterValue = filtering.enabled as string[] | undefined
    if (!filterValue || filterValue.length === 0) return undefined
    return filterValue[0] === "true"
  }, [filtering])

  useEffect(() => {
    loadProducts()
    loadStats()
  }, [pagination.pageIndex, searchTerm, enabledFilter])

  const loadProducts = async () => {
    try {
      setIsLoading(true)
      const params = new URLSearchParams({
        page: (pagination.pageIndex + 1).toString(),
        limit: pagination.pageSize.toString(),
        ...(searchTerm && { search: searchTerm }),
        ...(enabledFilter !== undefined && { enabled: enabledFilter.toString() }),
      })

      const response = await fetch(`/admin/printify/products?${params}`)
      const data = await response.json()

      if (data.success) {
        setProducts(data.data.products)
        setRowCount(data.data.pagination.total)
      } else {
        toast.error("Failed to load products")
      }
    } catch (error) {
      console.error("Failed to load products:", error)
      toast.error("Failed to load products")
    } finally {
      setIsLoading(false)
    }
  }

  const loadStats = async () => {
    try {
      const response = await fetch("/admin/printify/products/stats")
      const data = await response.json()
      if (data.success) {
        setStats(data.data)
      }
    } catch (error) {
      console.error("Failed to load stats:", error)
    }
  }

  const syncProducts = async () => {
    try {
      setIsSyncing(true)
      const response = await fetch("/admin/printify/products/sync", { method: "POST" })
      const data = await response.json()

      if (data.success) {
        toast.success("Sync Started", {
          description: "Product synchronization started successfully",
        })
        setTimeout(() => {
          loadProducts()
          loadStats()
        }, 2000)
      } else {
        toast.error("Sync Failed", {
          description: data.message || "Failed to start synchronization",
        })
      }
    } catch (error) {
      console.error("Failed to sync products:", error)
      toast.error("Sync Failed", {
        description: "Failed to start synchronization",
      })
    } finally {
      setIsSyncing(false)
    }
  }

  const toggleProductEnabled = async (productId: string, enabled: boolean) => {
    try {
      const endpoint = enabled ? "enable" : "disable"
      const response = await fetch(`/admin/printify/products/${productId}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: `Manual ${enabled ? "enable" : "disable"} from admin panel`,
        }),
      })

      const data = await response.json()
      if (data.success) {
        toast.success(enabled ? "Product Enabled" : "Product Disabled", {
          description: `Product ${enabled ? "enabled" : "disabled"} successfully`,
        })
        loadProducts()
        loadStats()
      } else {
        toast.error("Operation Failed", {
          description: data.message || `Failed to ${enabled ? "enable" : "disable"} product`,
        })
      }
    } catch (error) {
      console.error("Failed to toggle product:", error)
      toast.error("Operation Failed", {
        description: `Failed to ${enabled ? "enable" : "disable"} product`,
      })
    }
  }

  const bulkToggleProducts = async (enabled: boolean) => {
    if (selectedProducts.size === 0) {
      toast.error("No Selection", { description: "Please select products first" })
      return
    }

    try {
      const endpoint = enabled ? "bulk-enable" : "bulk-disable"
      const response = await fetch(`/admin/printify/products/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_ids: Array.from(selectedProducts),
          reason: `Bulk ${enabled ? "enable" : "disable"} from admin panel`,
        }),
      })

      const data = await response.json()
      if (data.success) {
        toast.success("Bulk Operation Completed", {
          description: `${data.data.successful_count} ${enabled ? "enabled" : "disabled"}, ${data.data.failed_count} failed`,
        })
        setSelectedProducts(new Set())
        loadProducts()
        loadStats()
      } else {
        toast.error("Bulk Operation Failed", {
          description: data.message || `Failed to ${enabled ? "enable" : "disable"} products`,
        })
      }
    } catch (error) {
      console.error("Failed to bulk toggle products:", error)
      toast.error("Bulk Operation Failed", {
        description: `Failed to ${enabled ? "enable" : "disable"} products`,
      })
    }
  }

  const table = useDataTable({
    columns,
    data: products,
    getRowId: (row) => row.id,
    rowCount,
    isLoading,
    pagination: {
      state: pagination,
      onPaginationChange: setPagination,
    },
    search: {
      state: searchTerm,
      onSearchChange: setSearchTerm,
    },
    filtering: {
      state: filtering,
      onFilteringChange: setFiltering,
    },
    filters,
    sorting: {
      state: sorting,
      onSortingChange: setSorting,
    },
    rowSelection: {
      state: Object.fromEntries(
        Array.from(selectedProducts).map((id) => [id, true])
      ),
      onRowSelectionChange: (updater: any) => {
        const newSelection =
          typeof updater === "function"
            ? updater(
                Object.fromEntries(
                  Array.from(selectedProducts).map((id) => [id, true])
                )
              )
            : updater

        setSelectedProducts(
          new Set(Object.keys(newSelection).filter((key) => newSelection[key]))
        )
      },
    },
  })

  return (
    <>
      <Container>
        <Header
          title="Printify Products"
          subtitle="Manage your Printify products, sync with the catalog, and control storefront visibility"
          actions={[
            {
              type: "button",
              props: {
                variant: "secondary",
                onClick: syncProducts,
                isLoading: isSyncing,
                disabled: isSyncing,
                children: isSyncing ? "Syncing..." : "Sync Products",
              },
            },
          ]}
        />

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 gap-4 px-6 py-4 md:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-lg border border-ui-border-base p-4">
              <Text className="text-2xl font-bold">{stats.total_products}</Text>
              <Text size="small" className="text-ui-fg-subtle">Total Products</Text>
            </div>
            <div className="rounded-lg border border-ui-border-base p-4">
              <Text className="text-2xl font-bold text-ui-fg-interactive">{stats.enabled_products}</Text>
              <Text size="small" className="text-ui-fg-subtle">Enabled</Text>
            </div>
            <div className="rounded-lg border border-ui-border-base p-4">
              <Text className="text-2xl font-bold">{stats.disabled_products}</Text>
              <Text size="small" className="text-ui-fg-subtle">Disabled</Text>
            </div>
            <div className="rounded-lg border border-ui-border-base p-4">
              <Text className="text-2xl font-bold text-ui-tag-orange-text">{stats.needs_sync}</Text>
              <Text size="small" className="text-ui-fg-subtle">Needs Sync</Text>
            </div>
            <div className="rounded-lg border border-ui-border-base p-4">
              <Text className="text-2xl font-bold text-ui-fg-interactive">{stats.linked_to_medusa}</Text>
              <Text size="small" className="text-ui-fg-subtle">Linked to Medusa</Text>
            </div>
            <div className="rounded-lg border border-ui-border-base p-4">
              <Text className="text-2xl font-bold text-ui-tag-purple-text">{stats.available_products}</Text>
              <Text size="small" className="text-ui-fg-subtle">Available</Text>
            </div>
          </div>
        )}

        {/* Data Table */}
        <div className="px-6 py-4">
          <DataTable instance={table}>
            <DataTable.Toolbar className="flex flex-col items-start justify-between gap-2 md:flex-row md:items-center">
              <div className="flex gap-2">
                <DataTable.FilterMenu tooltip="Filter" />
                <DataTable.Search placeholder="Search products..." />
              </div>
            </DataTable.Toolbar>
            <DataTable.Table />
            <DataTable.Pagination />
          </DataTable>

          {/* Product Actions */}
          {products.length > 0 && (
            <div className="mt-4 space-y-2">
              {products.map((product) => (
                <div
                  key={product.id}
                  className="flex items-center justify-between rounded-lg border border-ui-border-base p-3"
                >
                  <div className="flex flex-col gap-1">
                    <Text weight="plus" size="small">
                      {product.title}
                    </Text>
                    <div className="flex gap-2">
                      <StatusBadge color={product.enabled ? "green" : "grey"}>
                        {product.enabled ? "Enabled" : "Disabled"}
                      </StatusBadge>
                    </div>
                  </div>
                  <Button
                    variant={product.enabled ? "secondary" : "primary"}
                    size="small"
                    onClick={() => toggleProductEnabled(product.id, !product.enabled)}
                  >
                    {product.enabled ? "Disable" : "Enable"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Container>

      {/* Command Bar for Bulk Actions */}
      <CommandBar open={selectedProducts.size > 0}>
        <CommandBar.Bar>
          <CommandBar.Value>{selectedProducts.size} selected</CommandBar.Value>
          <CommandBar.Seperator />
          <CommandBar.Command
            action={() => bulkToggleProducts(true)}
            label="Enable Selected"
            shortcut="e"
          />
          <CommandBar.Seperator />
          <CommandBar.Command
            action={() => bulkToggleProducts(false)}
            label="Disable Selected"
            shortcut="d"
          />
          <CommandBar.Seperator />
          <CommandBar.Command
            action={() => setSelectedProducts(new Set())}
            label="Clear Selection"
            shortcut="c"
          />
        </CommandBar.Bar>
      </CommandBar>

      <Toaster />
    </>
  )
}

export const config = defineRouteConfig({
  label: "Products",
})

export default PrintifyProductsPage
