import React, { useState, useEffect } from 'react';

interface PrintifyProduct {
  id: string;
  printify_product_id: string;
  medusa_product_id?: string;
  title: string;
  description: string;
  enabled: boolean;
  base_price: number;
  is_available: boolean;
  variant_count: number;
  image_count: number;
  needs_sync: boolean;
  last_sync_at?: string;
  created_at: string;
  updated_at: string;
}

interface ProductListResult {
  products: PrintifyProduct[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
    has_more: boolean;
  };
}

interface ProductStats {
  total_products: number;
  enabled_products: number;
  disabled_products: number;
  needs_sync: number;
  linked_to_medusa: number;
  available_products: number;
}

export const PrintifyProductManagementWidget: React.FC = () => {
  const [products, setProducts] = useState<PrintifyProduct[]>([]);
  const [stats, setStats] = useState<ProductStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [enabledFilter, setEnabledFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    total_pages: 0,
    has_more: false,
  });
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadProducts();
    loadStats();
  }, [currentPage, searchTerm, enabledFilter]);

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const loadProducts = async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '20',
        ...(searchTerm && { search: searchTerm }),
        ...(enabledFilter !== 'all' && { enabled: (enabledFilter === 'enabled').toString() }),
      });

      const response = await fetch(`/admin/printify/products?${params}`);
      const data = await response.json();

      if (data.success) {
        setProducts(data.data.products);
        setPagination(data.data.pagination);
      } else {
        showMessage('error', 'Failed to load products');
      }
    } catch (error) {
      console.error('Failed to load products:', error);
      showMessage('error', 'Failed to load products');
    } finally {
      setIsLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      setIsLoadingStats(true);
      const response = await fetch('/admin/printify/products/stats');
      const data = await response.json();

      if (data.success) {
        setStats(data.data);
      }
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setIsLoadingStats(false);
    }
  };

  const syncProducts = async () => {
    try {
      setIsSyncing(true);
      const response = await fetch('/admin/printify/products/sync', {
        method: 'POST',
      });
      const data = await response.json();

      if (data.success) {
        showMessage('success', 'Product synchronization started successfully');
        // Reload data after a short delay
        setTimeout(() => {
          loadProducts();
          loadStats();
        }, 2000);
      } else {
        showMessage('error', data.message || 'Failed to start synchronization');
      }
    } catch (error) {
      console.error('Failed to sync products:', error);
      showMessage('error', 'Failed to start synchronization');
    } finally {
      setIsSyncing(false);
    }
  };

  const toggleProductEnabled = async (productId: string, enabled: boolean) => {
    try {
      const endpoint = enabled ? 'enable' : 'disable';
      const response = await fetch(`/admin/printify/products/${productId}/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reason: `Manual ${enabled ? 'enable' : 'disable'} from admin panel`,
        }),
      });

      const data = await response.json();
      if (data.success) {
        showMessage('success', `Product ${enabled ? 'enabled' : 'disabled'} successfully`);
        loadProducts();
        loadStats();
      } else {
        showMessage('error', data.message || `Failed to ${enabled ? 'enable' : 'disable'} product`);
      }
    } catch (error) {
      console.error(`Failed to toggle product:`, error);
      showMessage('error', `Failed to ${enabled ? 'enable' : 'disable'} product`);
    }
  };

  const bulkToggleProducts = async (enabled: boolean) => {
    if (selectedProducts.size === 0) {
      showMessage('error', 'Please select products first');
      return;
    }

    try {
      const endpoint = enabled ? 'bulk-enable' : 'bulk-disable';
      const response = await fetch(`/admin/printify/products/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          product_ids: Array.from(selectedProducts),
          reason: `Bulk ${enabled ? 'enable' : 'disable'} from admin panel`,
        }),
      });

      const data = await response.json();
      if (data.success) {
        showMessage('success', 
          `Bulk operation completed: ${data.data.successful_count} ${enabled ? 'enabled' : 'disabled'}, ${data.data.failed_count} failed`
        );
        setSelectedProducts(new Set());
        loadProducts();
        loadStats();
      } else {
        showMessage('error', data.message || `Failed to ${enabled ? 'enable' : 'disable'} products`);
      }
    } catch (error) {
      console.error(`Failed to bulk toggle products:`, error);
      showMessage('error', `Failed to ${enabled ? 'enable' : 'disable'} products`);
    }
  };

  const handleSelectAll = () => {
    if (selectedProducts.size === products.length) {
      setSelectedProducts(new Set());
    } else {
      setSelectedProducts(new Set(products.map(p => p.id)));
    }
  };

  const handleSelectProduct = (productId: string) => {
    const newSelected = new Set(selectedProducts);
    if (newSelected.has(productId)) {
      newSelected.delete(productId);
    } else {
      newSelected.add(productId);
    }
    setSelectedProducts(newSelected);
  };

  return (
    <div className="max-w-7xl mx-auto py-6 px-4">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Printify Product Management
        </h1>
        <p className="text-gray-600">
          Manage your Printify products, sync with the catalog, and control storefront visibility.
        </p>
      </div>

      {/* Message Display */}
      {message && (
        <div className={`mb-6 p-4 rounded-md ${message.type === 'success' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
          {message.text}
        </div>
      )}

      {/* Stats Cards */}
      {!isLoadingStats && stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4 border">
            <div className="text-2xl font-bold text-gray-900">{stats.total_products}</div>
            <div className="text-sm text-gray-600">Total Products</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4 border">
            <div className="text-2xl font-bold text-green-600">{stats.enabled_products}</div>
            <div className="text-sm text-gray-600">Enabled</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4 border">
            <div className="text-2xl font-bold text-gray-600">{stats.disabled_products}</div>
            <div className="text-sm text-gray-600">Disabled</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4 border">
            <div className="text-2xl font-bold text-yellow-600">{stats.needs_sync}</div>
            <div className="text-sm text-gray-600">Needs Sync</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4 border">
            <div className="text-2xl font-bold text-blue-600">{stats.linked_to_medusa}</div>
            <div className="text-sm text-gray-600">Linked to Medusa</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4 border">
            <div className="text-2xl font-bold text-purple-600">{stats.available_products}</div>
            <div className="text-sm text-gray-600">Available</div>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="bg-white rounded-lg shadow mb-6">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            {/* Search and Filters */}
            <div className="flex flex-col sm:flex-row gap-3 flex-1">
              <input
                type="text"
                placeholder="Search products..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="flex-1 border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <select
                value={enabledFilter}
                onChange={(e) => {
                  setEnabledFilter(e.target.value as 'all' | 'enabled' | 'disabled');
                  setCurrentPage(1);
                }}
                className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Products</option>
                <option value="enabled">Enabled Only</option>
                <option value="disabled">Disabled Only</option>
              </select>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <button
                onClick={syncProducts}
                disabled={isSyncing}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSyncing ? (
                  <span className="flex items-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Syncing...
                  </span>
                ) : (
                  '🔄 Sync Products'
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Bulk Actions */}
        {selectedProducts.size > 0 && (
          <div className="px-6 py-3 bg-blue-50 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <span className="text-sm text-blue-800">
                {selectedProducts.size} product(s) selected
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => bulkToggleProducts(true)}
                  className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  Enable Selected
                </button>
                <button
                  onClick={() => bulkToggleProducts(false)}
                  className="px-3 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                  Disable Selected
                </button>
                <button
                  onClick={() => setSelectedProducts(new Set())}
                  className="px-3 py-1 text-sm border border-gray-300 text-gray-700 rounded hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  Clear Selection
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No products found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={selectedProducts.size === products.length && products.length > 0}
                      onChange={handleSelectAll}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Product
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Details
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Sync Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {products.map((product) => (
                  <tr key={product.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        checked={selectedProducts.has(product.id)}
                        onChange={() => handleSelectProduct(product.id)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{product.title}</div>
                        <div className="text-sm text-gray-500">ID: {product.printify_product_id}</div>
                        {product.medusa_product_id && (
                          <div className="text-sm text-blue-600">Medusa: {product.medusa_product_id}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          product.enabled 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {product.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          product.is_available 
                            ? 'bg-blue-100 text-blue-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {product.is_available ? 'Available' : 'Unavailable'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      <div>Price: ${product.base_price}</div>
                      <div>Variants: {product.variant_count}</div>
                      <div>Images: {product.image_count}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        {product.needs_sync && (
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                            Needs Sync
                          </span>
                        )}
                        {product.last_sync_at && (
                          <div className="text-xs text-gray-500">
                            Last: {new Date(product.last_sync_at).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => toggleProductEnabled(product.id, !product.enabled)}
                        className={`px-3 py-1 text-xs rounded ${
                          product.enabled
                            ? 'bg-gray-600 text-white hover:bg-gray-700'
                            : 'bg-green-600 text-white hover:bg-green-700'
                        } focus:outline-none focus:ring-2 focus:ring-offset-2`}
                      >
                        {product.enabled ? 'Disable' : 'Enable'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pagination.total_pages > 1 && (
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-700">
              Showing page {pagination.page} of {pagination.total_pages} ({pagination.total} total)
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 border border-gray-300 rounded text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage(Math.min(pagination.total_pages, currentPage + 1))}
                disabled={currentPage === pagination.total_pages}
                className="px-3 py-1 border border-gray-300 rounded text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};