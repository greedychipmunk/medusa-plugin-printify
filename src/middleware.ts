import { 
  MedusaRequest, 
  MedusaResponse, 
  MiddlewareRoute,
  type MiddlewaresConfig 
} from '@medusajs/framework';
import { NextFunction } from 'express';
import { logger } from './modules/printify/utils/logger';

/**
 * Authentication middleware for admin routes
 */
export const authenticateAdmin = async (
  req: MedusaRequest, 
  res: MedusaResponse, 
  next: NextFunction
): Promise<void> => {
  try {
    // In a real implementation, this would validate the admin session/token
    // For now, we'll add basic logging and pass through
    logger.info('Admin route accessed', {
      method: req.method,
      url: req.url,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
    });

    // Add user context if available (in real implementation, this would come from session)
    if (!req.user) {
      req.user = {
        id: 'admin-user',
        email: 'admin@example.com',
        store_id: 'default-store',
      };
    }

    next();
  } catch (error) {
    logger.error('Admin authentication error', error as Error, {
      method: req.method,
      url: req.url,
    });
    
    res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Admin authentication required',
    });
  }
};

/**
 * Request validation middleware
 */
export const validateRequest = async (
  req: MedusaRequest, 
  res: MedusaResponse, 
  next: NextFunction
): Promise<void> => {
  try {
    // Add request ID for tracking
    req.requestId = req.get('X-Request-ID') || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Log incoming request
    logger.info('API request received', {
      requestId: req.requestId,
      method: req.method,
      url: req.url,
      contentType: req.get('Content-Type'),
      contentLength: req.get('Content-Length'),
    });

    next();
  } catch (error) {
    logger.error('Request validation error', error as Error, {
      method: req.method,
      url: req.url,
    });
    
    res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Invalid request format',
    });
  }
};

/**
 * Audit logging middleware
 */
export const auditLogger = async (
  req: MedusaRequest, 
  res: MedusaResponse, 
  next: NextFunction
): Promise<void> => {
  const startTime = Date.now();
  
  // Store original response methods
  const originalJson = res.json.bind(res);
  let responseData: any = null;

  // Override res.json to capture response data
  res.json = function(data: any) {
    responseData = data;
    
    // Log response data
    const endTime = Date.now();
    const duration = endTime - startTime;

    logger.info('API request completed', {
      requestId: req.requestId,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration,
      userId: req.user?.id,
      storeId: req.user?.store_id,
      success: res.statusCode < 400,
      ...(data?.error && { error: data.error }),
    });

    // Create audit log entry for sensitive operations
    if (req.method !== 'GET' && req.url.includes('/admin/printify/')) {
      logger.info('Admin action audit', {
        requestId: req.requestId,
        action: `${req.method} ${req.url}`,
        userId: req.user?.id,
        userEmail: req.user?.email,
        storeId: req.user?.store_id,
        statusCode: res.statusCode,
        duration,
        requestBody: req.method !== 'GET' ? req.body : undefined,
        responseSuccess: res.statusCode < 400,
        timestamp: new Date().toISOString(),
        category: 'audit',
      });
    }

    return originalJson(data);
  };

  next();
};

/**
 * Error handling middleware
 */
export const errorHandler = (
  error: Error, 
  req: MedusaRequest, 
  res: MedusaResponse, 
  next: NextFunction
): void => {
  logger.error('Unhandled route error', error, {
    requestId: req.requestId,
    method: req.method,
    url: req.url,
    userId: req.user?.id,
  });

  if (res.headersSent) {
    return next(error);
  }

  res.status(500).json({
    success: false,
    error: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred',
    ...(process.env.NODE_ENV === 'development' && { 
      details: error.message,
      stack: error.stack 
    }),
  });
};

/**
 * Middleware configuration for the plugin
 */
export const config: MiddlewaresConfig = {
  routes: [
    // Apply validation and audit logging to all admin Printify routes
    {
      matcher: '/admin/printify/*',
      middlewares: [validateRequest, authenticateAdmin, auditLogger],
    },
  ],
};

// Extend MedusaRequest type to include our custom properties
declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      user?: {
        id: string;
        email: string;
        store_id?: string;
      };
    }
  }
}