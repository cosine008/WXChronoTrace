from django.urls import path

from .api import (
    comment_summary_view,
    comment_thread_comments_view,
    comment_thread_read_view,
    comment_thread_reopen_view,
    comment_thread_resolve_view,
    comment_threads_view,
)

urlpatterns = [
    path("comments/threads/", comment_threads_view),
    path("comments/threads/<int:thread_id>/comments/", comment_thread_comments_view),
    path("comments/threads/<int:thread_id>/resolve/", comment_thread_resolve_view),
    path("comments/threads/<int:thread_id>/reopen/", comment_thread_reopen_view),
    path("comments/threads/<int:thread_id>/read/", comment_thread_read_view),
    path("comments/summary/", comment_summary_view),
]
