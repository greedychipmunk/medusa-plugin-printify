import React, { useState, useEffect } from 'react';

interface PrintifyConfiguration {
  id: string;
  store_id: string;
  printify_shop_id: string;
  sync_enabled: boolean;
  sync_frequency: number;
  created_at: string;
  updated_at: string;
}

interface ConfigurationFormData {
  printify_api_key: string;
  printify_shop_id: string;
  webhook_secret?: string;
  sync_enabled: boolean;
  sync_frequency: number;
}

const SYNC_FREQUENCY_OPTIONS = [
  { value: 5, label: 'Every 5 minutes' },
  { value: 15, label: 'Every 15 minutes' },
  { value: 30, label: 'Every 30 minutes' },
  { value: 60, label: 'Every hour' },
  { value: 360, label: 'Every 6 hours' },
  { value: 720, label: 'Every 12 hours' },
  { value: 1440, label: 'Daily' },
];

export const PrintifyConfigurationWidget: React.FC = () => {
  const [configuration, setConfiguration] = useState<PrintifyConfiguration | null>(null);
  const [formData, setFormData] = useState<ConfigurationFormData>({
    printify_api_key: '',
    printify_shop_id: '',
    webhook_secret: '',
    sync_enabled: true,
    sync_frequency: 60,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load existing configuration on mount
  useEffect(() => {
    loadConfiguration();
  }, []);

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const loadConfiguration = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/admin/printify/configuration');
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          setConfiguration(data.data);
          // Don't populate sensitive fields from loaded config
          setFormData(prev => ({
            ...prev,
            printify_shop_id: data.data.printify_shop_id,
            sync_enabled: data.data.sync_enabled,
            sync_frequency: data.data.sync_frequency,
          }));
        }
      }
    } catch (error) {
      console.error('Failed to load configuration:', error);
      showMessage('error', 'Failed to load Printify configuration');
    } finally {
      setIsLoading(false);
    }
  };

  const testConnection = async () => {
    if (!formData.printify_api_key || !formData.printify_shop_id) {
      showMessage('error', 'API Key and Shop ID are required for testing');
      return;
    }

    try {
      setIsTesting(true);
      setTestResult(null);

      const response = await fetch('/admin/printify/configuration/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          printify_api_key: formData.printify_api_key,
          printify_shop_id: formData.printify_shop_id,
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        setTestResult({ success: true, message: 'Connection successful!' });
        showMessage('success', 'Printify connection test successful');
      } else {
        setTestResult({ success: false, message: data.message || 'Connection failed' });
        showMessage('error', data.message || 'Connection test failed');
      }
    } catch (error) {
      const message = 'Failed to test connection';
      setTestResult({ success: false, message });
      showMessage('error', message);
    } finally {
      setIsTesting(false);
    }
  };

  const saveConfiguration = async () => {
    try {
      setIsSaving(true);

      const method = configuration ? 'PUT' : 'POST';
      const response = await fetch('/admin/printify/configuration', {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();
      
      if (data.success) {
        setConfiguration(data.data);
        showMessage('success', configuration ? 'Configuration updated successfully' : 'Configuration created successfully');
        
        // Clear sensitive fields from form
        setFormData(prev => ({
          ...prev,
          printify_api_key: '',
          webhook_secret: '',
        }));
      } else {
        showMessage('error', data.message || 'Failed to save configuration');
      }
    } catch (error) {
      console.error('Failed to save configuration:', error);
      showMessage('error', 'Failed to save configuration');
    } finally {
      setIsSaving(false);
    }
  };

  const handleInputChange = (field: keyof ConfigurationFormData, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
    // Clear test result when form changes
    setTestResult(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-6 px-4">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Printify Configuration
        </h1>
        <p className="text-gray-600">
          Configure your Printify integration settings and API credentials.
        </p>
      </div>

      {/* Message Display */}
      {message && (
        <div className={`mb-6 p-4 rounded-md ${message.type === 'success' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
          {message.text}
        </div>
      )}

      {/* Current Configuration Status */}
      {configuration && (
        <div className="mb-6 p-4 bg-gray-50 rounded-lg border">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900 mb-1">Current Configuration</h3>
              <div className="flex items-center gap-2">
                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                  configuration.sync_enabled 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  {configuration.sync_enabled ? "Sync Enabled" : "Sync Disabled"}
                </span>
                <span className="text-sm text-gray-600">
                  Shop ID: {configuration.printify_shop_id}
                </span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-600">
                Last Updated: {new Date(configuration.updated_at).toLocaleDateString()}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Configuration Form */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">API Credentials</h2>
        </div>
        
        <div className="p-6 space-y-6">
          {/* API Key */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Printify API Key *
            </label>
            <div className="flex gap-2">
              <input
                type={showApiKey ? "text" : "password"}
                placeholder="Enter your Printify API key"
                value={formData.printify_api_key}
                onChange={(e) => handleInputChange('printify_api_key', e.target.value)}
                className="flex-1 border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {showApiKey ? '🙈' : '👁️'}
              </button>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              Get your API key from your Printify account settings
            </p>
          </div>

          {/* Shop ID */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Printify Shop ID *
            </label>
            <input
              type="text"
              placeholder="Enter your Printify shop ID"
              value={formData.printify_shop_id}
              onChange={(e) => handleInputChange('printify_shop_id', e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-sm text-gray-500 mt-1">
              Found in your Printify shop settings
            </p>
          </div>

          {/* Webhook Secret */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Webhook Secret (Optional)
            </label>
            <div className="flex gap-2">
              <input
                type={showWebhookSecret ? "text" : "password"}
                placeholder="Enter webhook secret for secure webhooks"
                value={formData.webhook_secret || ''}
                onChange={(e) => handleInputChange('webhook_secret', e.target.value)}
                className="flex-1 border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                type="button"
                onClick={() => setShowWebhookSecret(!showWebhookSecret)}
                className="px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {showWebhookSecret ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {/* Test Connection */}
          <div className="flex items-center gap-3">
            <button
              onClick={testConnection}
              disabled={isTesting || !formData.printify_api_key || !formData.printify_shop_id}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isTesting ? (
                <span className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                  Testing...
                </span>
              ) : (
                'Test Connection'
              )}
            </button>
            
            {testResult && (
              <div className="flex items-center gap-2">
                <span className={testResult.success ? "text-green-600" : "text-red-600"}>
                  {testResult.success ? '✅' : '❌'} {testResult.message}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Sync Settings */}
        <div className="px-6 py-4 border-t border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Sync Settings</h2>
          
          <div className="space-y-4">
            {/* Enable Sync Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-gray-700">Enable Automatic Sync</label>
                <p className="text-sm text-gray-500">
                  Automatically sync products from Printify
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.sync_enabled}
                  onChange={(e) => handleInputChange('sync_enabled', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {/* Sync Frequency */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Sync Frequency
              </label>
              <select
                value={formData.sync_frequency}
                onChange={(e) => handleInputChange('sync_frequency', parseInt(e.target.value))}
                disabled={!formData.sync_enabled}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
              >
                {SYNC_FREQUENCY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={loadConfiguration}
            disabled={isSaving}
            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          >
            Reset
          </button>
          <button
            onClick={saveConfiguration}
            disabled={isSaving || !formData.printify_api_key || !formData.printify_shop_id}
            className="px-4 py-2 bg-blue-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? (
              <span className="flex items-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Saving...
              </span>
            ) : (
              configuration ? 'Update Configuration' : 'Create Configuration'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};