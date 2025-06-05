from urllib import response
from flask import Flask, Response, jsonify, request
from flask_cors import CORS
import cv2
import threading
from typing import Dict
import psycopg2
from psycopg2.extras import RealDictCursor
import psycopg2.pool
from dotenv import load_dotenv
import os
import numpy as np
import base64
import logging
import mediapipe as mp
from datetime import datetime, time
import time
from urllib.parse import unquote
from sklearn.metrics.pairwise import cosine_similarity
import face_recognition
import pickle
import json
import tensorflow as tf
from flask_cors import CORS
from langchain.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain.schema.messages import SystemMessage
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables.history import RunnableWithMessageHistory
from langchain_community.chat_message_histories import ChatMessageHistory
from langchain_google_genai import ChatGoogleGenerativeAI
import queue
from functools import lru_cache
import warnings
warnings.filterwarnings("ignore", category=UserWarning, module="mediapipe")

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": ["http://localhost:5173", "http://localhost:3001"]}},
     allow_headers=["Content-Type", "Authorization"],
     supports_credentials=True)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Backend API URL


BACKEND_API_URL = os.getenv("BACKEND_API_URL", "http://localhost:3001")

# Load environment variables
load_dotenv()

# PostgreSQL connection pool
try:
    db_pool = psycopg2.pool.SimpleConnectionPool(
        1, 20,  # min and max connections
        host=os.getenv("DB_HOST", "localhost"),
        port=os.getenv("DB_PORT", "5432"),
        database=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD")
    )
    logger.info("✅ PostgreSQL connection pool created successfully")
except Exception as e:
    logger.error(f"❌ Failed to create PostgreSQL connection pool: {e}")
    db_pool = None

# Add global variables to store recent events
recent_events = []
events_lock = threading.Lock()

def get_db_connection():
    """Get a database connection from the pool"""
    if db_pool:
        try:
            return db_pool.getconn()
        except Exception as e:
            logger.error(f"❌ Error getting database connection: {e}")
            return None
    return None

def return_db_connection(conn):
    """Return a database connection to the pool"""
    if db_pool and conn:
        try:
            db_pool.putconn(conn)
        except Exception as e:
            logger.error(f"❌ Error returning database connection: {e}")

# Initialize MediaPipe Hands for gesture detection
mp_hands = mp.solutions.hands
hands_processor = mp_hands.Hands(
    static_image_mode=False,
    max_num_hands=2,
    model_complexity=1,
    min_detection_confidence=0.7,
    min_tracking_confidence=0.5
)

# Global state to track active models
active_models = {}

def fix_base64_padding(encoded_str: str) -> str:
    """Add padding to base64 string if needed."""
    padding = len(encoded_str) % 4
    if padding:
        encoded_str += '=' * (4 - padding)
    return encoded_str

def safe_base64_decode(encoded_str: str) -> bytes:
    """Safely decode base64 string with padding correction."""
    try:
        # First try direct decoding
        return base64.b64decode(encoded_str)
    except Exception:
        try:
            # Try with padding correction
            padded_str = fix_base64_padding(encoded_str)
            return base64.b64decode(padded_str)
        except Exception as e:
            logger.error(f"Failed to decode base64 string: {str(e)}")
            raise

class Assistant:
    def __init__(self):
        self.fire_model = self._initialize_model(os.getenv("GOOGLE_API_KEY_FIRE"))
        self.helmet_model = self._initialize_model(os.getenv("GOOGLE_API_KEY_HELMET"))
        self.activity_model = self._initialize_model(os.getenv("GOOGLE_API_KEY_ACTIVITY")) 
        self.fire_chain = self._create_inference_chain(self.fire_model) if self.fire_model else None
        self.helmet_chain = self._create_inference_chain(self.helmet_model) if self.helmet_model else None
        self.activity_chain = self._create_inference_chain(self.activity_model) if self.activity_model else None  

        self.last_inference_time = 0
        self.inference_cooldown = 0.5

    def _initialize_model(self, api_key):
        try:
            if not api_key:
                logger.warning("API key not provided for model initialization")
                return None
            return ChatGoogleGenerativeAI(
                google_api_key=api_key,
                model="gemini-1.5-flash-latest",
                temperature=0.1,
                timeout=2
            )
        except Exception as e:
            logger.error(f"Model initialization error: {e}")
            return None

    def answer(self, image, prompt, model_type):
        if model_type == "fire":
            chain = self.fire_chain
        elif model_type == "helmet":
            chain = self.helmet_chain
        elif model_type == "activity":
            chain = self.activity_chain 
        else:
            return "Invalid model type"

        if not chain:
            return "Model not initialized"

        current_time = time.time()
        if current_time - self.last_inference_time < self.inference_cooldown:
            return None

        try:
            response = chain.invoke(
                {"prompt": prompt, "image_base64": image},
                config={"configurable": {"session_id": "unused"}},
            ).strip()
            self.last_inference_time = current_time
            return response
        except Exception as e:
            logger.error(f"AI inference error: {str(e)}")
            return f"Error: {str(e)}"

    def _create_inference_chain(self, model):
        SYSTEM_PROMPT = """You are a multi-purpose detection assistant. Analyze the provided image and respond accordingly."""

        prompt_template = ChatPromptTemplate.from_messages([
            SystemMessage(content=SYSTEM_PROMPT),
            MessagesPlaceholder(variable_name="chat_history"),
            ("human", [
                {"type": "text", "text": "{prompt}"},
                {"type": "image_url", "image_url": "data:image/jpeg;base64,{image_base64}"},
            ]),
        ])

        chain = prompt_template | model | StrOutputParser()
        return RunnableWithMessageHistory(
            chain,
            lambda _: ChatMessageHistory(),
            input_messages_key="prompt",
            history_messages_key="chat_history",
        )

# Initialize the assistant globally
assistant = Assistant()

class CameraManager:
    def __init__(self):
        self.cameras: Dict[str, cv2.VideoCapture] = {}
        self.locks: Dict[str, threading.Lock] = {}
        self.frame_queues: Dict[str, queue.Queue] = {}
        self.camera_status: Dict[str, bool] = {}

    def get_camera(self, camera_id: str, rtsp_url: str) -> cv2.VideoCapture:
        if camera_id not in self.cameras:
            logger.info(f"🎥 Initializing camera {camera_id} with URL: {rtsp_url}")
            
            # Try different backends for better compatibility
            cap = None
            backends = [cv2.CAP_FFMPEG, cv2.CAP_GSTREAMER, cv2.CAP_V4L2, cv2.CAP_ANY]
            
            for backend in backends:
                try:
                    cap = cv2.VideoCapture(rtsp_url, backend)
                    if cap.isOpened():
                        logger.info(f"✅ Camera {camera_id} opened with backend {backend}")
                        break
                    else:
                        cap.release()
                        cap = None
                except Exception as e:
                    logger.warning(f"Failed to open camera {camera_id} with backend {backend}: {e}")
                    if cap:
                        cap.release()
                        cap = None
            
            if not cap or not cap.isOpened():
                logger.error(f"❌ Failed to open camera {camera_id} with any backend")
                # Create a dummy camera for testing
                cap = cv2.VideoCapture(0)  # Try webcam as fallback
                if not cap.isOpened():
                    logger.error(f"❌ No fallback camera available for {camera_id}")
                    return None
            
            # Configure camera settings
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            cap.set(cv2.CAP_PROP_FPS, 30)
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
            
            self.cameras[camera_id] = cap
            self.locks[camera_id] = threading.Lock()
            self.frame_queues[camera_id] = queue.Queue(maxsize=2)
            self.camera_status[camera_id] = True
            
        return self.cameras[camera_id]

    def release_camera(self, camera_id: str):
        if camera_id in self.cameras:
            logger.info(f"🛑 Releasing camera {camera_id}")
            self.cameras[camera_id].release()
            del self.cameras[camera_id]
            if camera_id in self.locks:
                del self.locks[camera_id]
            if camera_id in self.frame_queues:
                del self.frame_queues[camera_id]
            if camera_id in self.camera_status:
                del self.camera_status[camera_id]

    def is_camera_active(self, camera_id: str) -> bool:
        return camera_id in self.cameras and self.camera_status.get(camera_id, False)

