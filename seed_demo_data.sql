-- ChronoTrace demo data seed for PostgreSQL.
-- Run after migrations:
--   psql "$DATABASE_URL" -f backend/scripts/seed_demo_data.sql
--
-- Default demo accounts:
--   demo_owner / demo_editor / demo_viewer
--   password: DemoPass123!
--
-- This script rebuilds demo schemas whose schema_code starts with "demo_".
-- It intentionally keeps audit_auditlog and demo users, because AuditLog is
-- immutable and may protect referenced users.

BEGIN;

DO $$
#variable_conflict use_variable
DECLARE
    demo_schema_ids bigint[];
    demo_user_ids integer[];

    password_hash text := 'pbkdf2_sha256$870000$VKaIhpAaIjH8NZQrsnlwM8$3xbcrqxbA2HeAy98gdfFgcCZk+tn/ChJGKHnbfDToKs=';

    owner_id integer;
    editor_id integer;
    viewer_id integer;

    asset_schema_id bigint;
    staff_schema_id bigint;

    asset_initial_cs_id bigint;
    asset_update_cs_id bigint;
    asset_terminate_cs_id bigint;
    asset_pending_cs_id bigint;
    staff_initial_cs_id bigint;
    staff_update_cs_id bigint;

    eq001_id bigint;
    eq002_id bigint;
    eq003_id bigint;
    eq004_id bigint;
    eq005_id bigint;
    eq006_id bigint;
    eq007_id bigint;
    eq008_id bigint;
    eq009_id bigint;

    emp001_id bigint;
    emp002_id bigint;
    emp003_id bigint;
    emp004_id bigint;
    emp005_id bigint;
    emp006_id bigint;

    r_eq001 bigint;
    r_eq002 bigint;
    r_eq003_initial bigint;
    r_eq003_current bigint;
    r_eq004_initial bigint;
    r_eq004_current bigint;
    r_eq005_initial bigint;
    r_eq005_current bigint;
    r_eq006 bigint;
    r_eq007 bigint;
    r_eq008 bigint;

    r_emp001 bigint;
    r_emp002 bigint;
    r_emp003_initial bigint;
    r_emp003_current bigint;
    r_emp004_initial bigint;
    r_emp004_current bigint;
    r_emp005 bigint;
    r_emp006_initial bigint;
    r_emp006_current bigint;

    ce_id bigint;
    thread_id bigint;
    comment_id bigint;
    label_id bigint;
    note_item_id bigint;
    card_item_id bigint;
    card_detail_id bigint;
    material_item_id bigint;
