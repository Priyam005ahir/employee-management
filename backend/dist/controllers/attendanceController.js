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
exports.recordAttendance = exports.getTodayAttendance = exports.getAttendanceSummary = exports.deleteAttendanceLog = exports.createAttendanceLog = exports.getAttendanceLog = exports.getAllAttendanceLogs = void 0;
const db_1 = __importDefault(require("../config/db"));
const errorHandler_1 = require("../middleware/errorHandler");
// Get all attendance logs
const getAllAttendanceLogs = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { startDate, endDate, employeeId, cameraId } = req.query;
        let query = `
      SELECT al.log_id, al.timestamp, al.gesture_detected, 
             e.employee_id, e.employee_name, 
             c.camera_id, c.name as camera_name
      FROM attendance_logs al
      JOIN employee e ON al.employee_id = e.employee_id
      JOIN cctv_cameras c ON al.camera_id = c.camera_id
    `;
        const queryParams = [];
        const conditions = [];
        // Add date range filter
        if (startDate) {
            queryParams.push(startDate);
            conditions.push(`al.timestamp >= $${queryParams.length}`);
        }
        if (endDate) {
            queryParams.push(endDate);
            conditions.push(`al.timestamp <= $${queryParams.length}`);
        }
        // Add employee filter
        if (employeeId) {
            queryParams.push(employeeId);
            conditions.push(`al.employee_id = $${queryParams.length}`);
        }
        // Add camera filter
        if (cameraId) {
            queryParams.push(cameraId);
            conditions.push(`al.camera_id = $${queryParams.length}`);
        }
        // Add WHERE clause if there are conditions
        if (conditions.length > 0) {
            query += ` WHERE ${conditions.join(' AND ')}`;
        }
        // Add ORDER BY
        query += ` ORDER BY al.timestamp DESC`;
        // Add pagination
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const offset = (page - 1) * limit;
        queryParams.push(limit);
        queryParams.push(offset);
        query += ` LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}`;
        // Execute query
        const result = yield db_1.default.query(query, queryParams);
        // Get total count for pagination
        let countQuery = `
      SELECT COUNT(*) as total
      FROM attendance_logs al
    `;
        if (conditions.length > 0) {
            countQuery += ` WHERE ${conditions.join(' AND ')}`;
        }
        const countResult = yield db_1.default.query(countQuery, queryParams.slice(0, -2));
        const total = parseInt(countResult.rows[0].total);
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
                logs: result.rows
            }
        });
    }
    catch (error) {
        next(error);
    }
});
exports.getAllAttendanceLogs = getAllAttendanceLogs;
// Get attendance log by ID
const getAttendanceLog = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const result = yield db_1.default.query(`SELECT al.log_id, al.timestamp, al.gesture_detected, 
              e.employee_id, e.employee_name, 
              c.camera_id, c.name as camera_name
       FROM attendance_logs al
       JOIN employee e ON al.employee_id = e.employee_id
       JOIN cctv_cameras c ON al.camera_id = c.camera_id
       WHERE al.log_id = $1`, [id]);
        if (result.rows.length === 0) {
            throw new errorHandler_1.ApiError(404, 'Attendance log not found');
        }
        res.status(200).json({
            status: 'success',
            data: {
                log: result.rows[0]
            }
        });
    }
    catch (error) {
        next(error);
    }
});
exports.getAttendanceLog = getAttendanceLog;
// Create a new attendance log (manual entry)
const createAttendanceLog = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { employee_id, camera_id, gesture_detected, timestamp } = req.body;
        // Basic validation
        if (!employee_id || !camera_id) {
            throw new errorHandler_1.ApiError(400, 'Employee ID and Camera ID are required');
        }
        // Check if employee exists
        const employeeExists = yield db_1.default.query('SELECT * FROM employee WHERE employee_id = $1', [employee_id]);
        if (employeeExists.rows.length === 0) {
            throw new errorHandler_1.ApiError(404, 'Employee not found');
        }
        // Check if camera exists
        const cameraExists = yield db_1.default.query('SELECT * FROM cctv_cameras WHERE camera_id = $1', [camera_id]);
        if (cameraExists.rows.length === 0) {
            throw new errorHandler_1.ApiError(404, 'Camera not found');
        }
        // Create attendance log
        const result = yield db_1.default.query(`INSERT INTO attendance_logs (
        employee_id, camera_id, gesture_detected, timestamp
      ) VALUES ($1, $2, $3, $4) RETURNING *`, [
            employee_id,
            camera_id,
            gesture_detected || 'manual_entry',
            timestamp || new Date()
        ]);
        // Get employee and camera details for the response
        const log = result.rows[0];
        const employee = employeeExists.rows[0];
        const camera = cameraExists.rows[0];
        res.status(201).json({
            status: 'success',
            data: {
                log: Object.assign(Object.assign({}, log), { employee_name: employee.employee_name, camera_name: camera.name })
            }
        });
    }
    catch (error) {
        next(error);
    }
});
exports.createAttendanceLog = createAttendanceLog;
// Delete an attendance log
const deleteAttendanceLog = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        // Check if log exists
        const logExists = yield db_1.default.query('SELECT * FROM attendance_logs WHERE log_id = $1', [id]);
        if (logExists.rows.length === 0) {
            throw new errorHandler_1.ApiError(404, 'Attendance log not found');
        }
        // Delete log
        yield db_1.default.query('DELETE FROM attendance_logs WHERE log_id = $1', [id]);
        res.status(204).json({
            status: 'success',
            data: null
        });
    }
    catch (error) {
        next(error);
    }
});
exports.deleteAttendanceLog = deleteAttendanceLog;
// Get attendance summary by date range
const getAttendanceSummary = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { startDate, endDate } = req.query;
        if (!startDate || !endDate) {
            throw new errorHandler_1.ApiError(400, 'Start date and end date are required');
        }
        // Get daily attendance counts
        const dailyResult = yield db_1.default.query(`SELECT 
        DATE(timestamp) as date,
        COUNT(DISTINCT employee_id) as employee_count
       FROM attendance_logs
       WHERE timestamp BETWEEN $1 AND $2
       GROUP BY DATE(timestamp)
       ORDER BY date`, [startDate, endDate]);
        // Get employee attendance summary
        const employeeResult = yield db_1.default.query(`SELECT 
        e.employee_id,
        e.employee_name,
        COUNT(DISTINCT DATE(al.timestamp)) as days_present
       FROM employee e
       LEFT JOIN attendance_logs al ON e.employee_id = al.employee_id
       AND al.timestamp BETWEEN $1 AND $2
       GROUP BY e.employee_id, e.employee_name
       ORDER BY days_present DESC`, [startDate, endDate]);
        // Calculate date range length in days
        const start = new Date(startDate);
        const end = new Date(endDate);
        const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 3600 * 24)) + 1;
        res.status(200).json({
            status: 'success',
            data: {
                dateRange: {
                    startDate,
                    endDate,
                    totalDays
                },
                dailyAttendance: dailyResult.rows,
                employeeSummary: employeeResult.rows.map(emp => (Object.assign(Object.assign({}, emp), { attendance_percentage: Math.round((emp.days_present / totalDays) * 100) })))
            }
        });
    }
    catch (error) {
        next(error);
    }
});
exports.getAttendanceSummary = getAttendanceSummary;
// Get today's attendance
const getTodayAttendance = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const today = new Date().toISOString().split('T')[0];
        // Get employees present today
        const presentResult = yield db_1.default.query(`SELECT DISTINCT 
        e.employee_id, 
        e.employee_name,
        e.designation,
        MIN(al.timestamp) as check_in_time
       FROM employee e
       JOIN attendance_logs al ON e.employee_id = al.employee_id
       WHERE DATE(al.timestamp) = $1
       GROUP BY e.employee_id, e.employee_name, e.designation
       ORDER BY check_in_time`, [today]);
        // Get all employees for calculating absent employees
        const allEmployeesResult = yield db_1.default.query('SELECT employee_id, employee_name, designation FROM employee');
        const presentEmployeeIds = presentResult.rows.map(emp => emp.employee_id);
        const absentEmployees = allEmployeesResult.rows.filter(emp => !presentEmployeeIds.includes(emp.employee_id));
        res.status(200).json({
            status: 'success',
            data: {
                date: today,
                present: {
                    count: presentResult.rows.length,
                    employees: presentResult.rows
                },
                absent: {
                    count: absentEmployees.length,
                    employees: absentEmployees
                }
            }
        });
    }
    catch (error) {
        next(error);
    }
});
exports.getTodayAttendance = getTodayAttendance;
// Record attendance from camera system
const recordAttendance = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { employee_id, camera_id, gesture_detected } = req.body;
        // Basic validation
        if (!employee_id || !camera_id || !gesture_detected) {
            throw new errorHandler_1.ApiError(400, 'Employee ID, Camera ID, and gesture are required');
        }
        // Check if employee exists
        const employeeExists = yield db_1.default.query('SELECT * FROM employee WHERE employee_id = $1', [employee_id]);
        if (employeeExists.rows.length === 0) {
            throw new errorHandler_1.ApiError(404, 'Employee not found');
        }
        // Check if camera exists
        const cameraExists = yield db_1.default.query('SELECT * FROM cctv_cameras WHERE camera_id = $1', [camera_id]);
        if (cameraExists.rows.length === 0) {
            throw new errorHandler_1.ApiError(404, 'Camera not found');
        }
        // Create attendance log
        const result = yield db_1.default.query(`INSERT INTO attendance_logs (
        employee_id, camera_id, gesture_detected
      ) VALUES ($1, $2, $3) RETURNING *`, [employee_id, camera_id, gesture_detected]);
        // Create notification
        const employee = employeeExists.rows[0];
        const camera = cameraExists.rows[0];
        let notificationMessage = '';
        if (gesture_detected === 'thumb_up') {
            notificationMessage = `${employee.employee_name} checked in at ${camera.name}`;
        }
        else if (gesture_detected === 'thumb_down') {
            notificationMessage = `${employee.employee_name} checked out at ${camera.name}`;
        }
        else {
            notificationMessage = `${employee.employee_name} detected at ${camera.name}`;
        }
        yield db_1.default.query('INSERT INTO notifications (message) VALUES ($1)', [notificationMessage]);
        res.status(201).json({
            status: 'success',
            data: {
                log: result.rows[0]
            }
        });
    }
    catch (error) {
        next(error);
    }
});
exports.recordAttendance = recordAttendance;
