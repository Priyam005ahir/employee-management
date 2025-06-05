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
exports.stopModel = exports.startModel = exports.deleteModel = exports.updateModel = exports.createModel = exports.getModel = exports.getAllModels = void 0;
const db_1 = __importDefault(require("../config/db"));
const errorHandler_1 = require("../middleware/errorHandler");
const axios_1 = __importDefault(require("axios"));
// Get all AI models
const getAllModels = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const result = yield db_1.default.query(`SELECT m.*, 
        (SELECT COUNT(*) FROM model_camera_assignments mca WHERE mca.model_id = m.model_id) as camera_count
       FROM models m
       ORDER BY m.name`);
        res.status(200).json({
            status: 'success',
            results: result.rows.length,
            data: {
                models: result.rows
            }
        });
    }
    catch (error) {
        next(error);
    }
});
exports.getAllModels = getAllModels;
// Get a single AI model by ID
const getModel = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        // Get model details
        const modelResult = yield db_1.default.query('SELECT * FROM models WHERE model_id = $1', [id]);
        if (modelResult.rows.length === 0) {
            throw new errorHandler_1.ApiError(404, 'Model not found');
        }
        // Get cameras assigned to this model
        const camerasResult = yield db_1.default.query(`SELECT c.camera_id, c.name, c.location, c.rtsp_url, mca.status
       FROM cctv_cameras c
       JOIN model_camera_assignments mca ON c.camera_id = mca.camera_id
       WHERE mca.model_id = $1`, [id]);
        res.status(200).json({
            status: 'success',
            data: {
                model: modelResult.rows[0],
                cameras: camerasResult.rows
            }
        });
    }
    catch (error) {
        next(error);
    }
});
exports.getModel = getModel;
// Create a new AI model
const createModel = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { name, description, type, api_key, endpoint_url, parameters } = req.body;
        // Validate required fields
        if (!name || !type) {
            throw new errorHandler_1.ApiError(400, 'Name and type are required');
        }
        // Create model
        const result = yield db_1.default.query(`INSERT INTO models (
        name, description, type, api_key, endpoint_url, parameters
      ) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`, [name, description, type, api_key, endpoint_url, parameters]);
        res.status(201).json({
            status: 'success',
            data: {
                model: result.rows[0]
            }
        });
    }
    catch (error) {
        next(error);
    }
});
exports.createModel = createModel;
// Update an AI model
const updateModel = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { name, description, type, api_key, endpoint_url, parameters } = req.body;
        // Check if model exists
        const modelExists = yield db_1.default.query('SELECT * FROM models WHERE model_id = $1', [id]);
        if (modelExists.rows.length === 0) {
            throw new errorHandler_1.ApiError(404, 'Model not found');
        }
        // Update model
        const result = yield db_1.default.query(`UPDATE models SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        type = COALESCE($3, type),
        api_key = COALESCE($4, api_key),
        endpoint_url = COALESCE($5, endpoint_url),
        parameters = COALESCE($6, parameters),
        updated_at = NOW()
       WHERE model_id = $7
       RETURNING *`, [name, description, type, api_key, endpoint_url, parameters, id]);
        res.status(200).json({
            status: 'success',
            data: {
                model: result.rows[0]
            }
        });
    }
    catch (error) {
        next(error);
    }
});
exports.updateModel = updateModel;
// Delete an AI model
const deleteModel = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        // Check if model exists
        const modelExists = yield db_1.default.query('SELECT * FROM models WHERE model_id = $1', [id]);
        if (modelExists.rows.length === 0) {
            throw new errorHandler_1.ApiError(404, 'Model not found');
        }
        // Check if model is assigned to any cameras
        const assignmentsResult = yield db_1.default.query('SELECT * FROM model_camera_assignments WHERE model_id = $1', [id]);
        if (assignmentsResult.rows.length > 0) {
            // Stop the model on all cameras first
            for (const assignment of assignmentsResult.rows) {
                try {
                    // Call the camera server to stop the model
                    yield axios_1.default.post(`${process.env.CAMERA_SERVER_URL}/api/models/stop`, {
                        model_id: id,
                        camera_id: assignment.camera_id
                    });
                }
                catch (error) {
                    console.error(`Failed to stop model ${id} on camera ${assignment.camera_id}:`, error);
                    // Continue with deletion even if stopping fails
                }
                // Delete the assignment
                yield db_1.default.query('DELETE FROM model_camera_assignments WHERE model_id = $1 AND camera_id = $2', [id, assignment.camera_id]);
            }
        }
        // Delete model
        yield db_1.default.query('DELETE FROM models WHERE model_id = $1', [id]);
        res.status(204).json({
            status: 'success',
            data: null
        });
    }
    catch (error) {
        next(error);
    }
});
exports.deleteModel = deleteModel;
// Start an AI model on a specific camera
const startModel = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { camera_id } = req.body;
        if (!camera_id) {
            throw new errorHandler_1.ApiError(400, 'Camera ID is required');
        }
        // Check if model exists
        const modelResult = yield db_1.default.query('SELECT * FROM models WHERE model_id = $1', [id]);
        if (modelResult.rows.length === 0) {
            throw new errorHandler_1.ApiError(404, 'Model not found');
        }
        // Check if camera exists
        const cameraResult = yield db_1.default.query('SELECT * FROM cctv_cameras WHERE camera_id = $1', [camera_id]);
        if (cameraResult.rows.length === 0) {
            throw new errorHandler_1.ApiError(404, 'Camera not found');
        }
        // Check if assignment already exists
        const assignmentResult = yield db_1.default.query('SELECT * FROM model_camera_assignments WHERE model_id = $1 AND camera_id = $2', [id, camera_id]);
        // Call the camera server to start the model
        try {
            yield axios_1.default.post(`${process.env.CAMERA_SERVER_URL}/api/models/start`, {
                model_id: id,
                camera_id: camera_id
            });
            // Create or update assignment
            let result;
            if (assignmentResult.rows.length === 0) {
                // Create new assignment
                result = yield db_1.default.query(`INSERT INTO model_camera_assignments (
            model_id, camera_id, status
          ) VALUES ($1, $2, 'running') RETURNING *`, [id, camera_id]);
            }
            else {
                // Update existing assignment
                result = yield db_1.default.query(`UPDATE model_camera_assignments 
           SET status = 'running', updated_at = NOW()
           WHERE model_id = $1 AND camera_id = $2
           RETURNING *`, [id, camera_id]);
            }
            // Create notification
            const model = modelResult.rows[0];
            const camera = cameraResult.rows[0];
            yield db_1.default.query('INSERT INTO notifications (message) VALUES ($1)', [`${model.name} model started on camera ${camera.name}`]);
            res.status(200).json({
                status: 'success',
                message: `Model ${model.name} started on camera ${camera.name}`,
                data: {
                    assignment: result.rows[0]
                }
            });
        }
        catch (error) {
            console.error('Error starting model:', error);
            throw new errorHandler_1.ApiError(500, 'Failed to start model on camera server');
        }
    }
    catch (error) {
        next(error);
    }
});
exports.startModel = startModel;
// Stop an AI model running on a specific camera
const stopModel = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { camera_id } = req.body;
        if (!camera_id) {
            throw new errorHandler_1.ApiError(400, 'Camera ID is required');
        }
        // Check if model exists
        const modelResult = yield db_1.default.query('SELECT * FROM models WHERE model_id = $1', [id]);
        if (modelResult.rows.length === 0) {
            throw new errorHandler_1.ApiError(404, 'Model not found');
        }
        // Check if camera exists
        const cameraResult = yield db_1.default.query('SELECT * FROM cctv_cameras WHERE camera_id = $1', [camera_id]);
        if (cameraResult.rows.length === 0) {
            throw new errorHandler_1.ApiError(404, 'Camera not found');
        }
        // Check if assignment exists
        const assignmentResult = yield db_1.default.query('SELECT * FROM model_camera_assignments WHERE model_id = $1 AND camera_id = $2', [id, camera_id]);
        if (assignmentResult.rows.length === 0) {
            throw new errorHandler_1.ApiError(404, 'Model is not assigned to this camera');
        }
        // Call the camera server to stop the model
        try {
            yield axios_1.default.post(`${process.env.CAMERA_SERVER_URL}/api/models/stop`, {
                model_id: id,
                camera_id: camera_id
            });
            // Update assignment
            yield db_1.default.query(`UPDATE model_camera_assignments 
         SET status = 'stopped', updated_at = NOW()
         WHERE model_id = $1 AND camera_id = $2`, [id, camera_id]);
            // Create notification
            const model = modelResult.rows[0];
            const camera = cameraResult.rows[0];
            yield db_1.default.query('INSERT INTO notifications (message) VALUES ($1)', [`${model.name} model stopped on camera ${camera.name}`]);
            res.status(200).json({
                status: 'success',
                message: `Model ${model.name} stopped on camera ${camera.name}`
            });
        }
        catch (error) {
            console.error('Error stopping model:', error);
            throw new errorHandler_1.ApiError(500, 'Failed to stop model on camera server');
        }
    }
    catch (error) {
        next(error);
    }
});
exports.stopModel = stopModel;
