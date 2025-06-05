import { Request, Response, NextFunction } from 'express';
import pool from '../config/db';
import { ApiError } from '../middleware/errorHandler';

// Get all cameras
export const getAllCameras = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await pool.query('SELECT * FROM cctv_cameras ORDER BY camera_id');
    
    res.status(200).json({
      status: 'success',
      results: result.rows.length,
      data: {
        cameras: result.rows
      }
    });
  } catch (error) {
    console.error('Error fetching cameras:', error);
    next(error);
  }
};

// Get a single camera
export const getCamera = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      throw new ApiError(400, 'Camera ID is required');
    }
    
    const result = await pool.query(
      'SELECT * FROM cctv_cameras WHERE camera_id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      throw new ApiError(404, 'Camera not found');
    }
    
    res.status(200).json({
      status: 'success',
      data: {
        camera: result.rows[0]
      }
    });
  } catch (error) {
    console.error('Error fetching camera:', error);
    next(error);
  }
};

// Create a new camera
export const createCamera = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, camera_name, location, rtsp_url } = req.body;
    
    // Use either 'name' or 'camera_name' field
    const cameraName = name || camera_name;
    
    // Basic validation
    if (!cameraName || !cameraName.trim()) {
      throw new ApiError(400, 'Camera name is required');
    }
    
    if (!location || !location.trim()) {
      throw new ApiError(400, 'Camera location is required');
    }
    
    if (!rtsp_url || !rtsp_url.trim()) {
      throw new ApiError(400, 'RTSP URL is required');
    }
    
    // Create camera (let database auto-generate camera_id)
    const result = await pool.query(
      `INSERT INTO cctv_cameras (
        camera_name, location, rtsp_url
      ) VALUES ($1, $2, $3) RETURNING *`,
      [cameraName.trim(), location.trim(), rtsp_url.trim()]
    );
    
    // Create notification for new camera
    try {
      await pool.query(
        'INSERT INTO notifications (message) VALUES ($1)',
        [`New camera "${cameraName}" has been added at ${location}`]
      );
    } catch (notificationError) {
      console.warn('Failed to create notification:', notificationError);
    }
    
    res.status(201).json({
      status: 'success',
      data: {
        camera: result.rows[0]
      }
    });
  } catch (error) {
    console.error('Error creating camera:', error);
    next(error);
  }
};

// Update a camera
export const updateCamera = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { name, camera_name, location, rtsp_url } = req.body;
    
    // Use either 'name' or 'camera_name' field
    const cameraName = name || camera_name;
    
    if (!id) {
      throw new ApiError(400, 'Camera ID is required');
    }
    
    // Check if camera exists
    const cameraExists = await pool.query(
      'SELECT * FROM cctv_cameras WHERE camera_id = $1',
      [id]
    );
    
    if (cameraExists.rows.length === 0) {
      throw new ApiError(404, 'Camera not found');
    }
    
    // Update camera
    const result = await pool.query(
      `UPDATE cctv_cameras 
       SET camera_name = COALESCE($1, camera_name),
           name = COALESCE($1, name),
           location = COALESCE($2, location),
           rtsp_url = COALESCE($3, rtsp_url)
       WHERE camera_id = $4
       RETURNING *`,
      [cameraName, location, rtsp_url, id]
    );
    
    res.status(200).json({
      status: 'success',
      data: {
        camera: result.rows[0]
      }
    });
  } catch (error) {
    console.error('Error updating camera:', error);
    next(error);
  }
};

// Delete a camera
export const deleteCamera = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      throw new ApiError(400, 'Camera ID is required');
    }
    
    // Check if camera exists
    const cameraExists = await pool.query(
      'SELECT * FROM cctv_cameras WHERE camera_id = $1',
      [id]
    );
    
    if (cameraExists.rows.length === 0) {
      throw new ApiError(404, 'Camera not found');
    }
    
    const camera = cameraExists.rows[0];
    
    // Delete camera
    await pool.query(
      'DELETE FROM cctv_cameras WHERE camera_id = $1',
      [id]
    );
    
    // Create notification for deleted camera
    try {
      await pool.query(
        'INSERT INTO notifications (message) VALUES ($1)',
        [`Camera "${camera.camera_name || camera.name}" has been removed`]
      );
    } catch (notificationError) {
      console.warn('Failed to create notification:', notificationError);
    }
    
    res.status(204).json({
      status: 'success',
      data: null
    });
  } catch (error) {
    console.error('Error deleting camera:', error);
    next(error);
  }
};
