class ChangeSetInvalidState(ValueError):  # noqa: N818 - public API named by M1 tests/spec.
    """ChangeSet 状态不允许执行当前操作。"""
