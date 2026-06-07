from dataclasses import dataclass


@dataclass(frozen=True)
class ValidationIssue:
    path: str
    code: str
    message: str


class FieldValidationError(ValueError):
    """字段配置或数据载荷校验失败。"""

    def __init__(self, issues: list[ValidationIssue]):
        self.issues = issues
        summary = "; ".join(f"{issue.path}: {issue.code}" for issue in issues)
        super().__init__(summary)


def issue(path: str, code: str, message: str) -> ValidationIssue:
    return ValidationIssue(path=path, code=code, message=message)
