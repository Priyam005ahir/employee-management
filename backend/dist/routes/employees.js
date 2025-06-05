"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const employeeController_1 = require("../controllers/employeeController");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
/**
 * @route   GET /api/employees
 * @desc    Get all employees
 * @access  Private
 */
router.get('/', auth_1.authenticate, employeeController_1.getAllEmployees);
/**
 * @route   GET /api/employees/:id
 * @desc    Get a single employee by ID
 * @access  Private
 */
router.get('/:id', auth_1.authenticate, employeeController_1.getEmployee);
/**
 * @route   POST /api/employees
 * @desc    Create a new employee
 * @access  Private (Admin only)
 */
router.post('/', auth_1.authenticate, (0, auth_1.authorize)('admin'), employeeController_1.upload.single('image'), employeeController_1.createEmployee);
/**
 * @route   PUT /api/employees/:id
 * @desc    Update an employee
 * @access  Private (Admin only)
 */
router.put('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin'), employeeController_1.upload.single('image'), employeeController_1.updateEmployee);
/**
 * @route   DELETE /api/employees/:id
 * @desc    Delete an employee
 * @access  Private (Admin only)
 */
router.delete('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin'), employeeController_1.deleteEmployee);
/**
 * @route   GET /api/employees/:id/attendance
 * @desc    Get attendance logs for an employee
 * @access  Private
 */
router.get('/:id/attendance', auth_1.authenticate, employeeController_1.getEmployeeAttendance);
/**
 * @route   POST /api/employees/face-encoding
 * @desc    Generate face encoding from image
 * @access  Private (Admin only)
 */
router.post('/face-encoding', auth_1.authenticate, (0, auth_1.authorize)('admin'), employeeController_1.upload.single('image'), employeeController_1.generateFaceEncoding);
exports.default = router;
