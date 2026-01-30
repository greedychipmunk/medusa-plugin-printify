/**
 * Admin Configuration Test API Route
 * 
 * Handles testing Printify API connections.
 */

import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { PrintifyConfigurationService } from '../../../../../modules/printify/services/printify-configuration-service';
import { logger } from '../../../../../modules/printify/utils/logger';

const configService = new PrintifyConfigurationService();
const apiLogger = logger.child('AdminConfigTestAPI');

/**
 * POST /admin/printify/config/test
 * Test configuration connection to Printify API
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  try {
    const storeId = req.auth_context?.actor_id || 'default-store';
    
    apiLogger.info('Testing configuration', { storeId });

    const testResult = await configService.testConfiguration(storeId);

    if (testResult.success) {
      apiLogger.info('Configuration test successful', { storeId });
      
      res.status(200).json({
        success: true,
        message: 'Configuration test successful',
        data: {
          connection_status: 'connected',
          shop_info: testResult.shop_info,
        },
      });
    } else {
      apiLogger.warn('Configuration test failed', { storeId, error: testResult.error });
      
      res.status(400).json({
        success: false,
        error: 'Connection test failed',
        message: testResult.error || 'Failed to connect to Printify API',
        data: {
          connection_status: 'failed',
        },
      });
    }
  } catch (error) {
    apiLogger.error('Failed to test configuration', error as Error);

    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to test configuration',
    });
  }
}