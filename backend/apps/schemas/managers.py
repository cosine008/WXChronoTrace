from django.db import models
from django.db.models import Q


class PermissionQuerySet(models.QuerySet):
    def for_user(self, user):
        if not _is_authenticated(user):
            return self.none()
        if user.is_superuser:
            return self.all()

        owned = Q(owner=user)
        shared = Q(visibility="shared", collaborators__user=user)
        public = Q(visibility="public")
        return self.filter(owned | shared | public).distinct()


class PermissionManager(models.Manager.from_queryset(PermissionQuerySet)):
    pass


def _is_authenticated(user) -> bool:
    return bool(getattr(user, "is_authenticated", False))
