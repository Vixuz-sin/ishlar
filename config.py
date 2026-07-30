import os

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY', 'telegram-clone-secret-key-2026')
    MAX_CONTENT_LENGTH = 50 * 1024 * 1024
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
    SERVER_NAME = None
    SESSION_COOKIE_SAMESITE = 'None'
    SESSION_COOKIE_SECURE = True

    db_url = os.environ.get('DATABASE_URL', '')
    if db_url:
        if db_url.startswith('postgres://'):
            db_url = db_url.replace('postgres://', 'postgresql://', 1)
        SQLALCHEMY_DATABASE_URI = db_url
    else:
        is_vercel = os.environ.get('VERCEL', '') or os.environ.get('VERCEL_ENV', '')
        if is_vercel:
            SQLALCHEMY_DATABASE_URI = 'sqlite:////tmp/chat.db'
        else:
            db_path = os.path.join(
                os.path.dirname(os.path.abspath(__file__)),
                'instance', 'chat.db'
            )
            SQLALCHEMY_DATABASE_URI = f'sqlite:///{db_path}'
