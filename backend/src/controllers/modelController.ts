import { Request, Response, NextFunction } from 'express';
import pool from '../config/db';
import { ApiError } from '../middleware/errorHandler';
import axios from 'axios';

// Get all AI models
export const getAllModels = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await pool.query(
      `SELECT m.*, 
        (SELECT COUNT(*) FROM model_camera_assignments mca WHERE mca.model_id = m.model_id) as camera_count
       FROM system_models m
       ORDER BY m.name`
    );
    
    res.status(200).json({
      status: 'success',
      results: result.rows.length,
      data: {
        models: result.rows
      }
    });
  } catch (error) {
    next(error);
  }
};


// Get a single AI model by ID
export const getModel = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    
    // Get model details
    const modelResult = await pool.query(
      'SELECT * FROM system_models WHERE model_id = $1',
      [id]
    );
    
    if (modelResult.rows.length === 0) {
      throw new ApiError(404, 'Model not found');
    }
    
    // Get cameras assigned to this model
    const camerasResult = await pool.query(
      `SELECT c.camera_id, c.name, c.location, c.rtsp_url, mca.status
       FROM cctv_cameras c
       JOIN model_camera_assignments mca ON c.camera_id = mca.camera_id
       WHERE mca.model_id = $1`,
      [id]
    );
    
    res.status(200).json({
      status: 'success',
      data: {
        model: modelResult.rows[0],
        cameras: camerasResult.rows
      }
    });
  } catch (error) {
    next(error);
  }
};

