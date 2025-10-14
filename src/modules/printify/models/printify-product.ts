/**
 * PrintifyProduct Entity
 * 
 * Represents a Printify product and its enablement status in the Medusa store.
 * This entity manages the relationship between Printify products and Medusa products,
 * tracking enablement status and synchronization state.
 */

export interface PrintifyProductData {
  id: string;
  printify_product_id: string;
  medusa_product_id?: string;
  configuration_id: string;
  title: string;
  description?: string;
  enabled: boolean;
  printify_data: Record<string, any>; // JSON data from Printify API
  last_sync_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface PrintifyProductVariant {
  id: string;
  title: string;
  price: number;
  sku?: string;
  available: boolean;
}

export interface PrintifyProductImage {
  src: string;
  alt?: string;
  position: number;
}

export class PrintifyProduct {
  public readonly id: string;
  public readonly printify_product_id: string;
  public medusa_product_id?: string;
  public readonly configuration_id: string;
  public title: string;
  public description?: string;
  public enabled: boolean;
  public printify_data: Record<string, any>;
  public last_sync_at?: Date;
  public readonly created_at: Date;
  public updated_at: Date;

  constructor(data: PrintifyProductData) {
    this.id = data.id;
    this.printify_product_id = data.printify_product_id;
    this.medusa_product_id = data.medusa_product_id;
    this.configuration_id = data.configuration_id;
    this.title = data.title;
    this.description = data.description;
    this.enabled = data.enabled;
    this.printify_data = data.printify_data;
    this.last_sync_at = data.last_sync_at;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
  }

  /**
   * Enable product for storefront display
   */
  enable(): void {
    this.enabled = true;
    this.updated_at = new Date();
  }

  /**
   * Disable product from storefront display
   */
  disable(): void {
    this.enabled = false;
    this.updated_at = new Date();
  }

  /**
   * Toggle product enablement status
   */
  toggle(): void {
    this.enabled = !this.enabled;
    this.updated_at = new Date();
  }

  /**
   * Link to a Medusa product
   */
  linkToMedusaProduct(medusaProductId: string): void {
    this.medusa_product_id = medusaProductId;
    this.updated_at = new Date();
  }

  /**
   * Unlink from Medusa product
   */
  unlinkFromMedusaProduct(): void {
    this.medusa_product_id = undefined;
    this.updated_at = new Date();
  }

  /**
   * Update product data from Printify API
   */
  updateFromPrintify(printifyData: Record<string, any>): void {
    this.title = printifyData.title || this.title;
    this.description = printifyData.description || this.description;
    this.printify_data = { ...this.printify_data, ...printifyData };
    this.last_sync_at = new Date();
    this.updated_at = new Date();
  }

  /**
   * Check if product needs synchronization
   */
  needsSync(maxAgeMinutes: number = 60): boolean {
    if (!this.last_sync_at) {
      return true;
    }
    
    const ageMs = Date.now() - this.last_sync_at.getTime();
    const ageMinutes = ageMs / (1000 * 60);
    
    return ageMinutes > maxAgeMinutes;
  }

  /**
   * Get product variants from Printify data
   */
  getVariants(): PrintifyProductVariant[] {
    return this.printify_data.variants || [];
  }

  /**
   * Get product images from Printify data
   */
  getImages(): PrintifyProductImage[] {
    return this.printify_data.images || [];
  }

  /**
   * Get base price (lowest variant price)
   */
  getBasePrice(): number {
    const variants = this.getVariants();
    if (variants.length === 0) return 0;
    
    return Math.min(...variants.map(v => v.price));
  }

  /**
   * Check if product is available (has available variants)
   */
  isAvailable(): boolean {
    const variants = this.getVariants();
    return variants.some(v => v.available);
  }

  /**
   * Convert to plain object for database storage
   */
  toData(): PrintifyProductData {
    return {
      id: this.id,
      printify_product_id: this.printify_product_id,
      medusa_product_id: this.medusa_product_id,
      configuration_id: this.configuration_id,
      title: this.title,
      description: this.description,
      enabled: this.enabled,
      printify_data: this.printify_data,
      last_sync_at: this.last_sync_at,
      created_at: this.created_at,
      updated_at: this.updated_at,
    };
  }

  /**
   * Create a new product from Printify data
   */
  static createFromPrintify(params: {
    printify_product_id: string;
    configuration_id: string;
    printifyData: Record<string, any>;
    enabled?: boolean;
  }): PrintifyProduct {
    const now = new Date();
    const id = `printify_product_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const data: PrintifyProductData = {
      id,
      printify_product_id: params.printify_product_id,
      configuration_id: params.configuration_id,
      title: params.printifyData.title || 'Untitled Product',
      description: params.printifyData.description,
      enabled: params.enabled ?? false,
      printify_data: params.printifyData,
      last_sync_at: now,
      created_at: now,
      updated_at: now,
    };

    return new PrintifyProduct(data);
  }
}