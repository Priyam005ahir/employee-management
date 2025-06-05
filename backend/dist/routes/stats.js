"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const statsController_1 = require("../controllers/statsController");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
/**
 * @route   GET /api/stats/dashboard
 * @desc    Get dashboard statistics
 * @access  Private
 */
router.get('/dashboard', auth_1.authenticate, statsController_1.getDashboardStats);
/**
 * @route   GET /api/stats/attendance
 * @desc    Get attendance statistics by time period
 * @access  Private
 */
router.get('/attendance', auth_1.authenticate, statsController_1.getAttendanceStats);
/**
 * @route   GET /api/stats/employees/attendance
 * @desc    Get employee attendance comparison
 * @access  Private
 */
router.get('/employees/attendance', auth_1.authenticate, statsController_1.getEmployeeAttendanceComparison);
/**
 * @route   GET /api/stats/cameras/activity
 * @desc    Get camera activity statistics
 * @access  Private
 */
router.get('/cameras/activity', auth_1.authenticate, statsController_1.getCameraActivityStats);
/**
 * @route   GET /api/stats/safety-incidents
 * @desc    Get safety incident statistics
 * @access  Private
 */
router.get('/safety-incidents', auth_1.authenticate, statsController_1.getSafetyIncidentStats);
/**
 * @route   GET /api/stats/notifications
 * @desc    Get notifications statistics
 * @access  Private
 */
router.get('/notifications', auth_1.authenticate, statsController_1.getNotificationsStats);
/**
 * @route   POST /api/stats/notifications/mark-read
 * @desc    Mark notifications as read
 * @access  Private
 */
router.post('/notifications/mark-read', auth_1.authenticate, statsController_1.markNotificationsAsRead);
exports.default = router;