camera_manager = CameraManager()

def generate_frames(camera_id: str, rtsp_url: str):
    """Generate video frames for streaming"""
    camera = camera_manager.get_camera(camera_id, rtsp_url)
    if not camera:
        logger.error(f"❌ Cannot generate frames for camera {camera_id} - camera not available")
        return
    
    lock = camera_manager.locks[camera_id]
    frame_count = 0
    error_count = 0
    max_errors = 10
    
    logger.info(f"🎬 Starting frame generation for camera {camera_id}")
    
    while True:
        try:
            with lock:
                success, frame = camera.read()
                
                if not success:
                    error_count += 1
                    logger.warning(f"⚠️ Failed to read frame from camera {camera_id} (error {error_count}/{max_errors})")
                    
                    if error_count >= max_errors:
                        logger.error(f"❌ Too many errors for camera {camera_id}, stopping stream")
                        camera_manager.camera_status[camera_id] = False
                        break
                    
                    # Send a black frame on error
                    frame = np.zeros((480, 640, 3), dtype=np.uint8)
                    cv2.putText(frame, f"Camera {camera_id} Error", (50, 240), 
                               cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
                else:
                    error_count = 0  # Reset error count on successful read
                    frame_count += 1
                    
                    # Add frame info overlay
                    cv2.putText(frame, f"Camera {camera_id} - Frame {frame_count}", 
                               (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
                    cv2.putText(frame, f"Time: {datetime.now().strftime('%H:%M:%S')}", 
                               (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)
                
                # Encode frame
                ret, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
                if not ret:
                    logger.error(f"❌ Failed to encode frame from camera {camera_id}")
                    continue
                
                frame_bytes = buffer.tobytes()
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
                
        except Exception as e:
            logger.error(f"❌ Error in frame generation for camera {camera_id}: {e}")
            error_count += 1
            if error_count >= max_errors:
                break
            time.sleep(0.1)  # Brief pause before retry

def get_rtsp_url(camera_id: str) -> str:
    """Get RTSP URL for a camera from PostgreSQL database"""
    conn = None
    try:
        conn = get_db_connection()
        if not conn:
            logger.error("❌ No database connection available")
            return None
            
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Query the CCTV_CAMERAS table
        query = "SELECT rtsp_url FROM cctv_cameras WHERE camera_id = %s"
        cursor.execute(query, (camera_id,))
        
        result = cursor.fetchone()
        cursor.close()
        
        if result and result['rtsp_url']:
            rtsp_url = result['rtsp_url']
            logger.info(f"✅ Found RTSP URL for camera {camera_id}: {rtsp_url}")
            return unquote(rtsp_url)
        else:
            logger.warning(f"⚠️ No RTSP URL found for camera {camera_id}, using webcam fallback")
            return "0"  # Use default webcam
            
    except Exception as e:
        logger.error(f"❌ Error getting RTSP URL for camera {camera_id}: {e}")
        return "0"  # Fallback to webcam
    finally:
        if conn:
            return_db_connection(conn)

@app.route('/video_feed/<camera_id>')
def video_feed(camera_id):
    logger.info(f"🎬 Video feed requested for camera {camera_id}")
    
    rtsp_url = get_rtsp_url(camera_id)
    if not rtsp_url:
        logger.error(f"❌ No RTSP URL found for camera {camera_id}")
        return jsonify({'error': 'Camera not found'}), 404
    
    logger.info(f"📡 Camera {camera_id} source: {rtsp_url}")
    
    try:
        response = Response(
            generate_frames(camera_id, rtsp_url),
            mimetype='multipart/x-mixed-replace; boundary=frame'
        )
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
        
        logger.info(f"✅ Video feed response created for camera {camera_id}")
        return response
        
    except Exception as e:
        logger.error(f"❌ Error creating video feed for camera {camera_id}: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/capture_frame/<camera_id>')
def capture_frame(camera_id):
    """Capture a single frame from a camera"""
    logger.info(f"📸 Frame capture requested for camera {camera_id}")
    
    rtsp_url = get_rtsp_url(camera_id)
    if not rtsp_url:
        return jsonify({'error': 'Camera not found'}), 404
    
    camera = camera_manager.get_camera(camera_id, rtsp_url)
    if not camera:
        return jsonify({'error': 'Failed to initialize camera'}), 500
    
    lock = camera_manager.locks[camera_id]
    
    try:
        with lock:
            success, frame = camera.read()
            if not success:
                logger.error(f"❌ Failed to capture frame from camera {camera_id}")
                return jsonify({'error': 'Failed to capture frame'}), 500
            
            # Add timestamp to frame
            timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            cv2.putText(frame, f"Camera {camera_id} - {timestamp}", 
                       (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            
            ret, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
            if not ret:
                return jsonify({'error': 'Failed to encode frame'}), 500
                
            return Response(buffer.tobytes(), mimetype='image/jpeg')
            
    except Exception as e:
        logger.error(f"❌ Error capturing frame from camera {camera_id}: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/restart_camera/<camera_id>', methods=['POST'])
def restart_camera(camera_id):
    """Restart a specific camera"""
    try:
        logger.info(f"🔄 Restarting camera {camera_id}")
        
        # Release existing camera
        camera_manager.release_camera(camera_id)
        
        # Small delay
        time.sleep(1)
        
        # Get RTSP URL and reinitialize
        rtsp_url = get_rtsp_url(camera_id)
        if rtsp_url:
            camera = camera_manager.get_camera(camera_id, rtsp_url)
            if camera and camera.isOpened():
                logger.info(f"✅ Camera {camera_id} restarted successfully")
                return jsonify({
                    'status': 'success',
                    'message': f'Camera {camera_id} restarted'
                })
            else:
                return jsonify({
                    'status': 'error',
                    'message': f'Failed to restart camera {camera_id}'
                }), 500
        else:
            return jsonify({
                'status': 'error',
                'message': f'No RTSP URL found for camera {camera_id}'
            }), 404
            
    except Exception as e:
        logger.error(f"❌ Camera restart error: {e}")
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500

@app.route('/health')
def health_check():
    return {'status': 'healthy'}

@app.route('/system_status')
def system_status():
    """Get detailed system status"""
    try:
        # Test database connection
        db_connected = False
        cameras_count = 0
        database_cameras = []
        
        try:
            conn = get_db_connection()
            if conn:
                cursor = conn.cursor(cursor_factory=RealDictCursor)
                cursor.execute("SELECT camera_id, camera_name, location FROM cctv_cameras")
                database_cameras = cursor.fetchall()
                cameras_count = len(database_cameras)
                cursor.close()
                return_db_connection(conn)
                db_connected = True
        except Exception as e:
            logger.error(f"❌ Database query failed: {e}")
        
        # Check OpenCV version
        opencv_version = cv2.__version__ if 'cv2' in globals() else 'unknown'
        
        # Check for local webcams (0-2)
        local_webcams = []
        for i in range(3):
            try:
                cap = cv2.VideoCapture(i)
                if cap.isOpened():
                    local_webcams.append(i)
                cap.release()
            except:
                pass
        
        # Check active streams from camera manager
        active_streams = list(camera_manager.cameras.keys()) if 'camera_manager' in globals() else []
        
        # Check MediaPipe
        try:
            mp_version = mp.__version__ if hasattr(mp, '__version__') else 'unknown'
        except:
            mp_version = 'unknown'
            
        hands_initialized = 'hands_processor' in globals() and hands_processor is not None
        
        # Check AI Assistant
        assistant_initialized = 'assistant' in globals() and assistant is not None
        fire_model_available = False
        helmet_model_available = False
        
        if assistant_initialized:
            fire_model_available = hasattr(assistant, 'fire_model') and assistant.fire_model is not None
            helmet_model_available = hasattr(assistant, 'helmet_model') and assistant.helmet_model is not None
        
        # Get active AI inferences
        active_inferences = {}
        if 'active_models' in globals():
            for camera_id, model_info in active_models.items():
                if model_info.get('running'):
                    active_inferences[camera_id] = {
                        'status': 'running',
                        'model_id': model_info.get('model_id', 'unknown')
                    }
        
        status_data = {
            'camera_server': {
                'status': 'running',
                'opencv_version': opencv_version,
                'webcam_available': len(local_webcams) > 0,
                'available_cameras': local_webcams,  # Local webcams
                'database_cameras': [dict(cam) for cam in database_cameras],  # Database cameras
                'active_streams': active_streams,  # Currently streaming cameras
                'total_cameras': cameras_count  # Total cameras in database
            },
            'database': {
                'connected': db_connected,
                'cameras_count': cameras_count,
                'type': 'postgresql'
            },
            'mediapipe': {
                'version': mp_version,
                'hands_processor_initialized': hands_initialized
            },
            'ai_models': {
                'assistant_initialized': assistant_initialized,
                'fire_model': fire_model_available,
                'helmet_model': helmet_model_available,
                'active_inferences': active_inferences
            },
            'backend': {
                'connected': db_connected,
                'url': os.getenv('BACKEND_API_URL', 'http://localhost:3001'),
                'cameras_count': cameras_count
            },
            'timestamp': datetime.now().isoformat()
        }
        
        logger.info("✅ System status requested")
        return jsonify(status_data)
        
    except Exception as e:
        logger.error(f"❌ System status error: {e}")
        return jsonify({
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }), 500
@app.route('/generate_face_encoding', methods=['POST'])
def generate_face_encoding():
    """Generate face encoding from uploaded image"""
    if 'image' not in request.files:
        return jsonify({'error': 'No image provided'}), 400

    try:
        image_file = request.files['image']
        image = face_recognition.load_image_file(image_file)
        face_encodings = face_recognition.face_encodings(image)
        
        if not face_encodings:
            return jsonify({'error': 'No face detected'}), 400

        face_encoding = face_encodings[0]
        serialized_encoding = base64.b64encode(pickle.dumps(face_encoding)).decode('utf-8')
        
        logger.info("✅ Face encoding generated successfully")
        return jsonify({
            'face_encoding': serialized_encoding,
            'message': 'Face encoding generated successfully'
        })
        
    except Exception as e:
        logger.error(f"❌ Face encoding error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/model-control', methods=['POST'])
def handle_model_control():
    """Handle AI model start/stop requests"""
    try:
        data = request.get_json()
        camera_id = data.get('camera_id')
        model_id = data.get('model_id')
        action = data.get('action')
        
        if not all([camera_id, model_id, action]):
            return jsonify({'error': 'camera_id, model_id, and action are required'}), 400
        
        if action not in ['start', 'stop']:
            return jsonify({'error': 'action must be either "start" or "stop"'}), 400
        
        logger.info(f"🤖 Model control: {action} model {model_id} on camera {camera_id}")
        
        if action == 'start':
            if camera_id in active_models and active_models[camera_id].get('running'):
                return jsonify({'error': 'Model already running on this camera'}), 400
                
            # Test camera availability
            rtsp_url = get_rtsp_url(camera_id)
            if not rtsp_url:
                return jsonify({'error': 'Camera configuration not found'}), 404
            
            # Initialize camera if not already done
            camera = camera_manager.get_camera(camera_id, rtsp_url)
            if not camera:
                return jsonify({'error': 'Camera unreachable'}), 500

            # Start model inference
            active_models[camera_id] = {
                'running': True,
                'model_id': model_id,
                'started_at': datetime.now().isoformat()
            }
            
            # Start inference thread
            threading.Thread(
                target=run_model_inference,
                args=(camera_id, model_id),
                daemon=True,
                name=f"ModelInference-{camera_id}-{model_id}"
            ).start()
            
            logger.info(f"✅ Model {model_id} started on camera {camera_id}")

        elif action == 'stop':
            if camera_id not in active_models:
                return jsonify({'error': 'No model running on this camera'}), 400
            
            active_models[camera_id]['running'] = False
            active_models.pop(camera_id, None)
            
            logger.info(f"🛑 Model stopped on camera {camera_id}")

        return jsonify({
            'status': 'success',
            'message': f'Model {action} completed',
            'camera_id': camera_id,
            'model_id': model_id,
            'action': action
        })
    
    except Exception as e:
        logger.error(f"❌ Model control error: {str(e)}")
        return jsonify({'error': str(e)}), 500

def get_model_details(model_id: str) -> dict:
    """Get model details from PostgreSQL database"""
    conn = None
    try:
        conn = get_db_connection()
        if not conn:
            logger.error("❌ No database connection available")
            return {'error': 'Database connection failed'}
            
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Query the system_models table
        query = "SELECT * FROM system_models WHERE model_id = %s"
        cursor.execute(query, (model_id,))
        
        result = cursor.fetchone()
        cursor.close()
        
        if result:
            logger.info(f"✅ Found model details for model {model_id}: {result['name']}")
            return dict(result)
        else:
            logger.error(f"❌ No model found with ID: {model_id}")
            return {'error': 'Model not found'}
            
    except Exception as e:
        logger.error(f"❌ Error fetching model details for {model_id}: {e}")
        return {'error': str(e)}
    finally:
        if conn:
            return_db_connection(conn)

def get_all_cameras():
    """Get all cameras from PostgreSQL database"""
    conn = None
    try:
        conn = get_db_connection()
        if not conn:
            logger.error("❌ No database connection available")
            return []
            
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        query = "SELECT camera_id, camera_name, location, rtsp_url FROM cctv_cameras ORDER BY camera_id"
        cursor.execute(query)
        
        results = cursor.fetchall()
        cursor.close()
        
        logger.info(f"✅ Retrieved {len(results)} cameras from database")
        return [dict(row) for row in results]
        
    except Exception as e:
        logger.error(f"❌ Error fetching cameras: {e}")
        return []
    finally:
        if conn:
            return_db_connection(conn)

def get_employees():
    """Get all employees with face encodings from PostgreSQL database"""
    conn = None
    try:
        conn = get_db_connection()
        if not conn:
            logger.error("❌ No database connection available")
            return []
            
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        query = "SELECT * FROM employee WHERE face_encoding IS NOT NULL"
        cursor.execute(query)
        
        results = cursor.fetchall()
        cursor.close()
        
        logger.info(f"✅ Retrieved {len(results)} employee with face encodings")
        return [dict(row) for row in results]
        
    except Exception as e:
        logger.error(f"❌ Error fetching employees: {e}")
        return []
    finally:
        if conn:
            return_db_connection(conn)

def insert_helmet_violation(camera_id: str, detected: str, camera_name: str, created_at: str) -> bool:
    """Insert helmet violation into PostgreSQL database and add event"""
    conn = None
    try:
        conn = get_db_connection()
        if not conn:
            logger.error("❌ No database connection available")
            return False
            
        cursor = conn.cursor()
        
        # Create table if not exists
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS helmet_violations (
                id SERIAL PRIMARY KEY,
                camera_id VARCHAR(50),
                detected VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        query = "INSERT INTO helmet_violations (camera_id, detected, created_at, camera_name) VALUES (%s, %s, %s, %s)"
        cursor.execute(query, (camera_id, detected,  datetime.now(), camera_name))
        conn.commit()
        cursor.close()
        
        # Get camera name for better user experience
        camera_name = get_camera_name(camera_id)
        
        logger.info(f"✅ Inserted helmet violation: {camera_name} - {detected}")
        
        # Add helmet detection event with camera name
        if "Helmet detected" in detected or "wearing a helmet" in detected.lower():
            add_event('helmet_detection', {
                'camera_id': camera_id,
                'camera_name': camera_name,
                'detected': detected,
                'violation_type': 'helmet_present',
                'severity': 'low',
                'timestamp': datetime.now().isoformat(),
                'requires_action': False,
                'message': f"Safety compliance: Person wearing helmet detected at {camera_name}"
            })
        elif "No helmet detected" in detected or "without a helmet" in detected.lower():
            add_event('helmet_violation', {
                'camera_id': camera_id,
                'camera_name': camera_name,
                'detected': detected,
                'violation_type': 'no_helmet',
                'severity': 'high',
                'timestamp': datetime.now().isoformat(),
                'requires_action': True,
                'message': f"Safety violation: Person without helmet detected at {camera_name}"
            })   
        elif "No people detected" in detected:
            # Don't create events for empty scenes
            pass
        
        return True
        
    except Exception as e:
        logger.error(f"❌ Error inserting helmet violation: {e}")
        return False
    finally:
        if conn:
            return_db_connection(conn)
def get_camera_name(camera_id: str) -> str:
    """Get camera name from PostgreSQL database"""
    conn = None
    try:
        conn = get_db_connection()
        if not conn:
            logger.error("❌ No database connection available")
            return f"Camera {camera_id}"  # Fallback to camera_id
            
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Query the CCTV_CAMERAS table
        query = "SELECT camera_name FROM cctv_cameras WHERE camera_id = %s"
        cursor.execute(query, (camera_id,))
        
        result = cursor.fetchone()
        cursor.close()
        
        if result and result['camera_name']:
            camera_name = result['camera_name']
            logger.info(f"✅ Found camera name for camera {camera_id}: {camera_name}")
            return camera_name
        else:
            logger.warning(f"⚠️ No camera name found for camera {camera_id}")
            return f"Camera {camera_id}"  # Fallback to camera_id
            
    except Exception as e:
        logger.error(f"❌ Error getting camera name for camera {camera_id}: {e}")
        return f"Camera {camera_id}"  # Fallback to camera_id
    finally:
        if conn:
            return_db_connection(conn)

def insert_fire_detection(camera_id: str, detected: str, camera_name: str, created_at: str) -> bool:
    """Insert fire detection into PostgreSQL database and add event"""
    conn = None
    try:
        conn = get_db_connection()
        if not conn:
            logger.error("❌ No database connection available")
            return False
            
        cursor = conn.cursor()
        
        # Create table if not exists
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS fire_detections (
                id SERIAL PRIMARY KEY,
                camera_id VARCHAR(50),
                detected VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        query = "INSERT INTO fire_detections (camera_id, detected, created_at, camera_name) VALUES (%s, %s, %s,%s)"
        cursor.execute(query, (camera_id, detected, datetime.now(),camera_name))
        conn.commit()
        cursor.close()
        
        # Get camera name for better user experience
        
        camera_name = get_camera_name(camera_id)
        
        logger.info(f"✅ Inserted fire detection: {camera_name} - {detected}")
        
        # Add fire detection event with camera name and emergency handling
        if "No fire detected" in detected or "normal" in detected.lower():
            add_event('fire_clear', {
                'camera_id': camera_id,
                'camera_name': camera_name,
                'detected': detected,
                'alert_level': 'normal',
                'emergency': False,
                'timestamp': datetime.now().isoformat(),
                'requires_immediate_action': False,
                'message': f"All clear: No fire detected at {camera_name}"
            })
        elif "Fire detected" in detected or "fire" in detected.lower() or "smoke" in detected.lower():
            add_event('fire_detected', {
                'camera_id': camera_id,
                'camera_name': camera_name,
                'detected': detected,
                'alert_level': 'critical',
                'emergency': True,
                'timestamp': datetime.now().isoformat(),
                'requires_immediate_action': True,
                'evacuation_recommended': True,
                'message': f"EMERGENCY: Fire/smoke detected at {camera_name}! Immediate action required."
            })
        return True
        
    except Exception as e:
        logger.error(f"❌ Error inserting fire detection: {e}")
        return False
    finally:
        if conn:
            return_db_connection(conn)

            
def add_event(event_type, data):
    """Add event to recent events list"""
    with events_lock:
        event = {
            'id': len(recent_events) + 1,
            'type': event_type,
            'data': data,
            'timestamp': datetime.now().isoformat()
        }
        recent_events.append(event)
        
        # Keep only last 100 events
        if len(recent_events) > 100:
            recent_events.pop(0)
        
        #logger.info(f"📢 Event added: {event_type} - {data}")

def insert_attendance_log(employee_id: str, camera_id: str, gesture: str):
    """Insert attendance log into PostgreSQL database and add event"""
    conn = None
    try:
        conn = get_db_connection()
        if not conn:
            logger.error("❌ No database connection available")
            return False
            
        cursor = conn.cursor()
        
        # Check if attendance_logs table exists, if not create it
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS attendance_logs (
                log_id SERIAL PRIMARY KEY,
                employee_id INTEGER REFERENCES employee(employee_id),
                camera_id VARCHAR(50),
                gesture_detected VARCHAR(50),
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Insert attendance log
        query = "INSERT INTO attendance_logs (employee_id, camera_id, gesture_detected, timestamp) VALUES (%s, %s, %s, %s)"
        cursor.execute(query, (employee_id, camera_id, gesture, datetime.now()))
        conn.commit()
        
        logger.info(f"✅ Attendance log inserted: Employee {employee_id}, Camera {camera_id}, Gesture {gesture}")
        
        # Get employee name for event
        cursor.execute("SELECT name FROM employee WHERE employee_id = %s", (employee_id,))
        employee_result = cursor.fetchone()
        employee_name = employee_result[0] if employee_result else f"Employee {employee_id}"
        
        cursor.close()
        
        action = "Check In" if gesture == "thumb_up" else "Check Out"
        
        # Add attendance event
        add_event('attendance_logged', {
            'employee_name': employee_name,
            'action': action,
            'camera_id': camera_id,
            'gesture': gesture
        })
        
        logger.info(f"✅ Attendance event added: {employee_name} - {action}")
        return True
        
    except Exception as e:
        logger.error(f"❌ Error inserting attendance log: {e}")
        return False
    finally:
        if conn:
            return_db_connection(conn)


def detect_gesture(hand_landmarks):
    """Detect thumb up/down gesture from hand landmarks"""
    try:
        # Get landmark positions
        landmarks = hand_landmarks.landmark
        
        # Thumb tip and thumb IP (interphalangeal joint)
        thumb_tip = landmarks[mp_hands.HandLandmark.THUMB_TIP]
        thumb_ip = landmarks[mp_hands.HandLandmark.THUMB_IP]
        
        # Wrist position
        wrist = landmarks[mp_hands.HandLandmark.WRIST]
        
        # Index finger MCP (metacarpophalangeal joint) for reference
        index_mcp = landmarks[mp_hands.HandLandmark.INDEX_FINGER_MCP]
        
        # Check if thumb is extended (thumb tip higher than thumb IP)
        thumb_extended = thumb_tip.y < thumb_ip.y
        
        # Check if thumb is above the hand (above index MCP)
        thumb_above_hand = thumb_tip.y < index_mcp.y
        
        # Check if other fingers are folded (simplified check)
        # Index finger tip vs MCP
        index_tip = landmarks[mp_hands.HandLandmark.INDEX_FINGER_TIP]
        index_folded = index_tip.y > index_mcp.y
        
        # Middle finger tip vs MCP
        middle_tip = landmarks[mp_hands.HandLandmark.MIDDLE_FINGER_TIP]
        middle_mcp = landmarks[mp_hands.HandLandmark.MIDDLE_FINGER_MCP]
        middle_folded = middle_tip.y > middle_mcp.y
        
        # Thumb up: thumb extended and above hand, other fingers folded
        if thumb_extended and thumb_above_hand and index_folded and middle_folded:
            return "thumb_up"
        
        # Thumb down: thumb extended and below wrist
        elif thumb_extended and thumb_tip.y > wrist.y:
            return "thumb_down"
        
        return None
        
    except Exception as e:
        logger.error(f"❌ Error in gesture detection: {e}")
        return None
    
def run_model_inference(camera_id, model_id):
    """Run AI model inference on camera feed"""
    logger.info(f"🧠 Starting inference: model {model_id} on camera {camera_id}")
    
    rtsp_url = get_rtsp_url(camera_id)
    if not rtsp_url:
        logger.error(f"❌ No RTSP URL for camera {camera_id}")
        return
    
    # Create dedicated camera capture for inference
    cap = cv2.VideoCapture(rtsp_url)
    if not cap.isOpened():
        logger.error(f"❌ Failed to open camera {camera_id} for inference")
        return
    
    model_details = get_model_details(model_id)
    if not model_details or 'error' in model_details:
        logger.error(f"❌ Failed to get model details for {model_id}")
        cap.release()
        return
    
    frame_count = 0
    process_every_n_frames = 30  # Process every 30th frame to reduce load
    
    try:
        while active_models.get(camera_id, {}).get('running', False):
            ret, frame = cap.read()
            if not ret:
                logger.warning(f"⚠️ Failed to read frame for inference on camera {camera_id}")
                time.sleep(0.1)
                continue
            
            frame_count += 1
            
            # Skip frames to reduce processing load
            if frame_count % process_every_n_frames != 0:
                continue
            
            try:
                # Process based on model type
                if model_details['type'] == 'helmet':
                    process_helmet_model(frame, camera_id)
                elif model_details['type'] == 'fire':
                    process_fire_model(frame, camera_id)
                elif model_details['type'] == 'attendance':
                    process_attendance(frame, camera_id)
                elif model_details['type'] == 'activity':
                    process_activity_model(frame, camera_id)
                else:
                    logger.warning(f"⚠️ Unknown model type: {model_details['type']}")
                
            except Exception as e:
                logger.error(f"❌ Error in model processing for camera {camera_id}: {e}")
                time.sleep(1)  # Brief pause on error
    
    except Exception as e:
        logger.error(f"❌ Error in model inference loop for camera {camera_id}: {e}")
    finally:
        cap.release()
        logger.info(f"🛑 Inference stopped for camera {camera_id}")

     
def process_activity_model(frame, camera_id):
    #Analyze frame for suspicious activity or unusual behavior
    try:
        if not hasattr(process_activity_model, "last_detection_time"):
            process_activity_model.last_detection_time = {}

        current_time = time.time()
        last_time = process_activity_model.last_detection_time.get(camera_id, 0)
        if current_time - last_time < 5:
            return

        process_activity_model.last_detection_time[camera_id] = current_time

        _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
        encoded_frame = base64.b64encode(buffer).decode()

        response = assistant.answer(
            encoded_frame,
            "Check this CCTV image for suspicious or dangerous human activities like fighting, falling down, loitering, or aggressive behavior. Respond in simple summary.",
            "activity"
        )

        if response:
            logger.info(f"⚠️ Activity Detection (Camera {camera_id}): {response}")
            add_event("activity_detected", {
                "camera_id": camera_id,
                "activity": response,
                "timestamp": datetime.now().isoformat()
            })

    except Exception as e:
        logger.error(f"❌ Activity model error: {e}")




def process_helmet_model(frame, camera_id):
    """Process frame for helmet detection with events"""
    try:
        if not hasattr(process_helmet_model, "last_detection_time"):
            process_helmet_model.last_detection_time = {}
            
        current_time = time.time()
        last_time = process_helmet_model.last_detection_time.get(camera_id, 0)
        
        # Process only every 5 seconds to avoid spam
        if current_time - last_time < 5:
            return
            
        process_helmet_model.last_detection_time[camera_id] = current_time
        
        _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
        encoded_frame = base64.b64encode(buffer).decode()
        
        response = assistant.answer(
            encoded_frame,
            "Analyze this image for safety helmet compliance. Look for people and determine if they are wearing safety helmets. Respond with either 'Helmet detected' if you see a person wearing a helmet, or 'No helmet detected' if you see a person without a helmet. If no people are visible, respond with 'No people detected'.",
            "helmet"
        )
        
        if response and response != "Model not initialized":
            detected = response.strip()
            camera_name = get_camera_name(camera_id)
            logger.info(f"🪖 {camera_name}: {detected}")
            
            # Insert detection result into PostgreSQL
            insert_helmet_violation(camera_id, detected,camera_name)
            
    except Exception as e:
        camera_name = get_camera_name(camera_name)
        logger.error(f"❌ Helmet detection error for {camera_name}: {e}")

def process_fire_model(frame, camera_id):
    """Process frame for fire detection with events"""
    try:
        if not hasattr(process_fire_model, "last_detection_time"):
            process_fire_model.last_detection_time = {}
            
        current_time = time.time()
        last_time = process_fire_model.last_detection_time.get(camera_id, 0)
        
        # Process only every 3 seconds for fire detection (more frequent due to emergency nature)
        if current_time - last_time < 3:
            return
            
        process_fire_model.last_detection_time[camera_id] = current_time
        
        _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
        encoded_frame = base64.b64encode(buffer).decode()
        
        response = assistant.answer(
            encoded_frame,
            "Analyze this image for fire or smoke. Look for flames, smoke, or signs of fire. Respond with either 'Fire detected' if you see fire, flames, or significant smoke, or 'No fire detected' if the scene appears normal.",
            "fire"
        )
        
        if response and response != "Model not initialized":
            detected = response.strip()
            camera_name = get_camera_name(camera_id)
            logger.info(f"🔥 {camera_name}: {detected}")
            
            # Insert detection result into PostgreSQL
            insert_fire_detection(camera_id, detected)
            
    except Exception as e:
        camera_name = get_camera_name(camera_id)
        logger.error(f"❌ Fire detection error for {camera_name}: {e}")


def process_attendance(frame, camera_id):
    """Process frame for attendance tracking with events"""
    try:
        if not hasattr(process_attendance, "last_processed_time"):
            process_attendance.last_processed_time = {}
        
        if not hasattr(process_attendance, "employee_cache"):
            process_attendance.employee_cache = {}
        
        if not hasattr(process_attendance, "last_face_match"):
            process_attendance.last_face_match = {}
        
        if not hasattr(process_attendance, "last_gesture_time"):
            process_attendance.last_gesture_time = {}

        # Process frame only once every 2 seconds per camera
        current_time = time.time()
        last_time = process_attendance.last_processed_time.get(camera_id, 0)
        if current_time - last_time < 2:
            return
        process_attendance.last_processed_time[camera_id] = current_time

        # Preload employee face encodings (cache per camera)
        if camera_id not in process_attendance.employee_cache:
            try:
                employees = get_employees()
                process_attendance.employee_cache[camera_id] = []
                
                for emp in employees:
                    if emp.get('face_encoding'):
                        try:
                            face_encoding = pickle.loads(safe_base64_decode(emp['face_encoding']))
                            emp_data = {**emp, "face_encoding": face_encoding}
                            process_attendance.employee_cache[camera_id].append(emp_data)
                        except Exception as e:
                            logger.error(f"❌ Error processing face encoding for employee {emp.get('employee_id')}: {e}")
                            continue
                
                logger.info(f"👥 Preloaded {len(process_attendance.employee_cache[camera_id])} employee encodings for camera {camera_id}")
            except Exception as e:
                logger.error(f"❌ Error loading employee encodings for camera {camera_id}: {e}")
                process_attendance.employee_cache[camera_id] = []
                return

        if not process_attendance.employee_cache[camera_id]:
            logger.warning(f"⚠️ No employee encodings available for camera {camera_id}")
            return

        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        frame_height, frame_width, _ = rgb_frame.shape

        # Detect faces with lower resolution for speed
        small_frame = cv2.resize(rgb_frame, (0, 0), fx=0.5, fy=0.5)
        face_locations = face_recognition.face_locations(small_frame, model="hog")
        
        if not face_locations:
            return

        # Scale back up face locations
        face_locations = [(top*2, right*2, bottom*2, left*2) for (top, right, bottom, left) in face_locations]
        face_encodings = face_recognition.face_encodings(rgb_frame, face_locations)

        # For each face found
        for face_encoding, face_location in zip(face_encodings, face_locations):
            try:
                # Compare with known employees
                employee_encodings = [e["face_encoding"] for e in process_attendance.employee_cache[camera_id]]
                similarities = face_recognition.face_distance(employee_encodings, face_encoding)
                best_match_idx = np.argmin(similarities)

                if similarities[best_match_idx] < 0.55:  # Face match threshold
                    employee = process_attendance.employee_cache[camera_id][best_match_idx]
                    employee_id = employee['employee_id']
                    
                    # Check if we already detected this employee recently (avoid spam)
                    last_match_key = f"{camera_id}_{employee_id}"
                    last_match_time = process_attendance.last_face_match.get(last_match_key, 0)
                    
                    if current_time - last_match_time > 5:  # Only trigger once every 5 seconds per employee per camera
                        logger.info(f"👤 Face matched: {employee['name']} on camera {camera_id}")
                        
                        # Add face match event
                        add_event('face_matched', {
                            'employee_name': employee['name'],
                            'employee_id': employee_id,
                            'department': employee.get('department', 'Unknown'),
                            'designation': employee.get('designation', 'Unknown'),
                            'camera_id': camera_id
                        })
                        
                        process_attendance.last_face_match[last_match_key] = current_time

                    # Gesture Detection - Process the entire frame for hands
                    hands_processor = mp_hands.Hands(
                        static_image_mode=False,
                        max_num_hands=2,
                        min_detection_confidence=0.7,
                        min_tracking_confidence=0.5,
                        model_complexity=1,
                    )
                    
                    results = hands_processor.process(rgb_frame)
                    gesture = None
                    
                    if results.multi_hand_landmarks:
                        logger.info(f"🖐️ Hand landmarks detected for {employee['name']}")
                        for hand_landmarks in results.multi_hand_landmarks:
                            gesture = detect_gesture(hand_landmarks)
                            if gesture:
                                logger.info(f"✋ Gesture detected: {gesture} for {employee['name']}")
                                break  # Only process first valid gesture

                    hands_processor.close()

                    # Process gesture if detected
                    if gesture:
                        # Check if we already processed this gesture recently (avoid duplicate entries)
                        gesture_key = f"{camera_id}_{employee_id}_{gesture}"
                        last_gesture_time = process_attendance.last_gesture_time.get(gesture_key, 0)
                        
                        if current_time - last_gesture_time > 10:  # Only allow same gesture every 10 seconds
                            logger.info(f"📝 Processing attendance: {employee['name']} - {gesture}")
                            
                            # Insert attendance log (this will add its own event)
                            success = insert_attendance_log(employee['employee_id'], camera_id, gesture)
                            
                            if success:
                                process_attendance.last_gesture_time[gesture_key] = current_time
                                logger.info(f"✅ Attendance logged successfully for {employee['name']}")
                            else:
                                logger.error(f"❌ Failed to log attendance for {employee['name']}")
                        else:
                            logger.info(f"⏰ Gesture {gesture} for {employee['name']} ignored (too recent)")
                            

            except Exception as e:
                logger.error(f"❌ Error processing face: {e}")
    except Exception as e:
        logger.error(f"❌ Attendance processing error for camera {camera_id}: {e}")
                        
# Add API endpoints for events
@app.route('/api/events')
def get_events():
    """Get recent events"""
    with events_lock:
        return jsonify({
            'status': 'success',
            'events': recent_events[-20:],  # Return last 20 events
            'count': len(recent_events)
        })

@app.route('/api/events/since/<int:event_id>')
def get_events_since(event_id):
    """Get events since a specific event ID"""
    with events_lock:
        new_events = [event for event in recent_events if event['id'] > event_id]
        return jsonify({
            'status': 'success',
            'events': new_events,
            'count': len(new_events)
        })
    
@app.route('/api/test_events')
def test_events():
    """Test events endpoint"""
    add_event('face_matched', {
        'employee_name': 'Test User',
        'employee_id': 'test-001',
        'department': 'Testing',
        'designation': 'Test Engineer',
        'camera_id': '1'
    })
    
    add_event('attendance_logged', {
        'employee_name': 'Test User',
        'action': 'Check In',
        'camera_id': '1',
        'gesture': 'thumb_up'
    })
    
    return jsonify({'status': 'success', 'message': 'Test events added'}) 


@app.route('/test_model/<model_type>', methods=['POST'])
def test_model(model_type):
    """Test AI model functionality"""
    try:
        if not assistant:
            return jsonify({
                'status': 'error',
                'error': 'AI Assistant not initialized'
            }), 500
        
        # Create a test image (black square)
        test_image = np.zeros((480, 640, 3), dtype=np.uint8)
        cv2.putText(test_image, f'Test {model_type.upper()} Model', (50, 240), 
                   cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
        
        _, buffer = cv2.imencode('.jpg', test_image)
        encoded_image = base64.b64encode(buffer).decode()
        
        if model_type == 'fire':
            prompt = "Detect if there is a fire. Respond with 'Fire detected' or 'No fire detected'."
            response = assistant.answer(encoded_image, prompt, "fire")
        elif model_type == 'helmet':
            prompt = "Detect if a person is wearing a helmet. Respond with 'Helmet detected' or 'No helmet detected'."
            response = assistant.answer(encoded_image, prompt, "helmet")
        else:
            return jsonify({
                'status': 'error',
                'error': f'Unknown model type: {model_type}'
            }), 400
        
        logger.info(f"✅ Model test completed: {model_type}")
        return jsonify({
            'status': 'success',
            'model_type': model_type,
            'response': response or f'{model_type} model test completed'
        })
        
    except Exception as e:
        logger.error(f"❌ Model test error: {e}")
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500

@app.route('/cameras/<camera_id>/test', methods=['GET'])
def test_camera_connection(camera_id):
    """Test camera connection"""
    try:
        rtsp_url = get_rtsp_url(camera_id)
        if not rtsp_url:
            return jsonify({
                'status': 'error',
                'message': 'Camera configuration not found'
            }), 404
        
        # Test camera connection
        cap = cv2.VideoCapture(rtsp_url)
        if cap.isOpened():
            ret, frame = cap.read()
            cap.release()
            
            if ret:
                logger.info(f"✅ Camera {camera_id} connection test passed")
                return jsonify({
                    'status': 'success',
                    'message': f'Camera {camera_id} is accessible',
                    'rtsp_url': rtsp_url
                })
            else:
                return jsonify({
                    'status': 'error',
                    'message': 'Camera connected but no frame received'
                }), 500
        else:
            return jsonify({
                'status': 'error',
                'message': 'Failed to connect to camera'
            }), 500
            
    except Exception as e:
        logger.error(f"❌ Camera test error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/cameras', methods=['GET'])
def get_cameras_endpoint():
    """Get all cameras from database"""
    try:
        cameras = get_all_cameras()
        logger.info(f"✅ Retrieved {len(cameras)} cameras")
        return jsonify({
            'status': 'success',
            'cameras': cameras,
            'count': len(cameras)
        })
    except Exception as e:
        logger.error(f"❌ Error fetching cameras: {e}")
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500

@app.route('/cameras/<camera_id>/status', methods=['GET'])
def get_camera_status_endpoint(camera_id):
    """Get status of a specific camera"""
    try:
        rtsp_url = get_rtsp_url(camera_id)
        is_active = camera_manager.is_camera_active(camera_id)
        has_active_model = camera_id in active_models and active_models[camera_id].get('running', False)
        
        return jsonify({
            'camera_id': camera_id,
            'rtsp_url': rtsp_url,
            'is_active': is_active,
            'has_active_model': has_active_model,
            'model_info': active_models.get(camera_id, {}) if has_active_model else None
        })
    except Exception as e:
        logger.error(f"❌ Error getting camera status: {e}")
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500

@app.route('/debug/active_models', methods=['GET'])
def debug_active_models():
    """Debug endpoint to check active models"""
    return jsonify({
        'active_models': active_models,
        'camera_manager_cameras': list(camera_manager.cameras.keys()),
        'camera_status': camera_manager.camera_status
    })

@app.route('/debug/database', methods=['GET'])
def debug_database():
    """Debug endpoint to check database connection"""
    try:
        conn = get_db_connection()
        if not conn:
            return jsonify({'status': 'error', 'message': 'No database connection'}), 500
        
        cursor = conn.cursor()
        
        # Test queries
        cursor.execute("SELECT COUNT(*) FROM cctv_cameras")
        cameras_count = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM system_models")
        models_count = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM employees")
        employees_count = cursor.fetchone()[0]
        
        cursor.close()
        return_db_connection(conn)
        
        return jsonify({
            'status': 'success',
            'database_connected': True,
            'cameras_count': cameras_count,
            'models_count': models_count,
            'employees_count': employees_count
        })
        
    except Exception as e:
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500

@app.route('/debug/routes')
def list_routes():
    """List all available routes for debugging"""
    routes = []
    for rule in app.url_map.iter_rules():
        routes.append({
            'endpoint': rule.rule,
            'methods': list(rule.methods - {'HEAD', 'OPTIONS'})
        })
    return jsonify({
        'available_routes': routes,
        'total_routes': len(routes)
    })

@app.route('/debug/camera/<camera_id>')
def debug_camera(camera_id):
    """Debug camera connection"""
    try:
        rtsp_url = get_rtsp_url(camera_id)
        if not rtsp_url:
            return jsonify({'error': 'Camera not found in database', 'camera_id': camera_id}), 404
        
        logger.info(f"🔍 Testing camera {camera_id} with URL: {rtsp_url}")
        
        # Test connection with different backends
        backends = [
            ('FFMPEG', cv2.CAP_FFMPEG),
            ('GSTREAMER', cv2.CAP_GSTREAMER),
            ('ANY', cv2.CAP_ANY)
        ]
        
        results = []
        
        for backend_name, backend_code in backends:
            try:
                cap = cv2.VideoCapture(rtsp_url, backend_code)
                
                if cap.isOpened():
                    ret, frame = cap.read()
                    cap.release()
                    
                    if ret and frame is not None:
                        results.append({
                            'backend': backend_name,
                            'status': 'success',
                            'frame_shape': frame.shape
                        })
                    else:
                        results.append({
                            'backend': backend_name,
                            'status': 'opened_but_no_frame'
                        })
                else:
                    results.append({
                        'backend': backend_name,
                        'status': 'failed_to_open'
                    })
                    cap.release()
                    
            except Exception as e:
                results.append({
                    'backend': backend_name,
                    'status': 'exception',
                    'error': str(e)
                })
        
        return jsonify({
            'camera_id': camera_id,
            'rtsp_url': rtsp_url,
            'backend_tests': results
        })
        
    except Exception as e:
        logger.error(f"❌ Camera debug error: {e}")
        return jsonify({
            'camera_id': camera_id,
            'error': str(e)
        }), 500

@app.route('/test_rtsp/<camera_id>')
def test_rtsp(camera_id):
    """Test RTSP connection and return a single frame"""
    try:
        rtsp_url = get_rtsp_url(camera_id)
        if not rtsp_url:
            return jsonify({'error': 'Camera not found'}), 404
        
        logger.info(f"🧪 Testing RTSP for camera {camera_id}: {rtsp_url}")
        
        # Try to capture a single frame
        cap = cv2.VideoCapture(rtsp_url)
        
        if not cap.isOpened():
            return jsonify({
                'camera_id': camera_id,
                'status': 'failed',
                'error': 'Could not open RTSP stream'
            }), 500
        
        # Wait a bit for the stream to stabilize
        import time
        time.sleep(2)
        
        # Try to read multiple frames (sometimes first few frames are empty)
        for i in range(10):
            ret, frame = cap.read()
            if ret and frame is not None:
                cap.release()
                
                # Encode frame as JPEG and return
                ret, buffer = cv2.imencode('.jpg', frame)
                if ret:
                    return Response(buffer.tobytes(), mimetype='image/jpeg')
                else:
                    return jsonify({'error': 'Failed to encode frame'}), 500
        
        cap.release()
        return jsonify({
            'camera_id': camera_id,
            'status': 'failed',
            'error': 'Could not read valid frame after 10 attempts'
        }), 500
        
    except Exception as e:
        logger.error(f"❌ RTSP test error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/test_camera_access/<camera_id>')
def test_camera_access(camera_id):
    """Test if we can access the camera"""
    try:
        rtsp_url = get_rtsp_url(camera_id)
        if not rtsp_url:
            return jsonify({'error': 'Camera not found in database'}), 404
        
        logger.info(f"🧪 Testing camera {camera_id} with source: {rtsp_url}")
        
        # Try to open the camera
        if isinstance(rtsp_url, int):
            cap = cv2.VideoCapture(rtsp_url)
        else:
            cap = cv2.VideoCapture(rtsp_url)
        
        if not cap.isOpened():
            cap.release()
            return jsonify({
                'camera_id': camera_id,
                'source': rtsp_url,
                'status': 'failed_to_open',
                'error': 'Could not open camera'
            }), 500
        
        # Try to read a frame
        ret, frame = cap.read()
        cap.release()
        
        if not ret or frame is None:
            return jsonify({
                'camera_id': camera_id,
                'source': rtsp_url,
                'status': 'opened_but_no_frame',
                'error': 'Camera opened but could not read frame'
            }), 500
        
        return jsonify({
            'camera_id': camera_id,
            'source': rtsp_url,
            'status': 'success',
            'frame_shape': frame.shape,
            'message': 'Camera is working'
        })
        
    except Exception as e:
        logger.error(f"❌ Camera test error: {e}")
        return jsonify({
            'camera_id': camera_id,
            'error': str(e),
            'status': 'exception'
        }), 500

@app.route('/list_available_cameras')
def list_available_cameras():
    """List all available cameras on the system"""
    available_cameras = []
    
    # Test webcam indices 0-3
    for i in range(4):
        try:
            cap = cv2.VideoCapture(i)
            if cap.isOpened():
                ret, frame = cap.read()
                if ret and frame is not None:
                    available_cameras.append({
                        'index': i,
                        'status': 'working',
                        'frame_shape': frame.shape
                    })
                else:
                    available_cameras.append({
                        'index': i,
                        'status': 'opened_but_no_frame'
                    })
                cap.release()
            else:
                available_cameras.append({
                    'index': i,
                    'status': 'not_available'
                })
        except Exception as e:
            available_cameras.append({
                'index': i,
                'status': 'error',
                'error': str(e)
            })
    
    return jsonify({
        'available_cameras': available_cameras,
        'opencv_version': cv2.__version__
    })

@app.route('/video_feed_simple')
def video_feed_simple():
    """Simple video feed that should work"""
    def generate_simple_frames():
        cap = cv2.VideoCapture(0)  # Use first webcam
        
        if not cap.isOpened():
            # If no webcam, generate a test pattern
            import numpy as np
            import time
            
            while True:
                # Create a simple animated test pattern
                frame = np.zeros((480, 640, 3), dtype=np.uint8)
                
                # Add some animation based on time
                t = int(time.time() * 2) % 255
                frame[:, :] = [t, 255-t, 128]  # Animated colors
                
                # Add text
                cv2.putText(frame, f'Test Feed {t}', (50, 50), 
                           cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
                
                ret, buffer = cv2.imencode('.jpg', frame)
                if ret:
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')
                
                time.sleep(0.1)  # 10 FPS
        else:
            while True:
                ret, frame = cap.read()
                if not ret:
                    break
                
                # Add timestamp to frame
                import time
                timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
                cv2.putText(frame, timestamp, (10, 30), 
                           cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
                
                ret, buffer = cv2.imencode('.jpg', frame)
                if not ret:
                    break
                
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')
            
            cap.release()
    
    return Response(generate_simple_frames(), 
                   mimetype='multipart/x-mixed-replace; boundary=frame')

# Error handlers
@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Endpoint not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({'error': 'Internal server error'}), 500

# Cleanup handler
@app.route('/shutdown', methods=['POST'])
def shutdown():
    """Graceful shutdown"""
    try:
        logger.info("🛑 Shutting down camera server...")
        
        # Stop all active models
        for camera_id in list(active_models.keys()):
            active_models[camera_id]['running'] = False
        active_models.clear()
        
        # Release all cameras
        for camera_id in list(camera_manager.cameras.keys()):
            camera_manager.release_camera(camera_id)
        
        # Close MediaPipe resources
        if hands_processor:
            hands_processor.close()
        
        logger.info("✅ Cleanup completed")
        return jsonify({'status': 'shutting down'})
        
    except Exception as e:
        logger.error(f"❌ Shutdown error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/test_new_endpoint')
def test_new_endpoint():
    """Test if new endpoints are being registered"""
    logger.info("✅ Test endpoint called successfully")
    return jsonify({
        'message': 'New endpoint is working!',
        'timestamp': datetime.now().isoformat()
    })

if __name__ == '__main__':
    logger.info("🚀 Starting Safety Surveillance Camera Server")
    logger.info(f"📡 Backend API URL: {BACKEND_API_URL}")
    logger.info(f"🎥 OpenCV Version: {cv2.__version__}")
    logger.info(f"🤖 MediaPipe Version: {mp.__version__}")
    
    # Test webcam availability
    test_cap = cv2.VideoCapture(0)
    if test_cap.isOpened():
        logger.info("📹 Webcam available for testing")
        test_cap.release()
    else:
        logger.warning("⚠️ No webcam detected")
    
    app.run(host='0.0.0.0', port=8000, debug=False, threaded=True)