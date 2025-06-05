import { Request, Response, NextFunction } from 'express';
import pool from '../config/db';
import { ApiError } from '../middleware/errorHandler';

// Helper function to get pagination parameters
const getPaginationParams = (req: Request) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;
  const offset = (page - 1) * limit;
  return { page, limit, offset };
};

// Get all notifications with filtering options
export const getAllNotifications = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit, offset } = getPaginationParams(req);
    const userId = req.user?.id;
    
    // Get filter parameters
    const read = req.query.read !== undefined ? req.query.read === 'true' : undefined;
    const type = req.query.type as string | undefined;
    
    // Build query conditions
    let conditions = [];
    let params = [];
    let paramIndex = 1;
    
    // Add user-specific condition if needed
    // In this case, we're showing all notifications to all users
    // If you want user-specific notifications, uncomment the following:
    /*
    if (userId) {
      conditions.push(`(user_id IS NULL OR user_id = $${paramIndex})`);
      params.push(userId);
      paramIndex++;
    }
    */
    
    // Add read status condition if specified
    if (read !== undefined) {
      conditions.push(`read = $${paramIndex}`);
      params.push(read);
      paramIndex++;
    }
    
    // Add type condition if specified
    if (type) {
      conditions.push(`type = $${paramIndex}`);
      params.push(type);
      paramIndex++;
    }
    
    // Build the WHERE clause
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    // Get total count
    const countQuery = `SELECT COUNT(*) FROM notifications ${whereClause}`;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);
    
    // Get notifications with pagination
    const query = `
      SELECT * FROM notifications
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    // Add pagination parameters
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    res.status(200).json({
      status: 'success',
      results: result.rows.length,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      },
      data: {
        notifications: result.rows
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get a single notification by ID
export const getNotification = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'SELECT * FROM notifications WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      throw new ApiError(404, 'Notification not found');
    }
    
    res.status(200).json({
      status: 'success',
      data: {
        notification: result.rows[0]
      }
    });
  } catch (error) {
    next(error);
  }
};

// Create a new notification
export const createNotification = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { message, type, user_id, link, metadata } = req.body;
    
    // Validate required fields
    if (!message) {
      throw new ApiError(400, 'Message is required');
    }
    
    // Create notification
    const result = await pool.query(
      `INSERT INTO notifications (
        message, type, user_id, link, metadata
      ) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [message, type || 'info', user_id || null, link || null, metadata || null]
    );
    
    res.status(201).json({
      status: 'success',
      data: {
        notification: result.rows[0]
      }
    });
  } catch (error) {
    next(error);
  }
};

// Mark a notification as read
export const markAsRead = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    
    // Check if notification exists
    const checkResult = await pool.query(
      'SELECT * FROM notifications WHERE id = $1',
      [id]
    );
    
    if (checkResult.rows.length === 0) {
      throw new ApiError(404, 'Notification not found');
    }
    
    // Check if notification belongs to user (if user-specific)
    const notification = checkResult.rows[0];
    if (notification.user_id && notification.user_id !== userId) {
      throw new ApiError(403, 'You do not have permission to mark this notification as read');
    }
    
    // Mark as read
    const result = await pool.query(
      'UPDATE notifications SET read = true, updated_at = NOW() WHERE id = $1 RETURNING *',
      [id]
    );
    
    res.status(200).json({
      status: 'success',
      data: {
        notification: result.rows[0]
      }
    });
  } catch (error) {
    next(error);
  }
};

// Mark all notifications as read
export const markAllAsRead = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    
    // Mark all as read (either global or user-specific)
    const result = await pool.query(
      `UPDATE notifications 
       SET read = true, updated_at = NOW() 
       WHERE read = false AND (user_id IS NULL OR user_id = $1)
       RETURNING *`,
      [userId]
    );
    
    res.status(200).json({
      status: 'success',
      results: result.rows.length,
      message: `${result.rows.length} notifications marked as read`,
      data: {
        notifications: result.rows
      }
    });
  } catch (error) {
    next(error);
  }
};

// Delete a notification
export const deleteNotification = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    
    // Check if notification exists
    const checkResult = await pool.query(
      'SELECT * FROM notifications WHERE id = $1',
      [id]
    );
    
    if (checkResult.rows.length === 0) {
      throw new ApiError(404, 'Notification not found');
    }
    
    // Check if notification belongs to user (if user-specific)
    const notification = checkResult.rows[0];
    if (notification.user_id && notification.user_id !== userId) {
      throw new ApiError(403, 'You do not have permission to delete this notification');
    }
    
    // Delete notification
    await pool.query(
      'DELETE FROM notifications WHERE id = $1',
      [id]
    );
    
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

// Delete all read notifications
export const deleteAllRead = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    
    // Delete all read notifications (either global or user-specific)
    const result = await pool.query(
      `DELETE FROM notifications 
       WHERE read = true AND (user_id IS NULL OR user_id = $1)
       RETURNING id`,
      [userId]
    );
    
    const deletedCount = result.rows.length;
    
    res.status(200).json({
      status: 'success',
      message: `${deletedCount} read notifications deleted`,
      data: {
        count: deletedCount
      }
    });
  } catch (error) {
    next(error);
  }
};
