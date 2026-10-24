from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.http import FileResponse
from django.shortcuts import render
from django.views.decorators.csrf import ensure_csrf_cookie

@ensure_csrf_cookie
def index(request):
    return render(request, 'index.html')

def serve_root_file(request, name):
    file = settings.BASE_DIR / 'static' / name
    if not file.exists():
        from django.http import Http404
        raise Http404
    return FileResponse(file.open('rb'))

urlpatterns = [
    path('admin/', admin.site.urls),
    path('sw.js', serve_root_file, {'name': 'sw.js'}),
    path('manifest.json', serve_root_file, {'name': 'manifest.json'}),
    path('', index, name='index'),
    path('', include('chat.urls')),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
