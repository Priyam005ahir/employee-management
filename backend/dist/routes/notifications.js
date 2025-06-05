"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const notificationController_1 = require("../controllers/notificationController");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
/**
 * @route   GET /api/notifications
 * @desc    Get all notifications with filtering options
 * @access  Private
 */
router.get('/', auth_1.authenticate, notificationController_1.getAllNotifications);
/**
 * @route   GET /api/notifications/:id
 * @desc    Get a single notification by ID
 * @access  Private
 */
router.get('/:id', auth_1.authenticate, notificationController_1.getNotification);
/**
 * @route   POST /api/notifications
 * @desc    Create a new notification
 * @access  Private (System or Admin only)
 */
router.post('/', notificationController_1.createNotification);
/**
 * @route   PATCH /api/notifications/:id/read
 * @desc    Mark a notification as read
 * @access  Private
 */
router.patch('/:id/read', auth_1.authenticate, notificationController_1.markAsRead);
/**
 * @route   PATCH /api/notifications/read-all
 * @desc    Mark all notifications as read
 * @access  Private
 */
router.patch('/read-all', auth_1.authenticate, notificationController_1.markAllAsRead);
/**
 * @route   DELETE /api/notifications/:id
 * @desc    Delete a notification
 * @access  Private
 */
router.delete('/:id', auth_1.authenticate, notificationController_1.deleteNotification);
/**
 * @route   DELETE /api/notifications/delete-read
 * @desc    Delete all read notifications
 * @access  Private
 */
router.delete('/delete-read', auth_1.authenticate, notificationController_1.deleteAllRead);
exports.default = router;
