from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timezone
import hashlib

db = SQLAlchemy()

chat_members = db.Table('chat_members',
    db.Column('user_id', db.Integer, db.ForeignKey('user.id'), primary_key=True),
    db.Column('chat_id', db.Integer, db.ForeignKey('chat.id'), primary_key=True)
)

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(32), unique=True, nullable=False)
    phone = db.Column(db.String(20), unique=True, nullable=True)
    password_hash = db.Column(db.String(128), nullable=False)
    avatar = db.Column(db.String(256), nullable=True)
    bio = db.Column(db.String(128), nullable=True)
    last_online = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def set_password(self, password):
        self.password_hash = hashlib.sha256(password.encode()).hexdigest()

    def check_password(self, password):
        return self.password_hash == hashlib.sha256(password.encode()).hexdigest()

    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'phone': self.phone,
            'avatar': f'/uploads/avatars/{self.avatar}' if self.avatar else None,
            'bio': self.bio,
            'last_online': self.last_online.isoformat() if self.last_online else None
        }

class Chat(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    type = db.Column(db.String(10), nullable=False, default='private')
    name = db.Column(db.String(64), nullable=True)
    photo = db.Column(db.String(256), nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    members = db.relationship('User', secondary=chat_members, lazy='subquery',
                               backref=db.backref('chats', lazy=True))
    last_message_id = db.Column(db.Integer, nullable=True)

    def to_dict(self):
        return {
            'id': self.id,
            'type': self.type,
            'name': self.name,
            'photo': f'/uploads/chat_photos/{self.photo}' if self.photo else None,
            'members': [m.to_dict() for m in self.members],
            'last_message_id': self.last_message_id,
            'created_at': self.created_at.isoformat()
        }

class Message(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    chat_id = db.Column(db.Integer, db.ForeignKey('chat.id'), nullable=False)
    sender_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    text = db.Column(db.Text, nullable=True)
    file_path = db.Column(db.String(256), nullable=True)
    file_type = db.Column(db.String(10), nullable=True)
    file_size = db.Column(db.Integer, nullable=True)
    reply_to = db.Column(db.Integer, nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    sender = db.relationship('User', backref='messages', lazy=True)
    chat = db.relationship('Chat', backref='messages', lazy=True)

    def to_dict(self):
        return {
            'id': self.id,
            'chat_id': self.chat_id,
            'sender': self.sender.to_dict() if self.sender else None,
            'text': self.text,
            'file_path': f'/uploads/{self.file_type}s/{self.file_path}' if self.file_path else None,
            'file_type': self.file_type,
            'file_size': self.file_size,
            'reply_to': self.reply_to,
            'created_at': self.created_at.isoformat()
        }
