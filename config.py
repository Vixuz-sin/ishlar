import os

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY', 'telegram-clone-secret-key-2026')
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL', 'sqlite:///chat.db')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    MAX_CONTENT_LENGTH = 50 * 1024 * 1024
    UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')

if Config.SQLALCHEMY_DATABASE_URI and Config.SQLALCHEMY_DATABASE_URI.startswith('postgres://'):
    Config.SQLALCHEMY_DATABASE_URI = Config.SQLALCHEMY_DATABASE_URI.replace('postgres://', 'postgresql://', 1)
