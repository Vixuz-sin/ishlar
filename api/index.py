import sys
import os
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env'))

from flask import Flask, render_template, jsonify, request, session, send_from_directory
from config import Config
from models import db
from routes.auth import auth
from routes.messages import messages_bp
from routes.uploads import uploads_bp

app = Flask(__name__)
app.config.from_object(Config)
app.config['SERVER_NAME'] = None
app.config['SESSION_COOKIE_SAMESITE'] = 'None'
app.config['SESSION_COOKIE_SECURE'] = True

db.init_app(app)

app.register_blueprint(auth)
app.register_blueprint(messages_bp)
app.register_blueprint(uploads_bp)

with app.app_context():
    db.create_all()

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
    messages = Message.query.filter(
        Message.chat_id == chat_id,
        Message.id > after
    ).order_by(Message.created_at.asc()).all()
    return jsonify({'messages': [m.to_dict() for m in messages]})

@app.route('/api/uploads/<subfolder>/<filename>')
def serve_upload(subfolder, filename):
    folder = os.path.join(Config.UPLOAD_FOLDER, subfolder)
    return send_from_directory(folder, filename)

if __name__ == '__main__':
    app.run(debug=True)
