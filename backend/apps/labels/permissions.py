from rest_framework.exceptions import PermissionDenied

from apps.schemas.models import DataSchema
from apps.schemas.permissions import can_edit_data, can_view_schema
from apps.temporal.models import Entity


def ensure_can_view_labels(user, entity: Entity) -> None:
    if not can_view_schema(user, entity.schema):
        raise PermissionDenied("你对该实体所属表无查看权限")


def ensure_can_manage_labels(user, schema: DataSchema) -> None:
    if not can_edit_data(user, schema):
        raise PermissionDenied("你对该表无标签管理权限")
