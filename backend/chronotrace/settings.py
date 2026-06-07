"""
ChronoTrace Django settings.

环境变量通过 .env 文件加载(python-decouple),生产环境替换对应值即可。
敏感值不要 commit 到仓库。
"""

from pathlib import Path

from decouple import Csv, config

BASE_DIR = Path(__file__).resolve().parent.parent

# ─── 基础 ─────────────────────────────────────────────
SECRET_KEY = config("SECRET_KEY", default="dev-insecure-key-change-in-production")
DEBUG = config("DEBUG", default=True, cast=bool)
ALLOWED_HOSTS = config("ALLOWED_HOSTS", default="localhost,127.0.0.1", cast=Csv())

# ─── Application ──────────────────────────────────────
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.postgres",
    # 3rd
    "rest_framework",
    "corsheaders",
    "drf_spectacular",
    # local
    "apps.accounts",
    "apps.schemas",
    "apps.temporal",
    "apps.changesets",
    "apps.audit",
    "apps.imports",
    "apps.stats",
    "apps.labels",
    "apps.workbench",
    "apps.comments",
    "apps.notifications",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "chronotrace.urls"
WSGI_APPLICATION = "chronotrace.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# ─── Database ─────────────────────────────────────────
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": config("DB_NAME", default="chronotrace_dev"),
        "USER": config("DB_USER", default="chronotrace"),
        "PASSWORD": config("DB_PASSWORD", default="chronotrace_dev"),
        "HOST": config("DB_HOST", default="localhost"),
        "PORT": config("DB_PORT", default="5432"),
    }
}

# ─── Auth ─────────────────────────────────────────────
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# ─── I18n ─────────────────────────────────────────────
LANGUAGE_CODE = "zh-hans"
TIME_ZONE = "Asia/Shanghai"
USE_I18N = True
USE_TZ = True

# ─── Static ───────────────────────────────────────────
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ─── Export jobs ─────────────────────────────────────
EXPORT_LARGE_ROW_THRESHOLD = config("EXPORT_LARGE_ROW_THRESHOLD", default=5000, cast=int)
EXPORT_MAX_ACTIVE_JOBS_PER_USER = config("EXPORT_MAX_ACTIVE_JOBS_PER_USER", default=3, cast=int)
EXPORT_JOB_RETENTION_DAYS = config("EXPORT_JOB_RETENTION_DAYS", default=30, cast=int)

# ─── DRF ──────────────────────────────────────────────
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 50,
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
}

SPECTACULAR_SETTINGS = {
    "TITLE": "ChronoTrace API",
    "DESCRIPTION": "ChronoTrace · 数据版本与演进管理平台 API",
    "VERSION": "0.1.0",
    "SERVE_INCLUDE_SCHEMA": False,
}

# ─── CORS (开发用,生产收紧) ──────────────────────────
CORS_ALLOWED_ORIGINS = config(
    "CORS_ALLOWED_ORIGINS",
    default="http://localhost:5173,http://127.0.0.1:5173",
    cast=Csv(),
)
CORS_ALLOW_CREDENTIALS = True
CSRF_TRUSTED_ORIGINS = config(
    "CSRF_TRUSTED_ORIGINS",
    default="http://localhost:5173,http://127.0.0.1:5173",
    cast=Csv(),
)

# ─── Session ──────────────────────────────────────────
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_AGE = 60 * 60 * 8  # 8 小时
CSRF_COOKIE_SAMESITE = "Lax"

# ─── Third-party OAuth ────────────────────────────────
OAUTH_AUTO_REGISTER_ENABLED = config("OAUTH_AUTO_REGISTER_ENABLED", default=True, cast=bool)
OAUTH_ENABLED_PROVIDERS = set(
    config("OAUTH_ENABLED_PROVIDERS", default="github,wechat_miniprogram", cast=Csv())
)
OAUTH_STATE_TTL_SECONDS = config("OAUTH_STATE_TTL_SECONDS", default=600, cast=int)
OAUTH_ALLOW_WECHAT_UNIONID_AUTO_MERGE = config(
    "OAUTH_ALLOW_WECHAT_UNIONID_AUTO_MERGE", default=False, cast=bool
)

OAUTH_GITHUB_CLIENT_ID = config("OAUTH_GITHUB_CLIENT_ID", default="")
OAUTH_GITHUB_CLIENT_SECRET = config("OAUTH_GITHUB_CLIENT_SECRET", default="")
OAUTH_GITHUB_CALLBACK_URL = config("OAUTH_GITHUB_CALLBACK_URL", default="")

OAUTH_WECHAT_WEB_APP_ID = config("OAUTH_WECHAT_WEB_APP_ID", default="")
OAUTH_WECHAT_WEB_APP_SECRET = config("OAUTH_WECHAT_WEB_APP_SECRET", default="")
OAUTH_WECHAT_WEB_CALLBACK_URL = config("OAUTH_WECHAT_WEB_CALLBACK_URL", default="")

OAUTH_WECHAT_MINI_APP_ID = config("OAUTH_WECHAT_MINI_APP_ID", default="")
OAUTH_WECHAT_MINI_APP_SECRET = config("OAUTH_WECHAT_MINI_APP_SECRET", default="")

OAUTH_DINGTALK_CLIENT_ID = config("OAUTH_DINGTALK_CLIENT_ID", default="")
OAUTH_DINGTALK_CLIENT_SECRET = config("OAUTH_DINGTALK_CLIENT_SECRET", default="")
OAUTH_DINGTALK_CALLBACK_URL = config("OAUTH_DINGTALK_CALLBACK_URL", default="")
OAUTH_DINGTALK_ALLOWED_CORP_IDS = set(
    config("OAUTH_DINGTALK_ALLOWED_CORP_IDS", default="", cast=Csv())
)

OAUTH_QQ_WEB_APP_ID = config("OAUTH_QQ_WEB_APP_ID", default="")
OAUTH_QQ_WEB_APP_KEY = config("OAUTH_QQ_WEB_APP_KEY", default="")
OAUTH_QQ_WEB_CALLBACK_URL = config("OAUTH_QQ_WEB_CALLBACK_URL", default="")

OAUTH_QQ_MINI_APP_ID = config("OAUTH_QQ_MINI_APP_ID", default="")
OAUTH_QQ_MINI_APP_SECRET = config("OAUTH_QQ_MINI_APP_SECRET", default="")

# ─── Logging ──────────────────────────────────────────
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": "INFO",
    },
}
