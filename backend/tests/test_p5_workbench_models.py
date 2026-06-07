import pytest
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction

from apps.schemas.models import DataSchema, TableCollaborator
from apps.workbench.admin import (
    WorkbenchDataCardDetailAdmin,
    WorkbenchDataCardFieldAdmin,
    WorkbenchDataCardFieldInline,
    WorkbenchItemAdmin,
    WorkbenchLinkAdmin,
    WorkbenchMaterialDetailAdmin,
    WorkbenchNoteDetailAdmin,
    WorkbenchUserSettingAdmin,
)
from apps.workbench.constants import DEFAULT_MATERIAL_QUOTA_BYTES
from apps.workbench.models import (
    WorkbenchDataCardDetail,
    WorkbenchDataCardField,
    WorkbenchItem,
    WorkbenchLink,
    WorkbenchMaterialDetail,
    WorkbenchNoteDetail,
    WorkbenchUserSetting,
    workbench_material_upload_path,
)


@pytest.fixture
def owner(db):
    return User.objects.create_user(username="owner", password="pass")


@pytest.fixture
def outsider(db):
    return User.objects.create_user(username="outsider", password="pass")


@pytest.fixture
def stranger(db):
    return User.objects.create_user(username="stranger", password="pass")


@pytest.fixture
def schema(owner):
    return DataSchema.objects.create(
        schema_code="workbench_schema",
        name="工作台关联表",
        icon="box",
        temporal_mode=DataSchema.TemporalMode.CONTINUOUS,
        identity_field_key="code",
        fields_config=[{"key": "code", "label": "编号", "type": "text"}],
        owner=owner,
        created_by=owner,
    )


@pytest.fixture
def private_schema(outsider):
    return DataSchema.objects.create(
        schema_code="private_workbench_schema",
        name="外部私有表",
        icon="box",
        temporal_mode=DataSchema.TemporalMode.CONTINUOUS,
        identity_field_key="code",
        fields_config=[{"key": "code", "label": "编号", "type": "text"}],
        owner=outsider,
        visibility=DataSchema.Visibility.PRIVATE,
        created_by=outsider,
    )


@pytest.fixture
def shared_schema_for_owner(owner, outsider):
    schema = DataSchema.objects.create(
        schema_code="shared_workbench_schema",
        name="共享表",
        icon="box",
        temporal_mode=DataSchema.TemporalMode.CONTINUOUS,
        identity_field_key="code",
        fields_config=[{"key": "code", "label": "编号", "type": "text"}],
        owner=outsider,
        visibility=DataSchema.Visibility.SHARED,
        created_by=outsider,
    )
    TableCollaborator.objects.create(
        schema=schema,
        user=owner,
        role=TableCollaborator.Role.VIEWER,
        added_by=outsider,
    )
    return schema


@pytest.fixture
def shared_schema_for_stranger(owner):
    return DataSchema.objects.create(
        schema_code="shared_for_stranger_schema",
        name="他人共享表",
        icon="box",
        temporal_mode=DataSchema.TemporalMode.CONTINUOUS,
        identity_field_key="code",
        fields_config=[{"key": "code", "label": "编号", "type": "text"}],
        owner=owner,
        visibility=DataSchema.Visibility.SHARED,
        created_by=owner,
    )


@pytest.fixture
def public_schema(outsider):
    return DataSchema.objects.create(
        schema_code="public_workbench_schema",
        name="公开表",
        icon="box",
        temporal_mode=DataSchema.TemporalMode.CONTINUOUS,
        identity_field_key="code",
        fields_config=[{"key": "code", "label": "编号", "type": "text"}],
        owner=outsider,
        visibility=DataSchema.Visibility.PUBLIC,
        created_by=outsider,
    )


@pytest.mark.django_db
def test_data_card_item_owns_detail_and_fields(owner):
    item = WorkbenchItem.objects.create(
        owner=owner,
        type=WorkbenchItem.Type.DATA_CARD,
        title="2026 年事业单位缴费基数",
        tags=["事业单位", "2026"],
    )
    detail = WorkbenchDataCardDetail.objects.create(
        item=item,
        category=WorkbenchDataCardDetail.Category.SOCIAL_SECURITY,
        applicable_year=2026,
        applicable_region="xx 市",
        applicable_subject="事业单位",
        status=WorkbenchDataCardDetail.Status.CONFIRMED,
    )
    field = WorkbenchDataCardField.objects.create(
        card=detail,
        name="养老基数下限",
        value="5000",
        value_type=WorkbenchDataCardField.ValueType.MONEY,
        unit="元",
        sort_order=1,
    )

    assert item.data_card_detail == detail
    assert list(detail.fields.values_list("name", flat=True)) == [field.name]


