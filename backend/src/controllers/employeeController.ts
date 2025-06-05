import { Request, Response, NextFunction } from 'express';
import pool from '../config/db';
import { ApiError } from '../middleware/errorHandler';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/employees');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'employee-' + uniqueSuffix + ext);
  }
});

export const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    
    if (mimetype && extname) {
      return cb(null, true);
    }
    
    cb(new Error('Only .jpeg, .jpg and .png files are allowed'));
  }
});

// Get all employees
export const getAllEmployees = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await pool.query('SELECT employee_id, name, designation, department FROM employee ORDER BY name');
    
    res.status(200).json({
      status: 'success',
      results: result.rows.length,
      data: {
        employees: result.rows
      }
    });
  } catch (error) {
    console.error('Error fetching employees:', error);
    next(error);
  }
};

// Get a single employee
export const getEmployee = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    
    if (!id || isNaN(Number(id))) {
      throw new ApiError(400, 'Invalid employee ID');
    }
    
    const result = await pool.query(
      'SELECT employee_id, name, designation, department FROM employee WHERE employee_id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      throw new ApiError(404, 'Employee not found');
    }
    
    res.status(200).json({
      status: 'success',
      data: {
        employee: result.rows[0]
      }
    });
  } catch (error) {
    console.error('Error fetching employee:', error);
    next(error);
  }
};

// Create a new employee
export const createEmployee = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, designation, department, face_encoding } = req.body;
    
    // Basic validation
    if (!name || !name.trim()) {
      throw new ApiError(400, 'Employee name is required');
    }
    
    // Create employee (let database auto-generate employee_id)
    const result = await pool.query(
      `INSERT INTO employee (
        name, designation, department, face_encoding
      ) VALUES ( $1, $2, $3, $4) RETURNING *`,
      [name.trim(), designation || null, department || null, face_encoding || null]
    );
    
    // Create notification for new employee
    try {
      await pool.query(
        'INSERT INTO notifications (message) VALUES ($1)',
        [`New employee "${name}" has been registered`]
      );
    } catch (notificationError) {
      console.warn('Failed to create notification:', notificationError);
    }
    
    // Don't return the face_encoding in the response
    const employee = { ...result.rows[0] };
    delete employee.face_encoding;
    
    res.status(201).json({
      status: 'success',
      data: {
        employee
      }
    });
  } catch (error) {
    console.error('Error creating employee:', error);
    // Clean up uploaded file if there was an error
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error('Error cleaning up file:', unlinkError);
      }
    }
    next(error);
  }
};

// Update an employee
export const updateEmployee = async (req: Request, res: Response, next: NextFunction) => {
  try {
    console.log('req.body:', req.body);
    console.log('req.file:', req.file);
    
    const { id } = req.params;
    const { name, employee_name, designation, department } = req.body;
    
    // Use either 'name' or 'employee_name' field
    const employeeName = name || employee_name;
    
    let face_encoding = null;
    
    if (!id || isNaN(Number(id))) {
      throw new ApiError(400, 'Invalid employee ID');
    }
    
    // Check if employee exists
    const employeeExists = await pool.query(
      'SELECT * FROM employee WHERE employee_id = $1',
      [id]
    );
    
    if (employeeExists.rows.length === 0) {
      throw new ApiError(404, 'Employee not found');
    }
    
    // Handle file upload if present (for face encoding generation)
    if (req.file) {
      face_encoding = Buffer.from('placeholder_face_encoding');
      
      // Clean up uploaded file after processing
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.warn('Failed to delete uploaded file:', unlinkError);
      }
    }
    
    // Update employee
    const result = await pool.query(
      `UPDATE employee 
       SET name = COALESCE($1, name),
           designation = COALESCE($2, designation),
           department = COALESCE($3, department),
           face_encoding = COALESCE($4, face_encoding)
       WHERE employee_id = $5
       RETURNING *`,
      [employeeName, designation, department, face_encoding, id]
    );
    
    // Don't return the face_encoding in the response
    const employee = { ...result.rows[0] };
    delete employee.face_encoding;
    
    res.status(200).json({
      status: 'success',
      data: {
        employee
      }
    });
  } catch (error) {
    console.error('Error updating employee:', error);
    next(error);
  }
};

// Delete an employee
export const deleteEmployee = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    
    if (!id || isNaN(Number(id))) {
      throw new ApiError(400, 'Invalid employee ID');
    }
    
    // Check if employee exists
    const employeeExists = await pool.query(
      'SELECT * FROM employee WHERE employee_id = $1',
      [id]
    );
    
    if (employeeExists.rows.length === 0) {
      throw new ApiError(404, 'Employee not found');
    }
    
    const employee = employeeExists.rows[0];
    
    // Delete employee
    await pool.query(
      'DELETE FROM employee WHERE employee_id = $1',
      [id]
    );
    
    // Create notification for deleted employee
    try {
      await pool.query(
        'INSERT INTO notifications (message) VALUES ($1)',
        [`Employee "${employee.name}" has been removed`]
      );
    } catch (notificationError) {
      console.warn('Failed to create notification:', notificationError);
    }
    
    res.status(204).json({
      status: 'success',
      data: null
    });
  } catch (error) {
    console.error('Error deleting employee:', error);
    next(error);
  }
};

// Get employee attendance logs
export const getEmployeeAttendance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    
    if (!id || isNaN(Number(id))) {
      throw new ApiError(400, 'Invalid employee ID');
    }
    
    // Check if employee exists
    const employeeExists = await pool.query(
      'SELECT * FROM employee WHERE employee_id = $1',
      [id]
    );
    
    if (employeeExists.rows.length === 0) {
      throw new ApiError(404, 'Employee not found');
    }
    
    // Get attendance logs
    const result = await pool.query(
      `SELECT al.log_id, al.timestamp, al.gesture_detected, c.name as camera_name
       FROM attendance_logs al
       JOIN cctv_cameras c ON al.camera_id = c.camera_id
       WHERE al.employee_id = $1
       ORDER BY al.timestamp DESC`,
      [id]
    );
    
    res.status(200).json({
      status: 'success',
      results: result.rows.length,
      data: {
        attendance: result.rows
      }
    });
  } catch (error) {
    console.error('Error fetching employee attendance:', error);
    next(error);
  }
};

// Generate face encoding from image
export const generateFaceEncoding = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      throw new ApiError(400, 'No image provided');
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
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
  } catch (error) {
    console.error('Error generating face encoding:', error);
    // Clean up the uploaded file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error('Error cleaning up file:', unlinkError);
      }
    }
    next(error);
  }
};
