from django.urls import path
from . import views

urlpatterns = [
    path('api/register', views.register, name='register'),
    path('api/login', views.login, name='login'),
    path('api/logout', views.logout, name='logout'),
    path('api/me', views.me, name='me'),
    path('api/online', views.online_users, name='online_users'),
    path('api/chats', views.chats, name='chats'),
    path('api/chats/<int:chat_id>', views.chat_detail, name='chat_detail'),
    path('api/chats/<int:chat_id>/messages', views.chat_messages, name='chat_messages'),
    path('api/group', views.create_group, name='create_group'),
    path('api/send', views.send_message, name='send_message'),
    path('api/users/search', views.search_users, name='search_users'),
    path('api/users', views.list_users, name='list_users'),
    path('api/users/me/profile', views.update_profile, name='update_profile'),
    path('api/poll/messages', views.poll_messages, name='poll_messages'),
    path('api/messages/<int:message_id>', views.get_message, name='get_message'),
    path('api/messages/<int:message_id>/delete', views.delete_message, name='delete_message'),
    path('api/messages/<int:message_id>/edit', views.edit_message, name='edit_message'),
    path('api/upload', views.upload_file, name='upload_file'),
    path('api/upload/photo', views.upload_photo, name='upload_photo'),
]