@pytest.mark.django_db
def test_note_and_material_details_are_separate(owner):
    note = WorkbenchItem.objects.create(
        owner=owner,
        type=WorkbenchItem.Type.NOTE,
        title="导入注意",
    )
    material = WorkbenchItem.objects.create(
        owner=owner,
        type=WorkbenchItem.Type.MATERIAL,
        title="政策.pdf",
    )

    WorkbenchNoteDetail.objects.create(
        item=note,
        markdown_content="- 人员类别待确认",
        stage=WorkbenchNoteDetail.Stage.EXCEL_IMPORT,
        status=WorkbenchNoteDetail.Status.PENDING_CONFIRM,
    )
    WorkbenchMaterialDetail.objects.create(
        item=material,
        file="workbench_materials/user_1/policy.pdf",
        original_name="政策.pdf",
        content_type="application/pdf",
        size=128,
    )

    assert note.note_detail.stage == WorkbenchNoteDetail.Stage.EXCEL_IMPORT
    assert material.material_detail.original_name == "政策.pdf"


@pytest.mark.django_db
def test_detail_objects_create_rejects_wrong_item_types(owner):
    note_item = WorkbenchItem.objects.create(
        owner=owner,
        type=WorkbenchItem.Type.NOTE,
        title="笔记",
    )
    data_card_item = WorkbenchItem.objects.create(
        owner=owner,
        type=WorkbenchItem.Type.DATA_CARD,
        title="资料卡",
    )

    with pytest.raises(ValidationError):
        WorkbenchDataCardDetail.objects.create(
            item=note_item,
            category=WorkbenchDataCardDetail.Category.OTHER,
        )

    with pytest.raises(ValidationError):
        WorkbenchNoteDetail.objects.create(
            item=data_card_item,
            markdown_content="不应落库",
        )

    with pytest.raises(ValidationError):
        WorkbenchMaterialDetail.objects.create(
            item=note_item,
            original_name="policy.pdf",
            content_type="application/pdf",
            size=128,
        )


@pytest.mark.django_db
def test_link_requires_one_target(owner, schema, outsider, private_schema):
    item = WorkbenchItem.objects.create(
        owner=owner,
        type=WorkbenchItem.Type.NOTE,
        title="笔记",
    )
    target_item = WorkbenchItem.objects.create(
        owner=owner,
        type=WorkbenchItem.Type.MATERIAL,
        title="政策.pdf",
    )
    link = WorkbenchLink(owner=owner, source_item=item)

    with pytest.raises(ValidationError):
        link.full_clean()

    item_target_link = WorkbenchLink(owner=owner, source_item=item, target_item=target_item)
    item_target_link.full_clean()

    valid = WorkbenchLink(owner=owner, source_item=item, target_schema=schema)
    valid.full_clean()

    with pytest.raises(ValidationError):
        WorkbenchLink(
            owner=owner,
            source_item=item,
            target_item=target_item,
            target_schema=schema,
        ).full_clean()

    with pytest.raises(ValidationError):
        WorkbenchLink.objects.create(
            owner=owner,
            source_item=item,
            target_schema=private_schema,
        )

    outsider_target_item = WorkbenchItem.objects.create(
        owner=outsider,
        type=WorkbenchItem.Type.MATERIAL,
        title="外部材料.pdf",
    )

    with pytest.raises(ValidationError):
        WorkbenchLink.objects.create(
            owner=outsider,
            source_item=item,
            target_item=outsider_target_item,
        )

    with pytest.raises(ValidationError):
        WorkbenchLink.objects.create(
            owner=owner,
            source_item=item,
            target_item=outsider_target_item,
        )


