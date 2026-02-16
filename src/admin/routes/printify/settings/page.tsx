import { useState, useEffect } from "react"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  Input,
  Button,
  Label,
  Switch,
  Select,
  toast,
  Toaster,
  StatusBadge,
  Text,
  Heading,
} from "@medusajs/ui"
import { Container } from "../../../components/container"
import { Header } from "../../../components/header"

interface PrintifyConfiguration {
  id: string
  store_id: string
  printify_shop_id: string
  sync_enabled: boolean
  sync_frequency: number
  has_api_key: boolean
  has_webhook_secret: boolean
  created_at: string
  updated_at: string
}

interface ConfigurationFormData {
  printify_api_key: string
  printify_shop_id: string
  webhook_secret: string
  sync_enabled: boolean
  sync_frequency: number
}

const SYNC_FREQUENCY_OPTIONS = [
  { value: "5", label: "Every 5 minutes" },
  { value: "15", label: "Every 15 minutes" },
  { value: "30", label: "Every 30 minutes" },
  { value: "60", label: "Every hour" },
  { value: "360", label: "Every 6 hours" },
  { value: "720", label: "Every 12 hours" },
  { value: "1440", label: "Daily" },
]

const PrintifySettingsPage = () => {
  const [configuration, setConfiguration] = useState<PrintifyConfiguration | null>(null)
  const [formData, setFormData] = useState<ConfigurationFormData>({
    printify_api_key: "",
    printify_shop_id: "",
    webhook_secret: "",
    sync_enabled: true,
    sync_frequency: 60,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const [showWebhookSecret, setShowWebhookSecret] = useState(false)

  useEffect(() => {
    loadConfiguration()
  }, [])

  const loadConfiguration = async () => {
    try {
      setIsLoading(true)
      const response = await fetch("/admin/printify/config")

      if (response.ok) {
        const data = await response.json()
        if (data.success && data.data) {
          setConfiguration(data.data)
          setFormData((prev) => ({
            ...prev,
            printify_shop_id: data.data.printify_shop_id,
            sync_enabled: data.data.sync_enabled,
            sync_frequency: data.data.sync_frequency,
          }))
        }
      }
    } catch (error) {
      console.error("Failed to load configuration:", error)
      toast.error("Failed to load Printify configuration")
    } finally {
      setIsLoading(false)
    }
  }

  const testConnection = async () => {
    try {
      setIsTesting(true)
      const response = await fetch("/admin/printify/config/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })

      const data = await response.json()
      if (data.success) {
        toast.success("Connection Test", {
          description: "Printify connection test successful",
        })
      } else {
        toast.error("Connection Test Failed", {
          description: data.message || "Connection failed",
        })
      }
    } catch (error) {
      toast.error("Connection Test Failed", {
        description: "Failed to test connection",
      })
    } finally {
      setIsTesting(false)
    }
  }

  const saveConfiguration = async () => {
    try {
      setIsSaving(true)

      const method = configuration ? "PUT" : "POST"
      const response = await fetch("/admin/printify/config", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })

      const data = await response.json()
      if (data.success) {
        setConfiguration(data.data)
        toast.success(
          configuration ? "Configuration Updated" : "Configuration Created",
          {
            description: configuration
              ? "Configuration updated successfully"
              : "Configuration created successfully",
          }
        )
        setFormData((prev) => ({
          ...prev,
          printify_api_key: "",
          webhook_secret: "",
        }))
      } else {
        toast.error("Save Failed", {
          description: data.message || "Failed to save configuration",
        })
      }
    } catch (error) {
      console.error("Failed to save configuration:", error)
      toast.error("Save Failed", {
        description: "Failed to save configuration",
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleInputChange = (
    field: keyof ConfigurationFormData,
    value: string | boolean | number
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  if (isLoading) {
    return (
      <Container>
        <div className="flex items-center justify-center py-8">
          <Text className="text-ui-fg-subtle">Loading configuration...</Text>
        </div>
        <Toaster />
      </Container>
    )
  }

  return (
    <>
      <Container>
        <Header
          title="Printify Settings"
          subtitle="Configure your Printify integration settings and API credentials"
        />

        {/* Current Configuration Status */}
        {configuration && (
          <div className="px-6 py-4">
            <div className="flex items-center justify-between rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4">
              <div>
                <Heading level="h3" className="mb-2">
                  Current Configuration
                </Heading>
                <div className="flex items-center gap-2">
                  <StatusBadge color={configuration.sync_enabled ? "green" : "grey"}>
                    {configuration.sync_enabled ? "Sync Enabled" : "Sync Disabled"}
                  </StatusBadge>
                  <Text size="small" className="text-ui-fg-subtle">
                    Shop ID: {configuration.printify_shop_id}
                  </Text>
                </div>
              </div>
              <div className="text-right">
                <Text size="small" className="text-ui-fg-subtle">
                  Last Updated: {new Date(configuration.updated_at).toLocaleDateString()}
                </Text>
              </div>
            </div>
          </div>
        )}

        {/* API Credentials Section */}
        <div className="px-6 py-4">
          <Heading level="h3" className="mb-4">API Credentials</Heading>
          <div className="space-y-4">
            <div>
              <Label htmlFor="api-key" className="mb-2">
                Printify API Key {configuration?.has_api_key ? "(saved)" : "*"}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="api-key"
                  type={showApiKey ? "text" : "password"}
                  placeholder={configuration?.has_api_key ? "Enter new key to update" : "Enter your Printify API key"}
                  value={formData.printify_api_key}
                  onChange={(e) => handleInputChange("printify_api_key", e.target.value)}
                  className="flex-1"
                />
                <Button variant="secondary" onClick={() => setShowApiKey(!showApiKey)}>
                  {showApiKey ? "Hide" : "Show"}
                </Button>
              </div>
              <Text size="small" className="text-ui-fg-subtle mt-1">
                Get your API key from your Printify account settings
              </Text>
            </div>

            <div>
              <Label htmlFor="shop-id" className="mb-2">Printify Shop ID *</Label>
              <Input
                id="shop-id"
                type="text"
                placeholder="Enter your Printify shop ID"
                value={formData.printify_shop_id}
                onChange={(e) => handleInputChange("printify_shop_id", e.target.value)}
              />
              <Text size="small" className="text-ui-fg-subtle mt-1">
                Found in your Printify shop settings
              </Text>
            </div>

            <div>
              <Label htmlFor="webhook-secret" className="mb-2">
                Webhook Secret {configuration?.has_webhook_secret ? "(saved)" : "(Optional)"}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="webhook-secret"
                  type={showWebhookSecret ? "text" : "password"}
                  placeholder={configuration?.has_webhook_secret ? "Enter new secret to update" : "Enter webhook secret for secure webhooks"}
                  value={formData.webhook_secret}
                  onChange={(e) => handleInputChange("webhook_secret", e.target.value)}
                  className="flex-1"
                />
                <Button variant="secondary" onClick={() => setShowWebhookSecret(!showWebhookSecret)}>
                  {showWebhookSecret ? "Hide" : "Show"}
                </Button>
              </div>
            </div>

            {/* Test Connection */}
            {configuration && (
              <div>
                <Button
                  variant="secondary"
                  onClick={testConnection}
                  isLoading={isTesting}
                  disabled={isTesting}
                >
                  {isTesting ? "Testing..." : "Test Connection"}
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Sync Settings Section */}
        <div className="px-6 py-4">
          <Heading level="h3" className="mb-4">Sync Settings</Heading>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="sync-enabled">Enable Automatic Sync</Label>
                <Text size="small" className="text-ui-fg-subtle">
                  Automatically sync products from Printify
                </Text>
              </div>
              <Switch
                id="sync-enabled"
                checked={formData.sync_enabled}
                onCheckedChange={(checked) => handleInputChange("sync_enabled", checked)}
              />
            </div>

            <div>
              <Label htmlFor="sync-frequency" className="mb-2">Sync Frequency</Label>
              <Select
                value={formData.sync_frequency.toString()}
                onValueChange={(value) => handleInputChange("sync_frequency", parseInt(value))}
                disabled={!formData.sync_enabled}
              >
                <Select.Trigger id="sync-frequency">
                  <Select.Value placeholder="Select frequency" />
                </Select.Trigger>
                <Select.Content>
                  {SYNC_FREQUENCY_OPTIONS.map((option) => (
                    <Select.Item key={option.value} value={option.value}>
                      {option.label}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 bg-ui-bg-subtle">
          <Button variant="secondary" onClick={loadConfiguration} disabled={isSaving}>
            Reset
          </Button>
          <Button
            onClick={saveConfiguration}
            isLoading={isSaving}
            disabled={
              isSaving ||
              (!configuration && !formData.printify_api_key) ||
              !formData.printify_shop_id
            }
          >
            {isSaving
              ? "Saving..."
              : configuration
              ? "Update Configuration"
              : "Create Configuration"}
          </Button>
        </div>
      </Container>
      <Toaster />
    </>
  )
}

export const config = defineRouteConfig({
  label: "Settings",
})

export default PrintifySettingsPage
