import express from 'express';
import { 
  getDashboardStats,
  getAttendanceStats,
  getEmployeeAttendanceComparison,
  getCameraActivityStats,
  getSafetyIncidentStats,
  getNotificationsStats,
  markNotificationsAsRead
} from '../controllers/statsController';
import { authenticate } from '../middleware/auth';

const router = express.Router();

/**
 * @route   GET /api/stats/dashboard
 * @desc    Get dashboard statistics
 * @access  Private
 */
router.get('/dashboard', authenticate, getDashboardStats);

/**
 * @route   GET /api/stats/attendance
 * @desc    Get attendance statistics by time period
 * @access  Private
 */
router.get('/attendance', authenticate, getAttendanceStats);

/**
 * @route   GET /api/stats/employees/attendance
 * @desc    Get employee attendance comparison
 * @access  Private
 */
router.get('/employees/attendance', authenticate, getEmployeeAttendanceComparison);

/**
 * @route   GET /api/stats/cameras/activity
 * @desc    Get camera activity statistics
 * @access  Private
 */
router.get('/cameras/activity', authenticate, getCameraActivityStats);

/**
 * @route   GET /api/stats/safety-incidents
 * @desc    Get safety incident statistics
 * @access  Private
 */
router.get('/safety-incidents', authenticate, getSafetyIncidentStats);

/**
 * @route   GET /api/stats/notifications
 * @desc    Get notifications statistics
 * @access  Private
 */
router.get('/notifications', authenticate, getNotificationsStats);

/**
 * @route   POST /api/stats/notifications/mark-read
 * @desc    Mark notifications as read
 * @access  Private
 */
router.post('/notifications/mark-read', authenticate, markNotificationsAsRead);

export default router;
