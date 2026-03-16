import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ArrowRight, BuildingStorefront } from "@medusajs/icons"
import { Container, Heading, Button, Table, Badge } from "@medusajs/ui"
import { useEffect, useState } from "react"
import { Link } from "react-router-dom"

type PrintifyShop = { id: string; printify_id: string; title: string }

const PrintifyPage = () => {
  const [shops, setShops] = useState<PrintifyShop[]>([])
  const [syncing, setSyncing] = useState(false)

  const loadShops = async () => {
    const res = await fetch("/admin/printify/shops", { credentials: "include" })
    const json = await res.json()
    setShops(json.shops ?? [])
  }

  const syncShops = async () => {
    setSyncing(true)
    try {
      await fetch("/admin/printify/shops", { method: "POST", credentials: "include" })
      await loadShops()
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => { loadShops() }, [])

  return (
    <Container className="p-8">
      <div className="flex justify-between items-center mb-6">
        <Heading>Printify Integration</Heading>
        <Button onClick={syncShops} isLoading={syncing} size="small">
          Sync Shops
        </Button>
      </div>

      <Table>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Shop Name</Table.HeaderCell>
            <Table.HeaderCell>Printify ID</Table.HeaderCell>
            <Table.HeaderCell></Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {shops.map(shop => (
            <Table.Row key={shop.id}>
              <Table.Cell>
                <Link
                  to={`/printify/products?shop_id=${shop.printify_id}&shop_name=${encodeURIComponent(shop.title)}`}
                  className="block w-full text-inherit no-underline"
                >
                  {shop.title}
                </Link>
              </Table.Cell>
              <Table.Cell>
                <Link
                  to={`/printify/products?shop_id=${shop.printify_id}&shop_name=${encodeURIComponent(shop.title)}`}
                  className="block w-full no-underline"
                >
                  <Badge color="grey" size="2xsmall">{shop.printify_id}</Badge>
                </Link>
              </Table.Cell>
              <Table.Cell>
                <Link
                  to={`/printify/products?shop_id=${shop.printify_id}&shop_name=${encodeURIComponent(shop.title)}`}
                  className="block w-full no-underline text-ui-fg-muted"
                >
                  <ArrowRight />
                </Link>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Printify",
  icon: BuildingStorefront,
})

export default PrintifyPage
