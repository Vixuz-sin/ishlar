import os
from django.core.asgi import get_asgi_application
from telegram_django.asgi import application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'telegram_django.settings')

app = application