BEGIN
    SELECT COALESCE(array_agg(id), ARRAY[]::bigint[])
    INTO demo_schema_ids
    FROM schemas_dataschema ds
    WHERE ds.schema_code LIKE 'demo\_%' ESCAPE '\';

    SELECT COALESCE(array_agg(id), ARRAY[]::integer[])
    INTO demo_user_ids
    FROM auth_user au
    WHERE au.username LIKE 'demo\_%' ESCAPE '\';

    DELETE FROM notifications_notification n
    WHERE n.recipient_id = ANY(demo_user_ids)
       OR n.actor_id = ANY(demo_user_ids)
       OR (
            n.target_kind = 'schema'
            AND n.target_id IN (SELECT unnest(demo_schema_ids)::text)
       );

    DELETE FROM comments_commentmention cm
    WHERE cm.comment_id IN (
        SELECT c.id
        FROM comments_comment c
        JOIN comments_commentthread t ON t.id = c.thread_id
        WHERE t.schema_id = ANY(demo_schema_ids)
    );
    DELETE FROM comments_commentreadstate crs
    WHERE crs.thread_id IN (
        SELECT t.id FROM comments_commentthread t WHERE t.schema_id = ANY(demo_schema_ids)
    );
    DELETE FROM comments_comment c
    WHERE c.thread_id IN (
        SELECT t.id FROM comments_commentthread t WHERE t.schema_id = ANY(demo_schema_ids)
    );
    DELETE FROM comments_commentthread t WHERE t.schema_id = ANY(demo_schema_ids);

    DELETE FROM labels_labelscanevent lse
    WHERE lse.schema_id = ANY(demo_schema_ids) OR lse.actor_id = ANY(demo_user_ids);
    DELETE FROM labels_entitylabel el WHERE el.schema_id = ANY(demo_schema_ids);

    DELETE FROM workbench_workbenchlink wl
    WHERE wl.owner_id = ANY(demo_user_ids) OR wl.target_schema_id = ANY(demo_schema_ids);
    DELETE FROM workbench_workbenchmaterialchecklistitem wci
    WHERE wci.owner_id = ANY(demo_user_ids) OR wci.schema_id = ANY(demo_schema_ids);
    DELETE FROM workbench_workbenchdatacardfield wcf
    WHERE wcf.card_id IN (
        SELECT wcd.id
        FROM workbench_workbenchdatacarddetail wcd
        JOIN workbench_workbenchitem wi ON wi.id = wcd.item_id
        WHERE wi.owner_id = ANY(demo_user_ids) AND wi.tags @> '["demo"]'::jsonb
    );
    DELETE FROM workbench_workbenchdatacarddetail wcd
    USING workbench_workbenchitem wi
    WHERE wcd.item_id = wi.id
      AND wi.owner_id = ANY(demo_user_ids)
      AND wi.tags @> '["demo"]'::jsonb;
    DELETE FROM workbench_workbenchnotedetail wnd
    USING workbench_workbenchitem wi
    WHERE wnd.item_id = wi.id
      AND wi.owner_id = ANY(demo_user_ids)
      AND wi.tags @> '["demo"]'::jsonb;
    DELETE FROM workbench_workbenchmaterialdetail wmd
    USING workbench_workbenchitem wi
    WHERE wmd.item_id = wi.id
      AND wi.owner_id = ANY(demo_user_ids)
      AND wi.tags @> '["demo"]'::jsonb;
    DELETE FROM workbench_workbenchitem wi
    WHERE wi.owner_id = ANY(demo_user_ids) AND wi.tags @> '["demo"]'::jsonb;

    DELETE FROM stats_exportjob ej WHERE ej.schema_id = ANY(demo_schema_ids);
    DELETE FROM changesets_changeentry ce
    USING changesets_changeset cs
    WHERE ce.change_set_id = cs.id
      AND cs.schema_id = ANY(demo_schema_ids);
    DELETE FROM temporal_temporalrecord tr
    WHERE tr.entity_id IN (
        SELECT e.id FROM temporal_entity e WHERE e.schema_id = ANY(demo_schema_ids)
    );
    DELETE FROM changesets_changeset cs WHERE cs.schema_id = ANY(demo_schema_ids);
    DELETE FROM temporal_entity e WHERE e.schema_id = ANY(demo_schema_ids);
    DELETE FROM schemas_schemaversion sv WHERE sv.schema_id = ANY(demo_schema_ids);
    DELETE FROM schemas_tablecollaborator tc WHERE tc.schema_id = ANY(demo_schema_ids);
    DELETE FROM schemas_dataschema ds WHERE ds.id = ANY(demo_schema_ids);

    INSERT INTO auth_user (
        password, last_login, is_superuser, username, first_name, last_name,
        email, is_staff, is_active, date_joined
    )
    VALUES (
        password_hash, NULL, FALSE, 'demo_owner', '', '', 'demo_owner@chronotrace.demo',
        TRUE, TRUE, now()
    )
    ON CONFLICT (username) DO UPDATE SET
        password = EXCLUDED.password,
        email = EXCLUDED.email,
        is_staff = EXCLUDED.is_staff,
        is_active = EXCLUDED.is_active
    RETURNING id INTO owner_id;

    INSERT INTO auth_user (
        password, last_login, is_superuser, username, first_name, last_name,
        email, is_staff, is_active, date_joined
    )
    VALUES (
        password_hash, NULL, FALSE, 'demo_editor', '', '', 'demo_editor@chronotrace.demo',
        FALSE, TRUE, now()
    )
    ON CONFLICT (username) DO UPDATE SET
        password = EXCLUDED.password,
        email = EXCLUDED.email,
        is_staff = EXCLUDED.is_staff,
        is_active = EXCLUDED.is_active
    RETURNING id INTO editor_id;

    INSERT INTO auth_user (
        password, last_login, is_superuser, username, first_name, last_name,
        email, is_staff, is_active, date_joined
    )
    VALUES (
        password_hash, NULL, FALSE, 'demo_viewer', '', '', 'demo_viewer@chronotrace.demo',
        FALSE, TRUE, now()
    )
    ON CONFLICT (username) DO UPDATE SET
        password = EXCLUDED.password,
        email = EXCLUDED.email,
        is_staff = EXCLUDED.is_staff,
        is_active = EXCLUDED.is_active
    RETURNING id INTO viewer_id;

    INSERT INTO accounts_userprofile (user_id, display_name, is_active, left_at)
    VALUES
        (owner_id, '演示表负责人', TRUE, NULL),
        (editor_id, '演示编辑员', TRUE, NULL),
        (viewer_id, '演示观察员', TRUE, NULL)
    ON CONFLICT (user_id) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        is_active = TRUE,
        left_at = NULL;

    INSERT INTO schemas_dataschema (
        schema_code, name, description, icon, temporal_mode, period_unit,
        identity_field_key, fields_config, label_print_config, current_version,
        config_migrated_at, owner_id, visibility, approval_required, created_at,
        created_by_id, is_archived
    )
    VALUES (
        'demo_asset_registry',
        '演示-设备资产台账',
        '用于演示当前视图、历史追溯、变更审批、评论和标签扫码。',
        'boxes',
        'continuous',
        NULL,
        'asset_no',
        '[
            {"key":"asset_no","label":"资产编号","type":"text","required":true,"indexed":true,"introduced_in_version":1},
            {"key":"asset_name","label":"资产名称","type":"text","required":true,"indexed":true,"introduced_in_version":1},
            {"key":"category","label":"资产分类","type":"enum","validators":{"options":["采集设备","生产设备","办公设备","安全设备"]},"introduced_in_version":1},
            {"key":"status","label":"状态","type":"enum","indexed":true,"validators":{"options":["在用","维修","闲置","报废"]},"introduced_in_version":1},
            {"key":"department","label":"使用部门","type":"text","indexed":true,"introduced_in_version":1},
            {"key":"custodian","label":"责任人","type":"person","validators":{"must_be_active":true},"introduced_in_version":1},
            {"key":"purchase_date","label":"采购日期","type":"date","introduced_in_version":1},
            {"key":"original_value","label":"原值","type":"number","validators":{"min":0,"decimals":2},"introduced_in_version":1},
            {"key":"location","label":"所在位置","type":"text","introduced_in_version":1},
            {"key":"maintenance_note","label":"维护备注","type":"markdown","introduced_in_version":1}
        ]'::jsonb,
        '{"default_template_code":"asset_standard","templates":{"asset_standard":{"enabled":true,"field_keys":["asset_no","asset_name","status","location"]}}}'::jsonb,
        1, now(), owner_id, 'shared', TRUE, now(), owner_id, FALSE
    )
    RETURNING id INTO asset_schema_id;

    INSERT INTO schemas_dataschema (
        schema_code, name, description, icon, temporal_mode, period_unit,
        identity_field_key, fields_config, label_print_config, current_version,
        config_migrated_at, owner_id, visibility, approval_required, created_at,
        created_by_id, is_archived
    )
    VALUES (
        'demo_staff_monthly',
        '演示-员工月度花名册',
        '按月维护员工状态和社保基数，用于演示 periodic 表。',
        'users',
        'periodic',
        'month',
        'employee_no',
        '[
            {"key":"employee_no","label":"员工编号","type":"text","required":true,"indexed":true,"introduced_in_version":1},
            {"key":"name","label":"姓名","type":"text","required":true,"indexed":true,"introduced_in_version":1},
            {"key":"department","label":"部门","type":"text","indexed":true,"introduced_in_version":1},
            {"key":"job_title","label":"岗位","type":"text","introduced_in_version":1},
            {"key":"employment_status","label":"在职状态","type":"enum","validators":{"options":["在职","试用","转岗","离职"]},"introduced_in_version":1},
            {"key":"city","label":"参保城市","type":"text","introduced_in_version":1},
            {"key":"social_security_base","label":"社保基数","type":"number","validators":{"min":0,"decimals":2},"introduced_in_version":1},
            {"key":"hr_owner","label":"HR 负责人","type":"person","validators":{"must_be_active":true},"introduced_in_version":1}
        ]'::jsonb,
        '{}'::jsonb,
        1, now(), owner_id, 'shared', FALSE, now(), owner_id, FALSE
    )
    RETURNING id INTO staff_schema_id;

    INSERT INTO schemas_schemaversion (
        schema_id, version, fields_config, changelog, created_at, created_by_id
    )
    SELECT id, current_version, fields_config, '演示数据初始字段', now(), owner_id
    FROM schemas_dataschema
    WHERE id IN (asset_schema_id, staff_schema_id);

    INSERT INTO schemas_tablecollaborator (schema_id, user_id, role, added_at, added_by_id)
    VALUES
        (asset_schema_id, editor_id, 'editor', now(), owner_id),
        (asset_schema_id, viewer_id, 'viewer', now(), owner_id),
        (staff_schema_id, editor_id, 'editor', now(), owner_id),
        (staff_schema_id, viewer_id, 'viewer', now(), owner_id);

    INSERT INTO changesets_changeset (
        schema_id, summary, status, approval_required, approver_id, approved_at,
        rejected_reason, created_at, created_by_id, applied_at, revert_of_id, source
    )
    VALUES
        (asset_schema_id, '演示资产初始导入', 'applied', FALSE, NULL, NULL, '', now(), owner_id, now(), NULL, 'manual')
    RETURNING id INTO asset_initial_cs_id;

    INSERT INTO temporal_entity (schema_id, business_code, created_at, created_by_id)
    VALUES
        (asset_schema_id, 'EQ-2024-001', now(), owner_id) RETURNING id INTO eq001_id;
    INSERT INTO temporal_entity (schema_id, business_code, created_at, created_by_id)
    VALUES
        (asset_schema_id, 'EQ-2024-002', now(), owner_id) RETURNING id INTO eq002_id;
    INSERT INTO temporal_entity (schema_id, business_code, created_at, created_by_id)
    VALUES
        (asset_schema_id, 'EQ-2024-003', now(), owner_id) RETURNING id INTO eq003_id;
    INSERT INTO temporal_entity (schema_id, business_code, created_at, created_by_id)
    VALUES
        (asset_schema_id, 'EQ-2024-004', now(), owner_id) RETURNING id INTO eq004_id;
    INSERT INTO temporal_entity (schema_id, business_code, created_at, created_by_id)
    VALUES
        (asset_schema_id, 'EQ-2024-005', now(), owner_id) RETURNING id INTO eq005_id;
    INSERT INTO temporal_entity (schema_id, business_code, created_at, created_by_id)
    VALUES
        (asset_schema_id, 'EQ-2024-006', now(), owner_id) RETURNING id INTO eq006_id;
    INSERT INTO temporal_entity (schema_id, business_code, created_at, created_by_id)
    VALUES
        (asset_schema_id, 'EQ-2024-007', now(), owner_id) RETURNING id INTO eq007_id;
    INSERT INTO temporal_entity (schema_id, business_code, created_at, created_by_id)
    VALUES
        (asset_schema_id, 'EQ-2024-008', now(), owner_id) RETURNING id INTO eq008_id;

    INSERT INTO temporal_temporalrecord (
        entity_id, schema_version, data_payload, valid_from, valid_to, change_set_id,
        recorded_at, recorded_by_id, is_superseded, superseded_by_id
    )
    VALUES (
        eq001_id, 1,
        jsonb_build_object('asset_no','EQ-2024-001','asset_name','边缘网关 A1','category','采集设备','status','在用','department','生产一部','custodian',editor_id,'purchase_date','2023-11-18','original_value',12800,'location','一号厂房 A-01','maintenance_note','演示样本：可在时间线上查看后续变更。'),
        DATE '2024-01-01', NULL, asset_initial_cs_id, now(), owner_id, FALSE, NULL
    )
    RETURNING id INTO r_eq001;
    INSERT INTO changesets_changeentry (change_set_id, entity_id, action, data_before, data_after, valid_from, valid_to, new_record_id)
    SELECT asset_initial_cs_id, eq001_id, 'create', NULL, data_payload, valid_from, valid_to, id
    FROM temporal_temporalrecord WHERE id = r_eq001;

    INSERT INTO temporal_temporalrecord (
        entity_id, schema_version, data_payload, valid_from, valid_to, change_set_id,
        recorded_at, recorded_by_id, is_superseded, superseded_by_id
    )
    VALUES (
        eq002_id, 1,
        jsonb_build_object('asset_no','EQ-2024-002','asset_name','温湿度采集器','category','采集设备','status','在用','department','质量部','custodian',editor_id,'purchase_date','2023-11-18','original_value',3600,'location','恒温库 B-02','maintenance_note','演示样本：可在时间线上查看后续变更。'),
        DATE '2024-01-01', NULL, asset_initial_cs_id, now(), owner_id, FALSE, NULL
    )
    RETURNING id INTO r_eq002;
    INSERT INTO changesets_changeentry (change_set_id, entity_id, action, data_before, data_after, valid_from, valid_to, new_record_id)
    SELECT asset_initial_cs_id, eq002_id, 'create', NULL, data_payload, valid_from, valid_to, id
    FROM temporal_temporalrecord WHERE id = r_eq002;

    INSERT INTO temporal_temporalrecord (
        entity_id, schema_version, data_payload, valid_from, valid_to, change_set_id,
        recorded_at, recorded_by_id, is_superseded, superseded_by_id
    )
    VALUES (
        eq003_id, 1,
        jsonb_build_object('asset_no','EQ-2024-003','asset_name','数控折弯机','category','生产设备','status','在用','department','生产二部','custodian',editor_id,'purchase_date','2023-11-18','original_value',186000,'location','二号厂房 C-11','maintenance_note','演示样本：可在时间线上查看后续变更。'),
        DATE '2024-01-01', DATE '2024-07-01', asset_initial_cs_id, now(), owner_id, FALSE, NULL
    )
    RETURNING id INTO r_eq003_initial;
    INSERT INTO changesets_changeentry (change_set_id, entity_id, action, data_before, data_after, valid_from, valid_to, new_record_id)
    SELECT asset_initial_cs_id, eq003_id, 'create', NULL, data_payload, valid_from, valid_to, id
    FROM temporal_temporalrecord WHERE id = r_eq003_initial;

    INSERT INTO temporal_temporalrecord (
        entity_id, schema_version, data_payload, valid_from, valid_to, change_set_id,
        recorded_at, recorded_by_id, is_superseded, superseded_by_id
    )
    VALUES (
        eq004_id, 1,
        jsonb_build_object('asset_no','EQ-2024-004','asset_name','访客闸机','category','安全设备','status','维修','department','行政部','custodian',editor_id,'purchase_date','2023-11-18','original_value',42000,'location','园区南门','maintenance_note','演示样本：可在时间线上查看后续变更。'),
        DATE '2024-01-01', DATE '2024-07-01', asset_initial_cs_id, now(), owner_id, FALSE, NULL
    )
    RETURNING id INTO r_eq004_initial;
    INSERT INTO changesets_changeentry (change_set_id, entity_id, action, data_before, data_after, valid_from, valid_to, new_record_id)
    SELECT asset_initial_cs_id, eq004_id, 'create', NULL, data_payload, valid_from, valid_to, id
    FROM temporal_temporalrecord WHERE id = r_eq004_initial;

    INSERT INTO temporal_temporalrecord (
        entity_id, schema_version, data_payload, valid_from, valid_to, change_set_id,
        recorded_at, recorded_by_id, is_superseded, superseded_by_id
    )
    VALUES (
        eq005_id, 1,
        jsonb_build_object('asset_no','EQ-2024-005','asset_name','会议平板','category','办公设备','status','闲置','department','市场部','custodian',editor_id,'purchase_date','2023-11-18','original_value',9800,'location','会议室 302','maintenance_note','演示样本：可在时间线上查看后续变更。'),
        DATE '2024-01-01', DATE '2024-07-01', asset_initial_cs_id, now(), owner_id, FALSE, NULL
    )
    RETURNING id INTO r_eq005_initial;
    INSERT INTO changesets_changeentry (change_set_id, entity_id, action, data_before, data_after, valid_from, valid_to, new_record_id)
    SELECT asset_initial_cs_id, eq005_id, 'create', NULL, data_payload, valid_from, valid_to, id
    FROM temporal_temporalrecord WHERE id = r_eq005_initial;

    INSERT INTO temporal_temporalrecord (
        entity_id, schema_version, data_payload, valid_from, valid_to, change_set_id,
        recorded_at, recorded_by_id, is_superseded, superseded_by_id
    )
    VALUES (
        eq006_id, 1,
        jsonb_build_object('asset_no','EQ-2024-006','asset_name','旧条码打印机','category','办公设备','status','在用','department','仓储部','custodian',editor_id,'purchase_date','2023-11-18','original_value',2600,'location','仓库打包台','maintenance_note','演示样本：可在时间线上查看后续变更。'),
        DATE '2024-01-01', DATE '2025-01-01', asset_initial_cs_id, now(), owner_id, FALSE, NULL
    )
    RETURNING id INTO r_eq006;
    INSERT INTO changesets_changeentry (change_set_id, entity_id, action, data_before, data_after, valid_from, valid_to, new_record_id)
    SELECT asset_initial_cs_id, eq006_id, 'create', NULL, data_payload, valid_from, valid_to, id
    FROM temporal_temporalrecord WHERE id = r_eq006;

    INSERT INTO temporal_temporalrecord (
        entity_id, schema_version, data_payload, valid_from, valid_to, change_set_id,
        recorded_at, recorded_by_id, is_superseded, superseded_by_id
    )
    VALUES (
        eq007_id, 1,
        jsonb_build_object('asset_no','EQ-2024-007','asset_name','烟感控制器','category','安全设备','status','在用','department','安全部','custodian',editor_id,'purchase_date','2023-11-18','original_value',5400,'location','实验楼 2F','maintenance_note','演示样本：可在时间线上查看后续变更。'),
        DATE '2024-01-01', NULL, asset_initial_cs_id, now(), owner_id, FALSE, NULL
    )
    RETURNING id INTO r_eq007;
    INSERT INTO changesets_changeentry (change_set_id, entity_id, action, data_before, data_after, valid_from, valid_to, new_record_id)
    SELECT asset_initial_cs_id, eq007_id, 'create', NULL, data_payload, valid_from, valid_to, id
    FROM temporal_temporalrecord WHERE id = r_eq007;

    INSERT INTO temporal_temporalrecord (
        entity_id, schema_version, data_payload, valid_from, valid_to, change_set_id,
        recorded_at, recorded_by_id, is_superseded, superseded_by_id
    )
    VALUES (
        eq008_id, 1,
        jsonb_build_object('asset_no','EQ-2024-008','asset_name','视觉检测相机','category','生产设备','status','在用','department','质量部','custodian',editor_id,'purchase_date','2023-11-18','original_value',32500,'location','产线 V-03','maintenance_note','演示样本：可在时间线上查看后续变更。'),
        DATE '2024-01-01', NULL, asset_initial_cs_id, now(), owner_id, FALSE, NULL
    )
    RETURNING id INTO r_eq008;
    INSERT INTO changesets_changeentry (change_set_id, entity_id, action, data_before, data_after, valid_from, valid_to, new_record_id)
    SELECT asset_initial_cs_id, eq008_id, 'create', NULL, data_payload, valid_from, valid_to, id
    FROM temporal_temporalrecord WHERE id = r_eq008;

    INSERT INTO changesets_changeset (
        schema_id, summary, status, approval_required, approver_id, approved_at,
        rejected_reason, created_at, created_by_id, applied_at, revert_of_id, source
    )
    VALUES
        (asset_schema_id, '2024-07 演示批量调整', 'applied', FALSE, NULL, NULL, '', now(), editor_id, now(), NULL, 'manual')
    RETURNING id INTO asset_update_cs_id;

    INSERT INTO temporal_temporalrecord (
        entity_id, schema_version, data_payload, valid_from, valid_to, change_set_id,
        recorded_at, recorded_by_id, is_superseded, superseded_by_id
    )
    VALUES (
        eq003_id, 1,
        jsonb_build_object('asset_no','EQ-2024-003','asset_name','数控折弯机','category','生产设备','status','维修','department','生产二部','custodian',editor_id,'purchase_date','2023-11-18','original_value',186000,'location','二号厂房 C-11','maintenance_note','7 月巡检发现液压件磨损，已排维修单。'),
        DATE '2024-07-01', NULL, asset_update_cs_id, now(), editor_id, FALSE, NULL
    )
    RETURNING id INTO r_eq003_current;
    INSERT INTO changesets_changeentry (change_set_id, entity_id, action, data_before, data_after, valid_from, valid_to, new_record_id)
    SELECT asset_update_cs_id, eq003_id, 'update', before.data_payload, after.data_payload, after.valid_from, after.valid_to, after.id
    FROM temporal_temporalrecord before, temporal_temporalrecord after
    WHERE before.id = r_eq003_initial AND after.id = r_eq003_current;

    INSERT INTO temporal_temporalrecord (
        entity_id, schema_version, data_payload, valid_from, valid_to, change_set_id,
        recorded_at, recorded_by_id, is_superseded, superseded_by_id
    )
    VALUES (
        eq004_id, 1,
        jsonb_build_object('asset_no','EQ-2024-004','asset_name','访客闸机','category','安全设备','status','在用','department','行政部','custodian',editor_id,'purchase_date','2023-11-18','original_value',42000,'location','园区南门','maintenance_note','门禁电源模块已更换。'),
        DATE '2024-07-01', NULL, asset_update_cs_id, now(), editor_id, FALSE, NULL
    )
    RETURNING id INTO r_eq004_current;
    INSERT INTO changesets_changeentry (change_set_id, entity_id, action, data_before, data_after, valid_from, valid_to, new_record_id)
    SELECT asset_update_cs_id, eq004_id, 'update', before.data_payload, after.data_payload, after.valid_from, after.valid_to, after.id
    FROM temporal_temporalrecord before, temporal_temporalrecord after
    WHERE before.id = r_eq004_initial AND after.id = r_eq004_current;

    INSERT INTO temporal_temporalrecord (
        entity_id, schema_version, data_payload, valid_from, valid_to, change_set_id,
        recorded_at, recorded_by_id, is_superseded, superseded_by_id
    )
    VALUES (
        eq005_id, 1,
        jsonb_build_object('asset_no','EQ-2024-005','asset_name','会议平板','category','办公设备','status','在用','department','人力资源部','custodian',editor_id,'purchase_date','2023-11-18','original_value',9800,'location','培训教室 201','maintenance_note','演示样本：可在时间线上查看后续变更。'),
        DATE '2024-07-01', NULL, asset_update_cs_id, now(), editor_id, FALSE, NULL
    )
    RETURNING id INTO r_eq005_current;
    INSERT INTO changesets_changeentry (change_set_id, entity_id, action, data_before, data_after, valid_from, valid_to, new_record_id)
    SELECT asset_update_cs_id, eq005_id, 'update', before.data_payload, after.data_payload, after.valid_from, after.valid_to, after.id
    FROM temporal_temporalrecord before, temporal_temporalrecord after
    WHERE before.id = r_eq005_initial AND after.id = r_eq005_current;

    INSERT INTO changesets_changeset (
        schema_id, summary, status, approval_required, approver_id, approved_at,
        rejected_reason, created_at, created_by_id, applied_at, revert_of_id, source
    )
    VALUES
        (asset_schema_id, '旧设备报废确认', 'applied', FALSE, NULL, NULL, '', now(), owner_id, now(), NULL, 'manual')
    RETURNING id INTO asset_terminate_cs_id;

    INSERT INTO changesets_changeentry (
        change_set_id, entity_id, action, data_before, data_after, valid_from, valid_to, new_record_id
    )
    SELECT asset_terminate_cs_id, eq006_id, 'terminate', data_payload, NULL, DATE '2025-01-01', NULL, NULL
    FROM temporal_temporalrecord WHERE id = r_eq006;

    INSERT INTO temporal_entity (schema_id, business_code, created_at, created_by_id)
    VALUES (asset_schema_id, 'EQ-2025-009', now(), editor_id)
    RETURNING id INTO eq009_id;

    INSERT INTO changesets_changeset (
        schema_id, summary, status, approval_required, approver_id, approved_at,
        rejected_reason, created_at, created_by_id, applied_at, revert_of_id, source
    )
    VALUES
        (asset_schema_id, '待审批：新增实验室网关', 'submitted', TRUE, owner_id, NULL, '', now(), editor_id, NULL, NULL, 'manual')
    RETURNING id INTO asset_pending_cs_id;

    INSERT INTO changesets_changeentry (
        change_set_id, entity_id, action, data_before, data_after, valid_from, valid_to, new_record_id
    )
    VALUES (
        asset_pending_cs_id, eq009_id, 'create', NULL,
        jsonb_build_object('asset_no','EQ-2025-009','asset_name','实验室网关 L2','category','采集设备','status','在用','department','研发部','custodian',editor_id,'purchase_date','2023-11-18','original_value',15800,'location','实验室 L-02','maintenance_note','演示样本：可在时间线上查看后续变更。'),
        DATE '2025-02-01', NULL, NULL
    );

    INSERT INTO changesets_changeset (
        schema_id, summary, status, approval_required, approver_id, approved_at,
        rejected_reason, created_at, created_by_id, applied_at, revert_of_id, source
    )
    VALUES
        (staff_schema_id, '2024 年 1 月花名册', 'applied', FALSE, NULL, NULL, '', now(), owner_id, now(), NULL, 'manual')
    RETURNING id INTO staff_initial_cs_id;

    INSERT INTO temporal_entity (schema_id, business_code, created_at, created_by_id)
    VALUES (staff_schema_id, 'EMP-001', now(), owner_id) RETURNING id INTO emp001_id;
    INSERT INTO temporal_entity (schema_id, business_code, created_at, created_by_id)
    VALUES (staff_schema_id, 'EMP-002', now(), owner_id) RETURNING id INTO emp002_id;
    INSERT INTO temporal_entity (schema_id, business_code, created_at, created_by_id)
    VALUES (staff_schema_id, 'EMP-003', now(), owner_id) RETURNING id INTO emp003_id;
    INSERT INTO temporal_entity (schema_id, business_code, created_at, created_by_id)
    VALUES (staff_schema_id, 'EMP-004', now(), owner_id) RETURNING id INTO emp004_id;
    INSERT INTO temporal_entity (schema_id, business_code, created_at, created_by_id)
    VALUES (staff_schema_id, 'EMP-005', now(), owner_id) RETURNING id INTO emp005_id;
    INSERT INTO temporal_entity (schema_id, business_code, created_at, created_by_id)
    VALUES (staff_schema_id, 'EMP-006', now(), owner_id) RETURNING id INTO emp006_id;

    INSERT INTO temporal_temporalrecord (
        entity_id, schema_version, data_payload, valid_from, valid_to, change_set_id,
        recorded_at, recorded_by_id, is_superseded, superseded_by_id
    )
    VALUES (
        emp001_id, 1,
        jsonb_build_object('employee_no','EMP-001','name','林若溪','department','生产一部','job_title','班组长','employment_status','在职','city','上海','social_security_base',18000,'hr_owner',owner_id),
        DATE '2024-01-01', NULL, staff_initial_cs_id, now(), owner_id, FALSE, NULL
    ) RETURNING id INTO r_emp001;
    INSERT INTO temporal_temporalrecord (
        entity_id, schema_version, data_payload, valid_from, valid_to, change_set_id,
        recorded_at, recorded_by_id, is_superseded, superseded_by_id
    )
    VALUES (
        emp002_id, 1,
        jsonb_build_object('employee_no','EMP-002','name','陈一鸣','department','质量部','job_title','质检工程师','employment_status','在职','city','苏州','social_security_base',16500,'hr_owner',owner_id),
        DATE '2024-01-01', NULL, staff_initial_cs_id, now(), owner_id, FALSE, NULL
    ) RETURNING id INTO r_emp002;
    INSERT INTO temporal_temporalrecord (
        entity_id, schema_version, data_payload, valid_from, valid_to, change_set_id,
        recorded_at, recorded_by_id, is_superseded, superseded_by_id
    )
    VALUES (
        emp003_id, 1,
        jsonb_build_object('employee_no','EMP-003','name','周启航','department','仓储部','job_title','仓储专员','employment_status','试用','city','上海','social_security_base',9800,'hr_owner',owner_id),
        DATE '2024-01-01', DATE '2024-07-01', staff_initial_cs_id, now(), owner_id, FALSE, NULL
    ) RETURNING id INTO r_emp003_initial;
    INSERT INTO temporal_temporalrecord (
        entity_id, schema_version, data_payload, valid_from, valid_to, change_set_id,
        recorded_at, recorded_by_id, is_superseded, superseded_by_id
    )
    VALUES (
        emp004_id, 1,
        jsonb_build_object('employee_no','EMP-004','name','许知远','department','行政部','job_title','设施主管','employment_status','在职','city','杭州','social_security_base',14500,'hr_owner',owner_id),
        DATE '2024-01-01', DATE '2024-07-01', staff_initial_cs_id, now(), owner_id, FALSE, NULL
    ) RETURNING id INTO r_emp004_initial;
    INSERT INTO temporal_temporalrecord (
        entity_id, schema_version, data_payload, valid_from, valid_to, change_set_id,
        recorded_at, recorded_by_id, is_superseded, superseded_by_id
    )
    VALUES (
        emp005_id, 1,
        jsonb_build_object('employee_no','EMP-005','name','马晓青','department','人力资源部','job_title','HRBP','employment_status','在职','city','上海','social_security_base',15500,'hr_owner',owner_id),
        DATE '2024-01-01', NULL, staff_initial_cs_id, now(), owner_id, FALSE, NULL
    ) RETURNING id INTO r_emp005;
    INSERT INTO temporal_temporalrecord (
        entity_id, schema_version, data_payload, valid_from, valid_to, change_set_id,
        recorded_at, recorded_by_id, is_superseded, superseded_by_id
    )
    VALUES (
        emp006_id, 1,
        jsonb_build_object('employee_no','EMP-006','name','赵闻笛','department','安全部','job_title','安全专员','employment_status','在职','city','苏州','social_security_base',13200,'hr_owner',owner_id),
        DATE '2024-01-01', DATE '2024-07-01', staff_initial_cs_id, now(), owner_id, FALSE, NULL
    ) RETURNING id INTO r_emp006_initial;

    INSERT INTO changesets_changeentry (change_set_id, entity_id, action, data_before, data_after, valid_from, valid_to, new_record_id)
    SELECT staff_initial_cs_id, entity_id, 'create', NULL, data_payload, valid_from, valid_to, id
    FROM temporal_temporalrecord
    WHERE id IN (r_emp001, r_emp002, r_emp003_initial, r_emp004_initial, r_emp005, r_emp006_initial);

    INSERT INTO changesets_changeset (
        schema_id, summary, status, approval_required, approver_id, approved_at,
        rejected_reason, created_at, created_by_id, applied_at, revert_of_id, source
    )
    VALUES
        (staff_schema_id, '2024-07 演示批量调整', 'applied', FALSE, NULL, NULL, '', now(), editor_id, now(), NULL, 'manual')
    RETURNING id INTO staff_update_cs_id;

    INSERT INTO temporal_temporalrecord (
        entity_id, schema_version, data_payload, valid_from, valid_to, change_set_id,
        recorded_at, recorded_by_id, is_superseded, superseded_by_id
    )
    VALUES (
        emp003_id, 1,
        jsonb_build_object('employee_no','EMP-003','name','周启航','department','仓储部','job_title','仓储专员','employment_status','在职','city','上海','social_security_base',11200,'hr_owner',owner_id),
        DATE '2024-07-01', NULL, staff_update_cs_id, now(), editor_id, FALSE, NULL
    ) RETURNING id INTO r_emp003_current;
    INSERT INTO temporal_temporalrecord (
        entity_id, schema_version, data_payload, valid_from, valid_to, change_set_id,
        recorded_at, recorded_by_id, is_superseded, superseded_by_id
    )
    VALUES (
        emp004_id, 1,
        jsonb_build_object('employee_no','EMP-004','name','许知远','department','安全部','job_title','设施与安全主管','employment_status','在职','city','杭州','social_security_base',14500,'hr_owner',owner_id),
        DATE '2024-07-01', NULL, staff_update_cs_id, now(), editor_id, FALSE, NULL
    ) RETURNING id INTO r_emp004_current;
    INSERT INTO temporal_temporalrecord (
        entity_id, schema_version, data_payload, valid_from, valid_to, change_set_id,
        recorded_at, recorded_by_id, is_superseded, superseded_by_id
    )
    VALUES (
        emp006_id, 1,
        jsonb_build_object('employee_no','EMP-006','name','赵闻笛','department','生产二部','job_title','安全专员','employment_status','转岗','city','苏州','social_security_base',13200,'hr_owner',owner_id),
        DATE '2024-07-01', NULL, staff_update_cs_id, now(), editor_id, FALSE, NULL
    ) RETURNING id INTO r_emp006_current;

    INSERT INTO changesets_changeentry (change_set_id, entity_id, action, data_before, data_after, valid_from, valid_to, new_record_id)
    SELECT staff_update_cs_id, emp003_id, 'update', before.data_payload, after.data_payload, after.valid_from, after.valid_to, after.id
    FROM temporal_temporalrecord before, temporal_temporalrecord after
    WHERE before.id = r_emp003_initial AND after.id = r_emp003_current;
    INSERT INTO changesets_changeentry (change_set_id, entity_id, action, data_before, data_after, valid_from, valid_to, new_record_id)
    SELECT staff_update_cs_id, emp004_id, 'update', before.data_payload, after.data_payload, after.valid_from, after.valid_to, after.id
    FROM temporal_temporalrecord before, temporal_temporalrecord after
    WHERE before.id = r_emp004_initial AND after.id = r_emp004_current;
    INSERT INTO changesets_changeentry (change_set_id, entity_id, action, data_before, data_after, valid_from, valid_to, new_record_id)
    SELECT staff_update_cs_id, emp006_id, 'update', before.data_payload, after.data_payload, after.valid_from, after.valid_to, after.id
    FROM temporal_temporalrecord before, temporal_temporalrecord after
    WHERE before.id = r_emp006_initial AND after.id = r_emp006_current;

    INSERT INTO comments_commentthread (
        schema_id, anchor_type, entity_id, field_key, change_entry_id,
        created_at_context_date, record_at_creation_id, record_valid_from_snapshot,
        record_valid_to_snapshot, value_snapshot, status, created_by_id, created_at,
        updated_at, last_activity_at, resolved_by_id, resolved_at, comment_count
    )
    VALUES (
        asset_schema_id, 'cell', eq003_id, 'status', NULL,
        DATE '2024-07-01', r_eq003_current, DATE '2024-07-01', NULL,
        '"维修"'::jsonb, 'open', editor_id, now(), now(), now(), NULL, NULL, 2
    )
    RETURNING id INTO thread_id;

    INSERT INTO comments_comment (
        thread_id, body, body_format, created_by_id, created_at, edited_at, deleted_at, is_system
    )
    VALUES (
        thread_id, '演示评论：这台折弯机已进入维修，请负责人确认预计恢复时间。',
        'plain', editor_id, now(), NULL, NULL, FALSE
    )
    RETURNING id INTO comment_id;
    INSERT INTO comments_commentmention (comment_id, user_id, created_at)
    VALUES (comment_id, owner_id, now());

    INSERT INTO comments_comment (
        thread_id, body, body_format, created_by_id, created_at, edited_at, deleted_at, is_system
    )
    VALUES (
        thread_id, '已确认，维修计划排在本周五，完成后在当前视图更新状态。',
        'plain', owner_id, now(), NULL, NULL, FALSE
    )
    RETURNING id INTO comment_id;
    INSERT INTO comments_commentmention (comment_id, user_id, created_at)
    VALUES (comment_id, editor_id, now());

    INSERT INTO comments_commentreadstate (thread_id, user_id, last_read_at)
    VALUES (thread_id, editor_id, now()), (thread_id, owner_id, now());

    INSERT INTO labels_entitylabel (
        label_code, entity_id, schema_id, status, template_code, issued_at, issued_by_id,
        printed_at, printed_by_id, revoked_at, revoked_by_id, revoked_reason, replaced_by_id,
        last_scanned_at, scan_count, print_snapshot, metadata, created_at, updated_at
    )
    VALUES
        ('CT-L-ABCD-EFGH-JKLM-NPQR', eq001_id, asset_schema_id, 'active', 'asset_standard', now(), owner_id, NULL, NULL, NULL, NULL, '', NULL, now() - interval '1 day', 1, '{}'::jsonb, '{}'::jsonb, now(), now()),
        ('CT-L-STUV-WXYZ-2345-6789', eq002_id, asset_schema_id, 'active', 'asset_standard', now(), owner_id, NULL, NULL, NULL, NULL, '', NULL, now() - interval '2 day', 2, '{}'::jsonb, '{}'::jsonb, now(), now()),
        ('CT-L-BCDF-GHJK-LMNP-QRST', eq003_id, asset_schema_id, 'active', 'asset_standard', now(), owner_id, NULL, NULL, NULL, NULL, '', NULL, now() - interval '3 day', 3, '{}'::jsonb, '{}'::jsonb, now(), now()),
        ('CT-L-VWXY-Z234-5678-9ABC', eq004_id, asset_schema_id, 'active', 'asset_standard', now(), owner_id, NULL, NULL, NULL, NULL, '', NULL, NULL, 0, '{}'::jsonb, '{}'::jsonb, now(), now()),
        ('CT-L-CDEF-GHJK-MNPQ-RSTU', eq005_id, asset_schema_id, 'active', 'asset_standard', now(), owner_id, NULL, NULL, NULL, NULL, '', NULL, NULL, 0, '{}'::jsonb, '{}'::jsonb, now(), now());

    SELECT id INTO label_id FROM labels_entitylabel WHERE label_code = 'CT-L-ABCD-EFGH-JKLM-NPQR';
    INSERT INTO labels_labelscanevent (
        label_id, label_code_hash, actor_id, entity_id, schema_id, outcome, source,
        ip_hash, user_agent, raw_input_kind, created_at
    )
    VALUES (
        label_id, 'sha256:175f4418983c9ae96cb33ae5f791464c23b6e3e73f66059fdfc40e96add6a8a9',
        viewer_id, eq001_id, asset_schema_id, 'resolved', 'scanner_console', '', '', 'code', now()
    );
    SELECT id INTO label_id FROM labels_entitylabel WHERE label_code = 'CT-L-STUV-WXYZ-2345-6789';
    INSERT INTO labels_labelscanevent (
        label_id, label_code_hash, actor_id, entity_id, schema_id, outcome, source,
        ip_hash, user_agent, raw_input_kind, created_at
    )
    VALUES (
        label_id, 'sha256:51c0c726af37da88326c3ba6df9d686d07a6288e15dbe208f1aa2613bf58a917',
        viewer_id, eq002_id, asset_schema_id, 'resolved', 'scanner_console', '', '', 'code', now()
    );
    SELECT id INTO label_id FROM labels_entitylabel WHERE label_code = 'CT-L-BCDF-GHJK-LMNP-QRST';
    INSERT INTO labels_labelscanevent (
        label_id, label_code_hash, actor_id, entity_id, schema_id, outcome, source,
        ip_hash, user_agent, raw_input_kind, created_at
    )
    VALUES (
        label_id, 'sha256:bb27515ccb81c65b0b4b52eaa88195a15094f25e3c00787b4a3c6156640cb5c2',
        viewer_id, eq003_id, asset_schema_id, 'resolved', 'scanner_console', '', '', 'code', now()
    );

    INSERT INTO workbench_workbenchitem (
        owner_id, type, title, summary, tags, is_pinned, is_archived, is_sensitive,
        deleted_at, last_used_at, created_at, updated_at
    )
    VALUES (
        owner_id, 'note', '演示-讲解提纲',
        '演示当前视图、时间线、变更审批、评论和标签扫码。',
        '["demo"]'::jsonb, TRUE, FALSE, FALSE, NULL, now(), now(), now()
    )
    RETURNING id INTO note_item_id;
    INSERT INTO workbench_workbenchnotedetail (item_id, markdown_content, stage, status)
    VALUES (
        note_item_id,
        '1. 打开设备资产台账
2. 切换 2024-01 与 2024-07
3. 查看评论与待审批变更
4. 扫描资产标签',
        'other',
        'normal'
    );

    INSERT INTO workbench_workbenchitem (
        owner_id, type, title, summary, tags, is_pinned, is_archived, is_sensitive,
        deleted_at, last_used_at, created_at, updated_at
    )
    VALUES (
        owner_id, 'data_card', '演示-资产状态口径', '状态字段取值说明。',
        '["demo"]'::jsonb, FALSE, FALSE, FALSE, NULL, now(), now(), now()
    )
    RETURNING id INTO card_item_id;
    INSERT INTO workbench_workbenchdatacarddetail (
        item_id, category, applicable_year, applicable_region, applicable_subject,
        effective_from, effective_to, status, remark
    )
    VALUES (
        card_item_id, 'common_text', NULL, '', '', NULL, NULL, 'confirmed', ''
    )
    RETURNING id INTO card_detail_id;
    INSERT INTO workbench_workbenchdatacardfield (
        card_id, name, value, value_type, unit, remark, sort_order, created_at, updated_at
    )
    VALUES
        (card_detail_id, '在用', '资产正常投入业务使用', 'text', '', '', 0, now(), now()),
        (card_detail_id, '维修', '资产暂不可用，需要后续复核', 'text', '', '', 1, now(), now()),
        (card_detail_id, '闲置', '资产可调拨或重新分配', 'text', '', '', 2, now(), now());

    INSERT INTO workbench_workbenchitem (
        owner_id, type, title, summary, tags, is_pinned, is_archived, is_sensitive,
        deleted_at, last_used_at, created_at, updated_at
    )
    VALUES (
        owner_id, 'material', '演示-资产标签模板 PDF', '用于说明物理标签打印流程。',
        '["demo"]'::jsonb, FALSE, FALSE, FALSE, NULL, now(), now(), now()
    )
    RETURNING id INTO material_item_id;
    INSERT INTO workbench_workbenchmaterialdetail (
        item_id, file, original_name, content_type, size, checksum, description,
        preview_status, created_at, updated_at
    )
    VALUES (
        material_item_id, '', 'demo-asset-label-template.pdf', 'application/pdf',
        245760, 'demo-seed-label-template', '演示用占位材料，不包含真实文件。',
        'none', now(), now()
    );

    INSERT INTO workbench_workbenchlink (
        owner_id, source_item_id, target_item_id, target_schema_id, created_at
    )
    VALUES
        (owner_id, note_item_id, NULL, asset_schema_id, now()),
        (owner_id, note_item_id, NULL, staff_schema_id, now()),
        (owner_id, card_item_id, NULL, asset_schema_id, now()),
        (owner_id, material_item_id, NULL, asset_schema_id, now());

    INSERT INTO workbench_workbenchmaterialchecklistitem (
        owner_id, schema_id, title, status, linked_material_id, note, sort_order,
        created_at, updated_at
    )
    VALUES (
        owner_id, asset_schema_id, '资产导入模板已确认', 'uploaded', material_item_id,
        '演示样本：材料条目与资产台账关联。', 1, now(), now()
    );

    INSERT INTO notifications_notification (
        recipient_id, actor_id, type, severity, title, body, target_kind, target_id,
        target_url, payload, dedupe_key, read_at, archived_at, created_at, expires_at
    )
    VALUES
        (
            owner_id, editor_id, 'comment_mention', 'info', '你被提及',
            '演示编辑员在评论中提到了你：演示-设备资产台账',
            'comment_thread', thread_id::text,
            '/schemas/' || asset_schema_id || '/records?comment_thread=' || thread_id,
            jsonb_build_object('schema_id', asset_schema_id, 'thread_id', thread_id),
            'demo_comment_mention:' || thread_id || ':' || owner_id,
            NULL, NULL, now(), NULL
        ),
        (
            editor_id, owner_id, 'comment_reply', 'info', '评论有新回复',
            '演示表负责人回复了你参与的评论：演示-设备资产台账',
            'comment_thread', thread_id::text,
            '/schemas/' || asset_schema_id || '/records?comment_thread=' || thread_id,
            jsonb_build_object('schema_id', asset_schema_id, 'thread_id', thread_id),
            'demo_comment_reply:' || thread_id || ':' || editor_id,
            NULL, NULL, now(), NULL
        ),
        (
            viewer_id, owner_id, 'system_notice', 'info', '演示数据已准备',
            '可以从设备资产台账进入当前视图、时间线和标签扫码演示。',
            'schema', asset_schema_id::text,
            '/schemas/' || asset_schema_id || '/records',
            jsonb_build_object('schema_id', asset_schema_id, 'demo_seed', TRUE),
            'demo_seed_ready:' || asset_schema_id || ':' || viewer_id,
            NULL, NULL, now(), NULL
        );

    RAISE NOTICE 'ChronoTrace demo SQL seed completed. Users: demo_owner / demo_editor / demo_viewer, password: DemoPass123!';
END $$;

COMMIT;

