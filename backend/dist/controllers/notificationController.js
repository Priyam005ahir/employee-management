"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteAllRead = exports.deleteNotification = exports.markAllAsRead = exports.markAsRead = exports.createNotification = exports.getNotification = exports.getAllNotifications = void 0;
const db_1 = __importDefault(require("../config/db"));
const errorHandler_1 = require("../middleware/errorHandler");
// Helper function to get pagination parameters
const getPaginationParams = (req) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    return { page, limit, offset };
};
// Get all notifications with filtering options
const getAllNotifications = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { page, limit, offset } = getPaginationParams(req);
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        // Get filter parameters
        const read = req.query.read !== undefined ? req.query.read === 'true' : undefined;
        const type = req.query.type;
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
        const countResult = yield db_1.default.query(countQuery, params);
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
        const result = yield db_1.default.query(query, params);
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
    }
    catch (error) {
        next(error);
    }
});
exports.getAllNotifications = getAllNotifications;
// Get a single notification by ID
const getNotification = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const result = yield db_1.default.query('SELECT * FROM notifications WHERE id = $1', [id]);
        if (result.rows.length === 0) {
            throw new errorHandler_1.ApiError(404, 'Notification not found');
        }
        res.status(200).json({
            status: 'success',
            data: {
                notification: result.rows[0]
            }
        });
    }
    catch (error) {
        next(error);
    }
});
exports.getNotification = getNotification;
// Create a new notification
const createNotification = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { message, type, user_id, link, metadata } = req.body;
        // Validate required fields
        if (!message) {
            throw new errorHandler_1.ApiError(400, 'Message is required');
        }
        // Create notification
        const result = yield db_1.default.query(`INSERT INTO notifications (
        message, type, user_id, link, metadata
      ) VALUES ($1, $2, $3, $4, $5) RETURNING *`, [message, type || 'info', user_id || null, link || null, metadata || null]);
        res.status(201).json({
            status: 'success',
            data: {
                notification: result.rows[0]
            }
        });
    }
    catch (error) {
        next(error);
    }
});
exports.createNotification = createNotification;
// Mark a notification as read
const markAsRead = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { id } = req.params;
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        // Check if notification exists
        const checkResult = yield db_1.default.query('SELECT * FROM notifications WHERE id = $1', [id]);
        if (checkResult.rows.length === 0) {
            throw new errorHandler_1.ApiError(404, 'Notification not found');
        }
        // Check if notification belongs to user (if user-specific)
        const notification = checkResult.rows[0];
        if (notification.user_id && notification.user_id !== userId) {
            throw new errorHandler_1.ApiError(403, 'You do not have permission to mark this notification as read');
        }
        // Mark as read
        const result = yield db_1.default.query('UPDATE notifications SET read = true, updated_at = NOW() WHERE id = $1 RETURNING *', [id]);
        res.status(200).json({
            status: 'success',
            data: {
                notification: result.rows[0]
            }
        });
    }
    catch (error) {
        next(error);
    }
});
exports.markAsRead = markAsRead;
// Mark all notifications as read
const markAllAsRead = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        // Mark all as read (either global or user-specific)
        const result = yield db_1.default.query(`UPDATE notifications 
       SET read = true, updated_at = NOW() 
       WHERE read = false AND (user_id IS NULL OR user_id = $1)
       RETURNING *`, [userId]);
        res.status(200).json({
            status: 'success',
            results: result.rows.length,
            message: `${result.rows.length} notifications marked as read`,
            data: {
                notifications: result.rows
            }
        });
    }
    catch (error) {
        next(error);
    }
});
exports.markAllAsRead = markAllAsRead;
// Delete a notification
const deleteNotification = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { id } = req.params;
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        // Check if notification exists
        const checkResult = yield db_1.default.query('SELECT * FROM notifications WHERE id = $1', [id]);
        if (checkResult.rows.length === 0) {
            throw new errorHandler_1.ApiError(404, 'Notification not found');
        }
        // Check if notification belongs to user (if user-specific)
        const notification = checkResult.rows[0];
        if (notification.user_id && notification.user_id !== userId) {
            throw new errorHandler_1.ApiError(403, 'You do not have permission to delete this notification');
        }
        // Delete notification
        yield db_1.default.query('DELETE FROM notifications WHERE id = $1', [id]);
        res.status(204).send();
    }
    catch (error) {
        next(error);
    }
});
exports.deleteNotification = deleteNotification;
// Delete all read notifications
const deleteAllRead = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        // Delete all read notifications (either global or user-specific)
        const result = yield db_1.default.query(`DELETE FROM notifications 
       WHERE read = true AND (user_id IS NULL OR user_id = $1)
       RETURNING id`, [userId]);
        const deletedCount = result.rows.length;
        res.status(200).json({
            status: 'success',
            message: `${deletedCount} read notifications deleted`,
            data: {
                count: deletedCount
            }
        });
    }
    catch (error) {
        next(error);
    }
});
exports.deleteAllRead = deleteAllRead;
