from django.contrib import admin
from .models import User, Chat, Message

@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ['id', 'username', 'phone', 'is_active', 'last_online']
    search_fields = ['username', 'phone']

@admin.register(Chat)
class ChatAdmin(admin.ModelAdmin):
    list_display = ['id', 'name', 'type', 'created_at']
    filter_horizontal = ['members']

@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ['id', 'chat', 'sender', 'text', 'created_at']
    search_fields = ['text']