@pytest.mark.django_db
def test_link_database_constraints_still_exist(owner, schema):
    source_item = WorkbenchItem.objects.create(
        owner=owner,
        type=WorkbenchItem.Type.NOTE,
        title="源笔记",
    )
    target_item = WorkbenchItem.objects.create(
        owner=owner,
        type=WorkbenchItem.Type.MATERIAL,
        title="目标材料.pdf",
    )

    with pytest.raises(IntegrityError):
        with transaction.atomic():
            WorkbenchLink.objects.bulk_create(
                [WorkbenchLink(owner=owner, source_item=source_item)],
            )

    with pytest.raises(IntegrityError):
        with transaction.atomic():
            WorkbenchLink.objects.bulk_create(
                [
                    WorkbenchLink(
                        owner=owner,
                        source_item=source_item,
                        target_item=target_item,
                        target_schema=schema,
                    )
                ],
            )

    WorkbenchLink.objects.create(
        owner=owner,
        source_item=source_item,
        target_item=target_item,
    )
    with pytest.raises(IntegrityError):
        with transaction.atomic():
            WorkbenchLink.objects.bulk_create(
                [
                    WorkbenchLink(
                        owner=owner,
                        source_item=source_item,
                        target_item=target_item,
                    )
                ],
            )

    WorkbenchLink.objects.create(
        owner=owner,
        source_item=source_item,
        target_schema=schema,
    )
    with pytest.raises(IntegrityError):
        with transaction.atomic():
            WorkbenchLink.objects.bulk_create(
                [
                    WorkbenchLink(
                        owner=owner,
                        source_item=source_item,
                        target_schema=schema,
                    )
                ],
            )


@pytest.mark.django_db
def test_link_schema_visibility_rules_cover_shared_and_public(
    owner,
    outsider,
    stranger,
    shared_schema_for_owner,
    shared_schema_for_stranger,
    public_schema,
):
    owner_source_item = WorkbenchItem.objects.create(
        owner=owner,
        type=WorkbenchItem.Type.NOTE,
        title="共享来源笔记",
    )
    stranger_source_item = WorkbenchItem.objects.create(
        owner=stranger,
        type=WorkbenchItem.Type.NOTE,
        title="他人来源笔记",
    )

    WorkbenchLink.objects.create(
        owner=owner,
        source_item=owner_source_item,
        target_schema=shared_schema_for_owner,
    )

    with pytest.raises(ValidationError):
        WorkbenchLink.objects.create(
            owner=stranger,
            source_item=stranger_source_item,
            target_schema=shared_schema_for_stranger,
        )

    WorkbenchLink.objects.create(
        owner=stranger,
        source_item=stranger_source_item,
        target_schema=public_schema,
    )


@pytest.mark.django_db
def test_material_upload_path_uses_cached_item_owner(owner):
    item = WorkbenchItem.objects.create(
        owner=owner,
        type=WorkbenchItem.Type.MATERIAL,
        title="缓存材料.pdf",
    )

    path = workbench_material_upload_path(
        WorkbenchMaterialDetail(item=item, original_name="cached.pdf"),
        "cached.pdf",
    )

    assert f"workbench_materials/user_{owner.id}/" in path


@pytest.mark.django_db
def test_material_upload_path_uses_item_id_db_fallback(owner):
    item = WorkbenchItem.objects.create(
        owner=owner,
        type=WorkbenchItem.Type.MATERIAL,
        title="回退材料.pdf",
    )
    detail = WorkbenchMaterialDetail(item_id=item.id, original_name="fallback.pdf")

    assert detail._state.fields_cache == {}

    path = workbench_material_upload_path(detail, "fallback.pdf")

    assert f"workbench_materials/user_{owner.id}/" in path


def test_material_upload_path_is_robust_without_item_and_original_name_is_required():
    path = workbench_material_upload_path(WorkbenchMaterialDetail(), "A.PDF")

    assert path.startswith("workbench_materials/unknown/")
    assert path.endswith(".pdf")
    assert WorkbenchMaterialDetail._meta.get_field("original_name").blank is False


def test_material_upload_path_handles_suffixless_filename():
    path = workbench_material_upload_path(WorkbenchMaterialDetail(), "README")

    assert path.startswith("workbench_materials/unknown/")
    assert "." not in path.rsplit("/", maxsplit=1)[-1]


@pytest.mark.django_db
def test_data_card_detail_save_with_item_id_uses_uncached_relation(owner):
    note_item = WorkbenchItem.objects.create(
        owner=owner,
        type=WorkbenchItem.Type.NOTE,
        title="未缓存笔记",
    )

    with pytest.raises(ValidationError):
        WorkbenchDataCardDetail(
            item_id=note_item.id,
            category=WorkbenchDataCardDetail.Category.OTHER,
        ).save()


@pytest.mark.django_db
def test_link_full_clean_supports_id_only_visible_schema(owner, shared_schema_for_owner):
    source_item = WorkbenchItem.objects.create(
        owner=owner,
        type=WorkbenchItem.Type.NOTE,
        title="ID only 来源",
    )

    WorkbenchLink(
        owner_id=owner.id,
        source_item_id=source_item.id,
        target_schema_id=shared_schema_for_owner.id,
    ).full_clean()


