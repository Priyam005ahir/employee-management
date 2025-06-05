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
exports.deleteCamera = exports.updateCamera = exports.createCamera = exports.getCamera = exports.getAllCameras = void 0;
const db_1 = __importDefault(require("../config/db"));
const errorHandler_1 = require("../middleware/errorHandler");
// Get all cameras
const getAllCameras = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const result = yield db_1.default.query('SELECT * FROM cctv_cameras ORDER BY name');
        res.status(200).json({
            status: 'success',
            results: result.rows.length,
            data: {
                cameras: result.rows
            }
        });
    }
    catch (error) {
        next(error);
    }
});
exports.getAllCameras = getAllCameras;
// Get a single camera
const getCamera = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const result = yield db_1.default.query('SELECT * FROM cctv_cameras WHERE camera_id = $1', [id]);
        if (result.rows.length === 0) {
            throw new errorHandler_1.ApiError(404, 'Camera not found');
        }
        res.status(200).json({
            status: 'success',
            data: {
                camera: result.rows[0]
            }
        });
    }
    catch (error) {
        next(error);
    }
});
exports.getCamera = getCamera;
// Create a new camera
const createCamera = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { name, location, rtsp_url, brand, model, resolution, frame_rate, lens_type, night_vision, viewing_angle, ip_address, mac_address, port, protocol, connection_type, storage_type, storage_capacity, recording_mode, retention_period, installation_date, last_maintenance_date, status, firmware_version, username, password_hash, access_level } = req.body;
        // Basic validation
        if (!name || !rtsp_url) {
            throw new errorHandler_1.ApiError(400, 'Name and RTSP URL are required');
        }
        // Create camera with basic required fields
        const result = yield db_1.default.query(`INSERT INTO cctv_cameras (
        name, location, rtsp_url, status
      ) VALUES ($1, $2, $3, $4) RETURNING *`, [name, location, rtsp_url, status || 'active']);
        // Create notification for new camera
        yield db_1.default.query('INSERT INTO notifications (message) VALUES ($1)', [`New camera "${name}" has been added`]);
        res.status(201).json({
            status: 'success',
            data: {
                camera: result.rows[0]
            }
        });
    }
    catch (error) {
        next(error);
    }
});
exports.createCamera = createCamera;
// Update a camera
const updateCamera = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { name, location, rtsp_url, status } = req.body;
        // Check if camera exists
        const cameraExists = yield db_1.default.query('SELECT * FROM cctv_cameras WHERE camera_id = $1', [id]);
        if (cameraExists.rows.length === 0) {
            throw new errorHandler_1.ApiError(404, 'Camera not found');
        }
        // Update camera
        const result = yield db_1.default.query(`UPDATE cctv_cameras 
       SET name = COALESCE($1, name),
           location = COALESCE($2, location),
           rtsp_url = COALESCE($3, rtsp_url),
           status = COALESCE($4, status)
       WHERE camera_id = $5
       RETURNING *`, [name, location, rtsp_url, status, id]);
        res.status(200).json({
            status: 'success',
            data: {
                camera: result.rows[0]
            }
        });
    }
    catch (error) {
        next(error);
    }
});
exports.updateCamera = updateCamera;
// Delete a camera
const deleteCamera = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        // Check if camera exists
        const cameraExists = yield db_1.default.query('SELECT * FROM cctv_cameras WHERE camera_id = $1', [id]);
        if (cameraExists.rows.length === 0) {
            throw new errorHandler_1.ApiError(404, 'Camera not found');
        }
        // Delete camera
        yield db_1.default.query('DELETE FROM cctv_cameras WHERE camera_id = $1', [id]);
        // Create notification for deleted camera
        yield db_1.default.query('INSERT INTO notifications (message) VALUES ($1)', [`Camera "${cameraExists.rows[0].name}" has been removed`]);
        res.status(204).json({
            status: 'success',
            data: null
        });
    }
    catch (error) {
        next(error);
    }
});
exports.deleteCamera = deleteCamera;