// Create a new AI model
export const createModel = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, description, type, api_key, endpoint_url, parameters } = req.body;
    
    // Validate required fields
    if (!name || !type) {
      throw new ApiError(400, 'Name and type are required');
    }
    
    // Create model
    const result = await pool.query(
      `INSERT INTO system_models (
        name, description, type, api_key, endpoint_url, parameters
      ) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, description, type, api_key, endpoint_url, parameters]
    );
    
    res.status(201).json({
      status: 'success',
      data: {
        model: result.rows[0]
      }
    });
  } catch (error) {
    next(error);
  }
};

// Update an AI model
export const updateModel = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { name, description, type, api_key, endpoint_url, parameters } = req.body;
    
    // Check if model exists
    const modelExists = await pool.query(
      'SELECT * FROM system_models WHERE model_id = $1',
      [id]
    );
    
    if (modelExists.rows.length === 0) {
      throw new ApiError(404, 'Model not found');
    }
    
    // Update model
    const result = await pool.query(
      `UPDATE system_models SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        type = COALESCE($3, type),
        api_key = COALESCE($4, api_key),
        endpoint_url = COALESCE($5, endpoint_url),
        parameters = COALESCE($6, parameters),
        updated_at = NOW()
       WHERE model_id = $7
       RETURNING *`,
      [name, description, type, api_key, endpoint_url, parameters, id]
    );
    
    res.status(200).json({
      status: 'success',
      data: {
        model: result.rows[0]
      }
    });
  } catch (error) {
    next(error);
  }
};

// Delete an AI model
export const deleteModel = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    
    // Check if model exists
    const modelExists = await pool.query(
      'SELECT * FROM system_models WHERE model_id = $1',
      [id]
    );
    
    if (modelExists.rows.length === 0) {
      throw new ApiError(404, 'Model not found');
    }
    
    // Check if model is assigned to any cameras
    const assignmentsResult = await pool.query(
      'SELECT * FROM model_camera_assignments WHERE model_id = $1',
      [id]
    );
    
    if (assignmentsResult.rows.length > 0) {
      // Stop the model on all cameras first
      for (const assignment of assignmentsResult.rows) {
        try {
          // Call the camera server to stop the model
          await axios.post(`${process.env.CAMERA_SERVER_URL}/api/models/stop`, {
            model_id: id,
            camera_id: assignment.camera_id
          });
        } catch (error) {
          console.error(`Failed to stop model ${id} on camera ${assignment.camera_id}:`, error);
          // Continue with deletion even if stopping fails
        }
        
        // Delete the assignment
        await pool.query(
          'DELETE FROM model_camera_assignments WHERE model_id = $1 AND camera_id = $2',
          [id, assignment.camera_id]
        );
      }
    }
    
    // Delete model
    await pool.query(
      'DELETE FROM system_models WHERE model_id = $1',
      [id]
    );
    
    res.status(204).json({
      status: 'success',
      data: null
    });
  } catch (error) {
    next(error);
  }
};

// Start an AI model on a specific camera
export const startModel = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { camera_id } = req.body;
    
    if (!camera_id) {
      throw new ApiError(400, 'Camera ID is required');
    }
    
    // Check if model exists
    const modelResult = await pool.query(
      'SELECT * FROM system_models WHERE model_id = $1',
      [id]
    );
    
    if (modelResult.rows.length === 0) {
      throw new ApiError(404, 'Model not found');
    }
    
    // Check if camera exists
    const cameraResult = await pool.query(
      'SELECT * FROM cctv_cameras WHERE camera_id = $1',
      [camera_id]
    );
    
    if (cameraResult.rows.length === 0) {
      throw new ApiError(404, 'Camera not found');
    }
    
    // Check if assignment already exists
    const assignmentResult = await pool.query(
      'SELECT * FROM model_camera_assignments WHERE model_id = $1 AND camera_id = $2',
      [id, camera_id]
    );
    
    // Call the camera server to start the model
    try {
      await axios.post(`${process.env.CAMERA_SERVER_URL}/api/models/start`, {
        model_id: id,
        camera_id: camera_id
      });
      
      // Create or update assignment
      let result;
      if (assignmentResult.rows.length === 0) {
        // Create new assignment
        result = await pool.query(
          `INSERT INTO model_camera_assignments (
            model_id, camera_id, status
          ) VALUES ($1, $2, 'running') RETURNING *`,
          [id, camera_id]
        );
      } else {
        // Update existing assignment
        result = await pool.query(
          `UPDATE model_camera_assignments 
           SET status = 'running', updated_at = NOW()
           WHERE model_id = $1 AND camera_id = $2
           RETURNING *`,
          [id, camera_id]
        );
      }
      
      // Create notification
      const model = modelResult.rows[0];
      const camera = cameraResult.rows[0];
      
      await pool.query(
        'INSERT INTO notifications (message) VALUES ($1)',
        [`${model.name} model started on camera ${camera.name}`]
      );
      
      res.status(200).json({
        status: 'success',
        message: `Model ${model.name} started on camera ${camera.name}`,
        data: {
          assignment: result.rows[0]
        }
      });
    } catch (error) {
      console.error('Error starting model:', error);
      throw new ApiError(500, 'Failed to start model on camera server');
    }
  } catch (error) {
    next(error);
  }
};

// Stop an AI model running on a specific camera
export const stopModel = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { camera_id } = req.body;
    
    if (!camera_id) {
      throw new ApiError(400, 'Camera ID is required');
    }
    
    // Check if model exists
    const modelResult = await pool.query(
      'SELECT * FROM system_models WHERE model_id = $1',
      [id]
    );
    
    if (modelResult.rows.length === 0) {
      throw new ApiError(404, 'Model not found');
    }
    
    // Check if camera exists
    const cameraResult = await pool.query(
      'SELECT * FROM cctv_cameras WHERE camera_id = $1',
      [camera_id]
    );
    
    if (cameraResult.rows.length === 0) {
      throw new ApiError(404, 'Camera not found');
    }
    
    // Check if assignment exists
    const assignmentResult = await pool.query(
      'SELECT * FROM model_camera_assignments WHERE model_id = $1 AND camera_id = $2',
      [id, camera_id]
    );
    
    if (assignmentResult.rows.length === 0) {
      throw new ApiError(404, 'Model is not assigned to this camera');
    }
    
    // Call the camera server to stop the model
    try {
      await axios.post(`${process.env.CAMERA_SERVER_URL}/api/models/stop`, {
        model_id: id,
        camera_id: camera_id
      });
      
      // Update assignment
      await pool.query(
        `UPDATE model_camera_assignments 
         SET status = 'stopped', updated_at = NOW()
         WHERE model_id = $1 AND camera_id = $2`,
        [id, camera_id]
      );
      
      // Create notification
      const model = modelResult.rows[0];
      const camera = cameraResult.rows[0];
      
      await pool.query(
        'INSERT INTO notifications (message) VALUES ($1)',
        [`${model.name} model stopped on camera ${camera.name}`]
      );
      
      res.status(200).json({
        status: 'success',
        message: `Model ${model.name} stopped on camera ${camera.name}`
      });
    } catch (error) {
      console.error('Error stopping model:', error);
      throw new ApiError(500, 'Failed to stop model on camera server');
    }
  } catch (error) {
    next(error);
  }
};
