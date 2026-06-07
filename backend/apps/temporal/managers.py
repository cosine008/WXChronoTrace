from django.db import models
from django.db.models import Q


class TemporalRecordQuerySet(models.QuerySet):
    def for_user(self, user):
        if not _is_authenticated(user):
            return self.none()
        if user.is_superuser:
            return self.all()

        owned = Q(entity__schema__owner=user)
        shared = Q(entity__schema__visibility="shared", entity__schema__collaborators__user=user)
        public = Q(entity__schema__visibility="public")
        return self.filter(owned | shared | public).distinct()


def _is_authenticated(user) -> bool:
    return bool(getattr(user, "is_authenticated", False))
