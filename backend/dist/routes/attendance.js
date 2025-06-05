"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const attendanceController_1 = require("../controllers/attendanceController");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
/**
 * @route   GET /api/attendance
 * @desc    Get all attendance logs with filtering options
 * @access  Private
 */
router.get('/', auth_1.authenticate, attendanceController_1.getAllAttendanceLogs);
/**
 * @route   GET /api/attendance/:id
 * @desc    Get a single attendance log by ID
 * @access  Private
 */
router.get('/:id', auth_1.authenticate, attendanceController_1.getAttendanceLog);
/**
 * @route   POST /api/attendance
 * @desc    Create a new attendance log (manual entry)
 * @access  Private (Admin only)
 */
router.post('/', auth_1.authenticate, (0, auth_1.authorize)('admin'), attendanceController_1.createAttendanceLog);
/**
 * @route   DELETE /api/attendance/:id
 * @desc    Delete an attendance log
 * @access  Private (Admin only)
 */
router.delete('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin'), attendanceController_1.deleteAttendanceLog);
/**
 * @route   GET /api/attendance/summary/date-range
 * @desc    Get attendance summary by date range
 * @access  Private
 */
router.get('/summary/date-range', auth_1.authenticate, attendanceController_1.getAttendanceSummary);
/**
 * @route   GET /api/attendance/summary/today
 * @desc    Get today's attendance
 * @access  Private
 */
router.get('/summary/today', auth_1.authenticate, attendanceController_1.getTodayAttendance);
/**
 * @route   POST /api/attendance/record
 * @desc    Record attendance from camera system
 * @access  Public (API key required)
 */
router.post('/record', attendanceController_1.recordAttendance);
exports.default = router;
