import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ApiError } from './errorHandler';

// Extend Express Request type to include user property
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role?: string;
      };
    }
  }
}

// Authenticate middleware
export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get token from cookie or Authorization header
    const token = req.cookies.accessToken || 
                 (req.headers.authorization?.startsWith('Bearer') 
                  ? req.headers.authorization.split(' ')[1] 
                  : null);
    
    if (!token) {
      throw new ApiError(401, 'Not authenticated. Please log in');
    }
    
    // Verify token
    try {
      const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET as string) as { userId: string, role?: string };
      
      // Add user info to request
      req.user = {
        id: decoded.userId,
        role: decoded.role
      };
      
      next();
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        throw new ApiError(401, 'Invalid token. Please log in again');
      }
      if (error instanceof jwt.TokenExpiredError) {
        throw new ApiError(401, 'Token expired. Please refresh your token');
      }
      throw error;
    }
  } catch (error) {
    next(error);
  }
};

// Authorization middleware
export const authorize = (...roles: string[]) => {
  /**
   * Middleware to authorize user access based on specified roles
   * 
   * @param roles - Array of roles allowed to access the route
   * @returns A middleware function that checks user authentication and role permissions
   * @throws {ApiError} 401 if user is not authenticated
   * @throws {ApiError} 403 if user does not have required role permissions
   */
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new ApiError(401, 'Not authenticated. Please log in'));
    }
    
    if (!roles.includes(req.user.role || '')) {
      return next(new ApiError(403, 'You do not have permission to perform this action'));
      
    }
    
    
    next();
  };
};
