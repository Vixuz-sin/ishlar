import os
import sys

base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, base_dir)
os.chdir(base_dir)

from flask import Flask, render_template, jsonify, request, session, send_from_directory

app = Flask(__name__,
    template_folder=os.path.join(base_dir, 'templates'),
    static_folder=os.path.join(base_dir, 'static'))

app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'telegram-clone-key')
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL', 'sqlite:////tmp/chat.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['UPLOAD_FOLDER'] = '/tmp/uploads'
app.config['SERVER_NAME'] = None
app.config['SESSION_COOKIE_SAMESITE'] = 'None'
app.config['SESSION_COOKIE_SECURE'] = True

os.makedirs('/tmp/uploads/photos', exist_ok=True)
os.makedirs('/tmp/uploads/videos', exist_ok=True)
os.makedirs('/tmp/uploads/audios', exist_ok=True)

from models import db
db.init_app(app)

from routes.auth import auth as auth_bp
from routes.messages import messages_bp
from routes.uploads import uploads_bp
app.register_blueprint(auth_bp)
app.register_blueprint(messages_bp)
app.register_blueprint(uploads_bp)

with app.app_context():
    import models
    try:
        db.create_all()
    except Exception:
        pass

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/poll/messages')
def poll_messages():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': 'Not authenticated'}), 401
    chat_id = request.args.get('chat_id', type=int)
    after = request.args.get('after', -1, type=int)
    if not chat_id:
        return jsonify({'messages': []})
    from models import Message
    msgs = Message.query.filter(
        Message.chat_id == chat_id,
        Message.id > after
    ).order_by(Message.created_at.asc()).all()
    return jsonify({'messages': [m.to_dict() for m in msgs]})

@app.route('/uploads/<subfolder>/<filename>')
def serve_upload(subfolder, filename):
    return send_from_directory(os.path.join('/tmp/uploads', subfolder), filename)
