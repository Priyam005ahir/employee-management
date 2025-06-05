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
exports.generateFaceEncoding = exports.getEmployeeAttendance = exports.deleteEmployee = exports.updateEmployee = exports.createEmployee = exports.getEmployee = exports.getAllEmployees = exports.upload = void 0;
const db_1 = __importDefault(require("../config/db"));
const errorHandler_1 = require("../middleware/errorHandler");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
// Configure multer for file uploads
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path_1.default.join(__dirname, '../../uploads/employees');
        if (!fs_1.default.existsSync(uploadDir)) {
            fs_1.default.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path_1.default.extname(file.originalname);
        cb(null, 'employee-' + uniqueSuffix + ext);
    }
});
exports.upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path_1.default.extname(file.originalname).toLowerCase());
        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('Only .jpeg, .jpg and .png files are allowed'));
    }
});
// Get all employees
const getAllEmployees = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const result = yield db_1.default.query('SELECT employee_id, employee_name, designation FROM employee ORDER BY employee_name');
        res.status(200).json({
            status: 'success',
            results: result.rows.length,
            data: {
                employees: result.rows
            }
        });
    }
    catch (error) {
        next(error);
    }
});
exports.getAllEmployees = getAllEmployees;
// Get a single employee
const getEmployee = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const result = yield db_1.default.query('SELECT employee_id, employee_name, designation FROM employee WHERE employee_id = $1', [id]);
        if (result.rows.length === 0) {
            throw new errorHandler_1.ApiError(404, 'Employee not found');
        }
        res.status(200).json({
            status: 'success',
            data: {
                employee: result.rows[0]
            }
        });
    }
    catch (error) {
        next(error);
    }
});
exports.getEmployee = getEmployee;
// Create a new employee
const createEmployee = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { employee_name, designation } = req.body;
        let face_encoding = null;
        let image_url = null;
        // Basic validation
        if (!employee_name) {
            throw new errorHandler_1.ApiError(400, 'Employee name is required');
        }
        // Handle file upload if present
        if (req.file) {
            // The image URL would be relative to the server
            image_url = `/uploads/employees/${req.file.filename}`;
            // In a real application, you would process the image to generate face encoding
            // For now, we'll just store a placeholder
            face_encoding = Buffer.from('placeholder_face_encoding');
        }
        // Create employee
        const result = yield db_1.default.query(`INSERT INTO employee (
        employee_name, designation, face_encoding, image_url
      ) VALUES ($1, $2, $3, $4) RETURNING *`, [employee_name, designation, face_encoding, image_url]);
        // Create notification for new employee
        yield db_1.default.query('INSERT INTO notifications (message) VALUES ($1)', [`New employee "${employee_name}" has been registered`]);
        // Don't return the face_encoding in the response
        const employee = result.rows[0];
        delete employee.face_encoding;
        res.status(201).json({
            status: 'success',
            data: {
                employee
            }
        });
    }
    catch (error) {
        next(error);
    }
});
exports.createEmployee = createEmployee;
// Update an employee
const updateEmployee = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { employee_name, designation } = req.body;
        let face_encoding = null;
        let image_url = null;
        // Check if employee exists
        const employeeExists = yield db_1.default.query('SELECT * FROM employee WHERE employee_id = $1', [id]);
        if (employeeExists.rows.length === 0) {
            throw new errorHandler_1.ApiError(404, 'Employee not found');
        }
        // Handle file upload if present
        if (req.file) {
            // The image URL would be relative to the server
            image_url = `/uploads/employees/${req.file.filename}`;
            // In a real application, you would process the image to generate face encoding
            // For now, we'll just store a placeholder
            face_encoding = Buffer.from('placeholder_face_encoding');
            // Delete old image if it exists
            const oldEmployee = employeeExists.rows[0];
            if (oldEmployee.image_url) {
                const oldImagePath = path_1.default.join(__dirname, '../../', oldEmployee.image_url);
                if (fs_1.default.existsSync(oldImagePath)) {
                    fs_1.default.unlinkSync(oldImagePath);
                }
            }
        }
        // Update employee
        const result = yield db_1.default.query(`UPDATE employee 
       SET employee_name = COALESCE($1, employee_name),
           designation = COALESCE($2, designation),
           face_encoding = COALESCE($3, face_encoding),
           image_url = COALESCE($4, image_url)
       WHERE employee_id = $5
       RETURNING *`, [employee_name, designation, face_encoding, image_url, id]);
        // Don't return the face_encoding in the response
        const employee = result.rows[0];
        delete employee.face_encoding;
        res.status(200).json({
            status: 'success',
            data: {
                employee
            }
        });
    }
    catch (error) {
        next(error);
    }
});
exports.updateEmployee = updateEmployee;
// Delete an employee
const deleteEmployee = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        // Check if employee exists
        const employeeExists = yield db_1.default.query('SELECT * FROM employee WHERE employee_id = $1', [id]);
        if (employeeExists.rows.length === 0) {
            throw new errorHandler_1.ApiError(404, 'Employee not found');
        }
        // Delete employee image if it exists
        const employee = employeeExists.rows[0];
        if (employee.image_url) {
            const imagePath = path_1.default.join(__dirname, '../../', employee.image_url);
            if (fs_1.default.existsSync(imagePath)) {
                fs_1.default.unlinkSync(imagePath);
            }
        }
        // Delete employee
        yield db_1.default.query('DELETE FROM employee WHERE employee_id = $1', [id]);
        // Create notification for deleted employee
        yield db_1.default.query('INSERT INTO notifications (message) VALUES ($1)', [`Employee "${employee.employee_name}" has been removed`]);
        res.status(204).json({
            status: 'success',
            data: null
        });
    }
    catch (error) {
        next(error);
    }
});
exports.deleteEmployee = deleteEmployee;
// Get employee attendance logs
const getEmployeeAttendance = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        // Check if employee exists
        const employeeExists = yield db_1.default.query('SELECT * FROM employee WHERE employee_id = $1', [id]);
        if (employeeExists.rows.length === 0) {
            throw new errorHandler_1.ApiError(404, 'Employee not found');
        }
        // Get attendance logs
        const result = yield db_1.default.query(`SELECT al.log_id, al.timestamp, al.gesture_detected, c.name as camera_name
       FROM attendance_logs al
       JOIN cctv_cameras c ON al.camera_id = c.camera_id
       WHERE al.employee_id = $1
       ORDER BY al.timestamp DESC`, [id]);
        res.status(200).json({
            status: 'success',
            results: result.rows.length,
            data: {
                attendance: result.rows
            }
        });
    }
    catch (error) {
        next(error);
    }
});
exports.getEmployeeAttendance = getEmployeeAttendance;
// Generate face encoding from image
const generateFaceEncoding = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!req.file) {
            throw new errorHandler_1.ApiError(400, 'No image provided');
        }
        // In a real application, you would use a face recognition library
        // to generate the face encoding from the uploaded image
        // For now, we'll just return a placeholder
        const faceEncoding = Buffer.from('placeholder_face_encoding').toString('base64');
        res.status(200).json({
            status: 'success',
            data: {
                face_encoding: faceEncoding,
                message: 'Face encoding generated successfully'
            }
        });
        // Clean up the uploaded file
        fs_1.default.unlinkSync(req.file.path);
    }
    catch (error) {
        // Clean up the uploaded file if it exists
        if (req.file && fs_1.default.existsSync(req.file.path)) {
            fs_1.default.unlinkSync(req.file.path);
        }
        next(error);
    }
});
exports.generateFaceEncoding = generateFaceEncoding;
