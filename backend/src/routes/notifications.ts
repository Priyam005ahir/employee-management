import express from 'express';
import { 
  getAllNotifications,
  getNotification,
  createNotification,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteAllRead
} from '../controllers/notificationController';
import { authenticate } from '../middleware/auth';

const router = express.Router();

/**
 * @route   GET /api/notifications
 * @desc    Get all notifications with filtering options
 * @access  Private
 */
router.get('/', authenticate, getAllNotifications);

/**
 * @route   GET /api/notifications/:id
 * @desc    Get a single notification by ID
 * @access  Private
 */
router.get('/:id', authenticate, getNotification);

/**
 * @route   POST /api/notifications
 * @desc    Create a new notification
 * @access  Private (System or Admin only)
 */
router.post('/', createNotification);

/**
 * @route   PATCH /api/notifications/:id/read
 * @desc    Mark a notification as read
 * @access  Private
 */
router.patch('/:id/read', authenticate, markAsRead);

/**
 * @route   PATCH /api/notifications/read-all
 * @desc    Mark all notifications as read
 * @access  Private
 */
router.patch('/read-all', authenticate, markAllAsRead);

/**
 * @route   DELETE /api/notifications/:id
 * @desc    Delete a notification
 * @access  Private
 */
router.delete('/:id', authenticate, deleteNotification);

/**
 * @route   DELETE /api/notifications/delete-read
 * @desc    Delete all read notifications
 * @access  Private
 */
router.delete('/delete-read', authenticate, deleteAllRead);

export default router;