def test_workbench_admin_classes_expose_metadata_only():
    forbidden_display_fields = {
        "title",
        "summary",
        "tags",
        "item",
        "card",
        "source_item",
        "target_item",
        "target_schema",
        "original_name",
        "name",
        "value",
        "remark",
        "markdown_content",
        "description",
        "checksum",
        "applicable_region",
        "applicable_subject",
    }
    admin_classes = (
        WorkbenchItemAdmin,
        WorkbenchDataCardDetailAdmin,
        WorkbenchDataCardFieldAdmin,
        WorkbenchNoteDetailAdmin,
        WorkbenchMaterialDetailAdmin,
        WorkbenchLinkAdmin,
        WorkbenchUserSettingAdmin,
    )

    for admin_cls in admin_classes:
        for attr_name in ("list_display", "fields", "readonly_fields"):
            values = tuple(getattr(admin_cls, attr_name, ()) or ())
            assert forbidden_display_fields.isdisjoint(values)

        search_fields = tuple(getattr(admin_cls, "search_fields", ()) or ())
        assert all(value == "=id" or value.endswith("owner__username") for value in search_fields)

    assert forbidden_display_fields.isdisjoint(tuple(WorkbenchDataCardFieldInline.fields))


@pytest.mark.django_db
def test_workbench_model_str_is_metadata_safe(owner, outsider):
    sensitive_title = "SENSITIVE_TITLE_机密资料"
    sensitive_field_name = "SECRET_FIELD_身份证号"
    sensitive_filename = "private_salary_sheet.xlsx"
    sensitive_schema_name = "Payroll Master Secret"

    item = WorkbenchItem.objects.create(
        owner=owner,
        type=WorkbenchItem.Type.DATA_CARD,
        title=sensitive_title,
    )
    detail = WorkbenchDataCardDetail.objects.create(
        item=item,
        category=WorkbenchDataCardDetail.Category.POLICY,
    )
    field = WorkbenchDataCardField.objects.create(
        card=detail,
        name=sensitive_field_name,
        value="top-secret",
        value_type=WorkbenchDataCardField.ValueType.TEXT,
    )
    note_item = WorkbenchItem.objects.create(
        owner=owner,
        type=WorkbenchItem.Type.NOTE,
        title="TOP_NOTE_审批草稿",
    )
    note_detail = WorkbenchNoteDetail.objects.create(
        item=note_item,
        markdown_content="Highly sensitive note body",
        stage=WorkbenchNoteDetail.Stage.APPROVAL,
        status=WorkbenchNoteDetail.Status.PENDING_CONFIRM,
    )
    material_item = WorkbenchItem.objects.create(
        owner=owner,
        type=WorkbenchItem.Type.MATERIAL,
        title="TOP_FILE_原始材料",
    )
    material_detail = WorkbenchMaterialDetail.objects.create(
        item=material_item,
        original_name=sensitive_filename,
        content_type="application/vnd.ms-excel",
        size=2048,
    )
    schema = DataSchema.objects.create(
        schema_code="secret_schema",
        name=sensitive_schema_name,
        icon="box",
        temporal_mode=DataSchema.TemporalMode.CONTINUOUS,
        identity_field_key="code",
        fields_config=[{"key": "code", "label": "编号", "type": "text"}],
        owner=outsider,
        visibility=DataSchema.Visibility.PUBLIC,
        created_by=outsider,
    )
    link = WorkbenchLink.objects.create(
        owner=owner,
        source_item=note_item,
        target_schema=schema,
    )
    setting = WorkbenchUserSetting.objects.create(owner=outsider)

    safe_strings = [
        str(item),
        str(detail),
        str(field),
        str(note_detail),
        str(material_detail),
        str(link),
        str(setting),
    ]
    forbidden_fragments = [
        sensitive_title,
        sensitive_field_name,
        sensitive_filename,
        sensitive_schema_name,
        "TOP_NOTE_审批草稿",
        "TOP_FILE_原始材料",
        "Highly sensitive note body",
    ]

    for rendered in safe_strings:
        for fragment in forbidden_fragments:
            assert fragment not in rendered


@pytest.mark.django_db
def test_user_setting_defaults(owner):
    setting = WorkbenchUserSetting.objects.create(owner=owner)

    assert setting.material_quota_bytes == DEFAULT_MATERIAL_QUOTA_BYTES
    assert setting.upload_disabled is False
    assert setting.storage_used_bytes == 0
